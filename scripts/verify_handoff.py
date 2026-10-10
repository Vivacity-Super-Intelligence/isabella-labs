"""Verify exported contracts/assets against live HTTP/WS and numerical evidence."""
import asyncio
import json
from pathlib import Path
import time

import httpx
import mujoco as mj
import numpy as np
from scipy.spatial.transform import Rotation
import websockets

from vivacity.robotics import RoboticsBackend
from vivacity.science import orbit


async def browser_websockets(experiment_id):
    url = f'ws://127.0.0.1:8000/v1/experiments/{experiment_id}/events'
    events = []
    async with websockets.connect(url, origin='http://localhost:5173') as ws:
        async for message in ws:
            events.append(json.loads(message))
    assert events[-1]['kind'] == 'completed'
    try:
        async with websockets.connect(url, origin='https://unapproved.example'):
            raise AssertionError('unapproved origin accepted')
    except websockets.exceptions.InvalidStatus as exc:
        assert exc.response.status_code == 403
    return events


def main():
    evidence = json.loads(Path('artifacts/final-demo.json').read_text())
    manifest = json.loads(Path('docs/robot-geometry.json').read_text())
    buffer = Path('docs/robot-meshes.bin').read_bytes()
    backend = RoboticsBackend()
    first = evidence['experiments'][0]
    selected = next(b for b in first['branches'] if b['id'] == first['experiment']['selected_branch_id'])
    world = backend.fork(selected['final_state'])
    mj.mj_forward(world.model, world.data)
    assert manifest['model_hash'] == world.model_hash
    for mesh in manifest['meshes']:
        i = mesh['id']
        va, vn = int(world.model.mesh_vertadr[i]), int(world.model.mesh_vertnum[i])
        fa, fn = int(world.model.mesh_faceadr[i]), int(world.model.mesh_facenum[i])
        positions = np.frombuffer(buffer, dtype='<f4', count=mesh['positions']['count'], offset=mesh['positions']['byte_offset']).reshape(-1, 3)
        faces = np.frombuffer(buffer, dtype='<u4', count=mesh['indices']['count'], offset=mesh['indices']['byte_offset']).reshape(-1, 3)
        np.testing.assert_array_equal(positions, world.model.mesh_vert[va:va+vn])
        np.testing.assert_array_equal(faces, world.model.mesh_face[fa:fa+fn])
        assert int(faces.max()) < vn
    transforms = {t['name']: t for t in selected['trace'][-1]['body_transforms']}
    max_error = 0.
    for geom in manifest['geoms']:
        body = manifest['bodies'][geom['body_id']]
        pose = transforms.get(body['name'], {'position': [0, 0, 0], 'quaternion_wxyz': [1, 0, 0, 0]})
        w, x, y, z = pose['quaternion_wxyz']
        rotation = Rotation.from_quat([x, y, z, w])
        position = np.asarray(pose['position']) + rotation.apply(geom['position'])
        error = float(np.linalg.norm(position-world.data.geom_xpos[geom['id']]))
        max_error = max(max_error, error)
        np.testing.assert_allclose(position, world.data.geom_xpos[geom['id']], atol=1e-12)
        gw, gx, gy, gz = geom['quaternion_wxyz']
        composed = rotation * Rotation.from_quat([gx, gy, gz, gw])
        np.testing.assert_allclose(composed.as_matrix(), world.data.geom_xmat[geom['id']].reshape(3, 3), atol=1e-12)
    for item in evidence['experiments']:
        for branch, replay in zip(item['branches'], item['replay']['branches']):
            assert branch['trace'] == replay['frames']
    numerical = []
    for item in evidence['experiments'][4:]:
        for branch in item['branches']:
            state, evaluation = branch['initial_state'], branch['evaluation']
            config, parameters = state['config'], evaluation['parameters']
            predicted = orbit(state['times'], config['initial_state'], config['perturbing_position'], parameters['central_mu'], parameters.get('perturbing_mass', 0))
            recorded = np.array([f['predicted_position']+f['predicted_velocity'] for f in branch['trace']])
            np.testing.assert_array_equal(predicted, recorded)
            residuals = predicted[:, :2]-np.asarray(state['observations'])
            n = evaluation['train_count']
            train = float(np.sqrt(np.mean(residuals[:n]**2)))
            heldout = float(np.sqrt(np.mean(residuals[n:]**2)))
            bic = float(np.sum((residuals[:n]/config['noise_std'])**2)+len(parameters)*np.log(2*n))
            np.testing.assert_allclose([train, heldout, bic], [evaluation['train_rmse'], evaluation['heldout_rmse'], evaluation['training_bic']], rtol=1e-13)
            assert 'hidden_mass' not in json.dumps(state)
            assert 'central_mu' not in config
            numerical.append({'hypothesis': evaluation['hypothesis'], 'heldout_rmse': heldout, 'training_bic': bic})
    examples = {'source': 'actual_live_requests; captured responses, not reusable IDs', 'base_url': 'http://127.0.0.1:8000', 'exchanges': []}
    with httpx.Client(base_url=examples['base_url'], timeout=60) as client:
        def request(method, path, body=None, headers=None):
            response = client.request(method, path, json=body, headers=headers)
            examples['exchanges'].append({'method': method, 'path': path, 'request_body': body, 'status_code': response.status_code, 'response_body': response.json()})
            response.raise_for_status()
            return response.json()
        spec = client.get('/openapi.json'); spec.raise_for_status()
        assert spec.json() == json.loads(Path('openapi.json').read_text()) == json.loads(Path('docs/openapi.json').read_text())
        assert client.get('/docs').status_code == 200
        cors = client.options('/v1/worlds', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type,Idempotency-Key'})
        assert cors.status_code == 200 and cors.headers['access-control-allow-origin'] == 'http://localhost:5173'
        robot = request('POST', '/v1/worlds', {'backend': 'mujoco', 'seed': 7})
        request('GET', f"/v1/worlds/{robot['id']}")
        request('GET', f"/v1/worlds/{robot['id']}/state")
        request('PATCH', f"/v1/worlds/{robot['id']}/environment", {'config': {'obstacle_position': [0.75, -0.4, 0.2], 'obstacle_size': [0.055, 0.13, 0.22], 'target_position': [0.55, 0.28, 0.22]}})
        request('POST', f"/v1/worlds/{robot['id']}/reset")
        for i in (0, 4):
            eid = evidence['experiments'][i]['experiment']['id']
            request('GET', f'/v1/experiments/{eid}')
            request('GET', f'/v1/experiments/{eid}/branches')
            request('GET', f'/v1/experiments/{eid}/replay')
        stale = client.post(f"/v1/worlds/{first['world_id']}/commit", json={'experiment_id': first['experiment']['id'], 'branch_id': selected['id']})
        assert stale.status_code == 409
        science = request('POST', '/v1/worlds', {'backend': 'scipy', 'seed': 7})
        request('GET', f"/v1/worlds/{science['id']}/state")
        experiment = request('POST', f"/v1/worlds/{science['id']}/experiments", {}, {'Idempotency-Key': f"handoff-{science['id']}"})
        deadline = time.monotonic()+30
        while experiment['status'] in ('queued', 'running'):
            assert time.monotonic() < deadline
            time.sleep(0.05)
            experiment = client.get(f"/v1/experiments/{experiment['id']}").json()
        assert experiment['status'] == 'completed' and experiment['selected_branch_id']
        request('POST', f"/v1/worlds/{science['id']}/commit", {'experiment_id': experiment['id'], 'branch_id': experiment['selected_branch_id']})
        events = asyncio.run(browser_websockets(experiment['id']))
        examples['websocket_messages'] = events
    Path('docs/frontend-examples.json').write_text(json.dumps(examples, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    report = {'status': 'passed', 'geometry': {'bodies': len(manifest['bodies']), 'geoms': len(manifest['geoms']), 'meshes': len(manifest['meshes']), 'mesh_buffer_bytes': len(buffer), 'maximum_world_position_error_m': max_error},
              'numerical_reintegration': numerical, 'checks': ['live_openapi_matches_both_exports', 'live_swagger_200', 'browser_cors_preflight', 'allowed_browser_websocket_origin', 'rejected_websocket_origin_403', 'compiled_mesh_roundtrip', 'all_geom_world_transforms_match_mujoco', 'replay_frames_equal_executed_traces', 'scipy_predictions_reintegrated_exactly', 'train_heldout_bic_recalculated', 'stale_commit_409', 'live_science_commit'], 'example_exchange_count': len(examples['exchanges'])}
    Path('artifacts/handoff-verification.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
