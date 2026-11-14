"""Exercise the public import workcell through real HTTP requests.

Run after deployment: python scripts/verify_live_import.py
The generated workspace capability is kept in memory and never printed.
"""
import argparse
import json
from pathlib import Path
import secrets
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://demo.tryvivacity.com/runtime')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    token = secrets.token_hex(32)
    sample = Path(__file__).resolve().parents[1] / 'fixtures/imports/vivacity_sample_arm.xml'

    def request(method, path, body=None, *, other_owner=False):
        headers = {'X-Workspace-Token': secrets.token_hex(32) if other_owner else token}
        if isinstance(body, dict):
            body = json.dumps(body, separators=(',', ':')).encode()
            headers['Content-Type'] = 'application/json'
        elif body is not None:
            headers['Content-Type'] = 'application/octet-stream'
        call = Request(base + path, data=body, headers=headers, method=method)
        try:
            with urlopen(call, timeout=90) as response:
                data = response.read()
                return response.status, (json.loads(data) if response.headers.get_content_type() == 'application/json' else data)
        except HTTPError as error:
            return error.code, error.read()

    status, uploaded = request('POST', '/v1/imports?filename=' + quote(sample.name), sample.read_bytes())
    assert status == 201, (status, uploaded)
    identifier = uploaded['id']
    path = '/v1/imports/' + quote(identifier)
    config = {'name': 'Public sample movement smoke test', 'environment': 'tabletop',
              'task': 'movement', 'end_effector_body': 'tool', 'gripper': 'none',
              'gripper_strength_n': 40, 'robot_base_offset_m': [0, 0, 0],
              'pickup_position_m': [.45, -.15, .08], 'destination_position_m': [.45, .18, .08],
              'object_half_size_m': [.03, .03, .03], 'object_mass_kg': .08,
              'sliding_friction': .8, 'cad_longest_dimension_m': .6}
    status, configured = request('PUT', path + '/test-cell', config)
    assert status == 200 and configured['status'] == 'test_cell_configured', (status, configured)
    status, queued = request('POST', path + '/task-trials')
    assert status == 202, (status, queued)
    trial_id = queued['task_trial']['id']
    trial_path = path + '/task-trials/' + quote(trial_id)
    cursor = -1
    frames = []
    saw_live = False
    observed_updates = []
    scene = None
    deadline = time.monotonic() + 130
    while time.monotonic() < deadline:
        status, update = request('GET', trial_path + f'/frames?after={cursor}&limit=16')
        assert status == 200, (status, update)
        frames.extend(update['frames'])
        observed_updates.append((update['status'], len(update['frames'])))
        cursor = update['next_cursor']
        saw_live |= update['status'] == 'task_running' and bool(update['frames'])
        if scene is None:
            scene_status, candidate = request('GET', trial_path + '/scene')
            if scene_status == 200:
                scene = candidate
                mesh_status, mesh = request('GET', trial_path + '/meshes.bin')
                assert mesh_status == 200 and isinstance(mesh, bytes)
                assert request('GET', trial_path + '/scene', other_owner=True)[0] == 403
                assert request('GET', trial_path + '/meshes.bin', other_owner=True)[0] == 403
            else:
                assert scene_status == 404, (scene_status, candidate)
        if update['status'] != 'task_running':
            break
        time.sleep(.25)
    else:
        raise AssertionError('task did not reach a terminal status within 130 seconds')

    assert scene is not None and scene['source'] == 'compiled_mujoco_model'
    assert saw_live and len(frames) > 2, observed_updates
    assert [frame['seq'] for frame in frames] == list(range(len(frames)))
    assert all(len(frame['positions_m']) == len(scene['bodies']) - 1 for frame in frames)
    assert any(event['body_id'] == 4 and event['code'] == 'actuator_force_limit'
               for frame in frames for event in frame['events'])
    status, record = request('GET', path)
    assert status == 200 and record['status'] == 'task_succeeded', (status, record)
    print(json.dumps({'url': base, 'import_id': identifier, 'trial_id': trial_id,
                      'status': record['status'], 'live_frames_before_completion': saw_live,
                      'frame_count': len(frames), 'physics_steps': record['task_trial']['measurements']['physics_steps'],
                      'scene_bodies': len(scene['bodies']), 'model_hash': scene['model_hash'],
                      'owner_isolation': 'scene and meshes denied to another owner'}, indent=2))


if __name__ == '__main__':
    main()
