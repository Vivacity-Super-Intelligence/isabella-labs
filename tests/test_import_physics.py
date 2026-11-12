import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import time

import pytest
from fastapi.testclient import TestClient

from vivacity.api import create_app
from vivacity.imports import ImportService, unpack
from vivacity.import_physics import native_probe, ORBITAL_SHA256
from vivacity.import_worker import probe

FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures/imports/orbital_salvage_lab.zip'


def source(data=None):
    entry, content, assets, _ = unpack(data or FIXTURE.read_bytes())
    return {'entrypoint': entry, 'content': base64.b64encode(content).decode(),
            'assets': {k: base64.b64encode(v).decode() for k, v in assets.items()}}


def test_original_orbital_model_compiles_and_actuates_without_claiming_grasp():
    result = native_probe(source(), ORBITAL_SHA256)
    assert result['physics_model_valid'] and result['robot_actuation_verified']
    assert result['simulation_steps'] == 125 and result['joint_displacement'] > .01
    assert len(result['actuators']) == 3
    assert result['task_execution_verified'] is False
    assert result['state_encoding'] == 'mjSTATE_INTEGRATION'
    assert result['initial_state'] != result['final_state']
    qualification = result['qualification']
    assert qualification['verdict'] in ('passed', 'passed_with_warnings')
    assert qualification['failure_class'] == 'none'
    assert len(qualification['tests']) == 6
    assert qualification['frames'][0]['phase'] == 'gravity_settle'
    assert qualification['frames'][-1]['phase'] == 'actuator_probe'


def test_bad_free_robot_fails_measured_gravity_settle_without_fake_success():
    xml = b'''<mujoco model="bad_robot"><option timestep="0.004" gravity="0 0 -9.81"/>
    <worldbody><body name="loose_base" pos="0 0 1"><freejoint/>
      <geom type="box" size=".08 .08 .08" mass="1"/>
      <body name="loose_link" pos="0 0 .2"><joint type="hinge" range="-1 1"/>
        <geom type="capsule" size=".03 .12" mass=".2"/></body>
    </body></worldbody></mujoco>'''
    result = probe({'xml': base64.b64encode(xml).decode(), 'assets': {}, 'trusted_fixture': True})
    qualification = result['qualification']
    assert qualification['verdict'] == 'failed'
    assert qualification['failure_class'] == 'unstable_under_gravity'
    assert qualification['measurements']['max_body_drop_m'] > .25
    assert qualification['frames'][0]['positions_m'] != qualification['frames'][-1]['positions_m']


def test_fixed_robot_without_actuators_is_reported_unactuated():
    xml = b'''<mujoco model="unactuated"><option timestep="0.004"/>
    <worldbody><body name="base"><geom type="box" size=".1 .1 .1" mass="1"/>
      <body name="link"><joint type="hinge" range="-1 1"/>
        <geom type="capsule" size=".03 .12" mass=".2"/></body>
    </body></worldbody></mujoco>'''
    result = probe({'xml': base64.b64encode(xml).decode(), 'assets': {}, 'trusted_fixture': True})
    assert result['qualification']['verdict'] == 'failed'
    assert result['qualification']['failure_class'] == 'unactuated'


def test_native_verification_is_explicit_background_work_and_persists(tmp_path):
    service = ImportService(tmp_path)
    record = service.create('orbital.zip', FIXTURE.read_bytes())
    assert record['physics_ready'] is False
    with ThreadPoolExecutor(max_workers=1) as executor:
        queued = service.verify(record['id'], executor)
        assert queued['status'] == 'physics_verifying'
        deadline = time.monotonic() + 30
        while service.get(record['id'])['status'] == 'physics_verifying':
            assert time.monotonic() < deadline
            time.sleep(.02)
    final = service.get(record['id'])
    assert final['status'] == 'actuation_verified'
    assert final['physics_ready'] is False  # A probe is not a configured task.
    assert ImportService(tmp_path).get(record['id']) == final


def test_restart_does_not_claim_an_interrupted_probe_completed(tmp_path):
    service = ImportService(tmp_path)
    record = service.create('orbital.zip', FIXTURE.read_bytes())
    payload = service._load(record['id'])
    payload['record']['status'] = 'physics_verifying'
    service._save(payload)
    restored = ImportService(tmp_path).get(record['id'])
    assert restored['status'] == 'physics_failed'
    assert 'interrupted' in restored['diagnostics'][-1]


def test_robot_qualification_http_contract_returns_measured_report(tmp_path):
    with TestClient(create_app(tmp_path / 'qualification.sqlite3')) as client:
        uploaded = client.post('/v1/imports?filename=orbital.zip', content=FIXTURE.read_bytes(),
                               headers={'Content-Type': 'application/octet-stream'})
        assert uploaded.status_code == 201, uploaded.text
        identifier = uploaded.json()['id']
        queued = client.post(f'/v1/imports/{identifier}/qualification')
        assert queued.status_code == 202, queued.text
        deadline = time.monotonic() + 30
        while True:
            response = client.get(f'/v1/imports/{identifier}')
            assert response.status_code == 200, response.text
            record = response.json()
            if record['status'] != 'physics_verifying':
                break
            assert time.monotonic() < deadline
            time.sleep(.02)
        report = record['capabilities']['qualification']
        assert report['schema_version'] == 'vivacity.robot-qualification/1.0'
        assert report['verdict'] in ('passed', 'passed_with_warnings')
        assert len(report['frames']) >= 2
        assert report['measurements']['position_actuators_tested'] >= 1


@pytest.mark.parametrize('unsafe', [
    '<mujoco><compiler meshdir="/etc"/></mujoco>',
    '<mujoco><asset><texture type="2d" builtin="flat" width="100000" height="100000"/></asset></mujoco>',
    '<mujoco><size memory="1024M"/></mujoco>',
    '<mujoco><include file="private.xml"/></mujoco>',
])
def test_unsafe_native_descriptions_fail_before_process_creation(unsafe):
    value = {'entrypoint': 'scene.xml', 'content': base64.b64encode(unsafe.encode()).decode(), 'assets': {}}
    with pytest.raises(ValueError):
        native_probe(value, 'untrusted')


@pytest.mark.skipif(not sys.platform.startswith('linux'), reason='Linux syscall sandbox boundary')
def test_linux_filter_denies_host_files_network_and_children():
    worker = Path(__file__).resolve().parents[1] / 'vivacity/import_worker.py'
    program = f'''import importlib.util, socket, subprocess, sys, json
spec=importlib.util.spec_from_file_location('worker',{str(worker)!r});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.restrict_linux()
denied=[]
for operation in (lambda:open('/proc/self/environ','rb'),lambda:socket.socket(),lambda:subprocess.run([sys.executable,'-c','pass'])):
    try:operation()
    except PermissionError:denied.append(True)
    else:denied.append(False)
print(json.dumps(denied))
'''
    result = subprocess.run([sys.executable, '-I', '-c', program], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == [True, True, True]
