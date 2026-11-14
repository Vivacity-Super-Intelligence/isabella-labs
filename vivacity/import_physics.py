"""Only validated in-memory model data crosses the native-process boundary."""
import base64
import json
import os
from pathlib import PurePosixPath, Path
import queue
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as ET

from .imports import inspect_xml, safe_name

ORBITAL_SHA256 = '6d623c9fbd7aa337b195282f55dbbcc83432ffad69a95090dde2a831a4763354'


def _run_native_worker(source, source_sha256, task_config=None, on_progress=None):
    content = base64.b64decode(source['content'], validate=True)
    assets = {name: base64.b64decode(value, validate=True) for name, value in source['assets'].items()}
    extension = PurePosixPath(source['entrypoint']).suffix.lower()
    inspect_xml(content, extension, assets)
    root = ET.fromstring(content.decode('utf-8-sig'))
    # Bound allocations that structural inspection alone cannot constrain.
    for node in root.iter():
        if node.tag in ('composite', 'flexcomp', 'skin', 'keyframe'):
            raise ValueError('this native worker does not support generated deformable or keyframe assets')
        allocation_keys = ('nrow', 'ncol') if node.tag == 'hfield' else ('width', 'height') if node.tag == 'texture' else ()
        for key in allocation_keys + (('nconmax', 'njmax', 'memory') if node.tag == 'size' else ()):
            if key in node.attrib:
                try:
                    number = int(node.attrib[key])
                except ValueError:
                    raise ValueError('native allocation attributes must be bounded integers')
                if not 1 <= number <= (512 if key in ('width', 'height','nrow','ncol') else 2048):
                    raise ValueError('native allocation exceeds probe bounds')
        if node.tag == 'compiler':
            for key in ('meshdir', 'texturedir', 'assetdir'):
                if key in node.attrib:
                    safe_name(node.attrib[key])
        for key in ('file', 'filename'):
            if key in node.attrib:
                if node.attrib[key] not in assets:
                    raise ValueError('native asset must exist in the scoped in-memory bundle')
    trusted = source_sha256 == ORBITAL_SHA256
    if not sys.platform.startswith('linux') and not trusted:
        raise ValueError('untrusted native execution requires the Linux sandbox; only the exact supplied fixture is enabled on this development host')
    environment = {key: os.environ[key] for key in ('SYSTEMROOT', 'WINDIR') if key in os.environ}
    environment |= {'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1', 'PYTHONIOENCODING': 'utf-8'}
    payload = {'xml': base64.b64encode(content).decode(),
               'assets': source['assets'], 'trusted_fixture': trusted}
    if task_config is not None:
        payload['task_config'] = task_config
    process = None
    try:
        import tempfile
        with tempfile.TemporaryDirectory(prefix='vivacity-native-') as directory:
            command = [sys.executable, '-I', '-u', str(Path(__file__).with_name('import_worker.py'))]
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, cwd=directory, env=environment, close_fds=True,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            encoded_payload = json.dumps(payload, separators=(',', ':')).encode('utf-8')
            if len(encoded_payload) > 48 * 1024**2:
                process.kill(); raise ValueError('native worker input exceeds its 48 MiB bound')
            process.stdin.write(encoded_payload); process.stdin.close()
            messages = queue.Queue(maxsize=64)
            output_bytes = [0]
            output_limit = 24 * 1024**2 if task_config is not None else 1024**2
            def read_output():
                try:
                    for line in process.stdout:
                        output_bytes[0] += len(line)
                        if output_bytes[0] > output_limit:
                            messages.put(('overflow', None)); process.kill(); return
                        messages.put(('line', line))
                except Exception:
                    pass
                finally:
                    messages.put(('eof', None))
            reader = threading.Thread(target=read_output, daemon=True)
            reader.start()
            deadline = time.monotonic() + 120
            response = None
            while True:
                remaining = deadline-time.monotonic()
                if remaining <= 0:
                    process.kill(); raise ValueError('native probe exceeded its 120-second wall bound')
                try: kind, value = messages.get(timeout=min(remaining, 1.0))
                except queue.Empty:
                    if process.poll() is not None:
                        continue
                    continue
                if kind == 'overflow':
                    raise ValueError('native probe failed its process/resource limits')
                if kind == 'eof':
                    break
                try:
                    message = json.loads(value)
                except (ValueError, TypeError, UnicodeError):
                    process.kill(); raise ValueError('native probe returned an invalid bounded response') from None
                if message.get('type') == 'progress':
                    if on_progress is not None:
                        on_progress(message)
                elif message.get('type') == 'result' or 'ok' in message:
                    response = message
            return_code = process.wait(timeout=max(.1, deadline-time.monotonic()))
            if response is None:
                raise ValueError('native probe returned no final result')
            if return_code or not response.get('ok'):
                error = response.get('error', 'native probe failed')
                if str(Path(__file__).parent) in error or directory in error:
                    error = 'native probe failed'
                raise ValueError(error)
            return response['result'] | {'source_sha256': source_sha256}
    except subprocess.TimeoutExpired:
        try: process.kill()
        except Exception: pass
        raise ValueError('native probe exceeded its 120-second wall bound') from None
    except Exception:
        if process is not None and process.poll() is None:
            process.kill()
        raise


def native_probe(source, source_sha256):
    return _run_native_worker(source, source_sha256)


def native_task_trial(source, source_sha256, task_config, on_progress=None):
    """Run an explicitly configured task in the same bounded native worker."""
    return _run_native_worker(source, source_sha256, task_config, on_progress=on_progress)
