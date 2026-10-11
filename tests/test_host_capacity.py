"""Production-image smoke used with a real 512 MiB Docker memory limit."""
from fastapi.testclient import TestClient
import time
from vivacity.api import create_app


def test_all_labs_execute_sequentially_in_host_container(tmp_path, monkeypatch):
    monkeypatch.setenv('VIVACITY_IMMUTABLE_MODEL_FORKS', '1')
    with TestClient(create_app(tmp_path / 'host.sqlite3')) as client:
        for backend, config, settings in [
            ('mujoco', {'task': 'pick_place', 'obstacle_enabled': False},
             {'physics_trials': 8, 'search_candidates': 8, 'execute_selected': True}),
            ('cloth', None, {'search_candidates': 50, 'physics_budget': 3,
                             'execute_selected': True}),
            ('scipy', None, {}),
        ]:
            body = {'backend': backend, 'seed': 7}
            if config is not None:
                body['config'] = config
            response = client.post('/v1/worlds', json=body)
            assert response.status_code == 201, response.text
            world = response.json()
            response = client.post(f"/v1/worlds/{world['id']}/experiments", json=settings)
            assert response.status_code == 202, response.text
            eid = response.json()['id']
            deadline = time.monotonic() + 120
            while True:
                experiment = client.get(f'/v1/experiments/{eid}').json()
                if experiment['status'] not in ('queued', 'running'):
                    break
                assert time.monotonic() < deadline, experiment
                time.sleep(.05)
            assert experiment['status'] == 'completed', experiment
            assert experiment['selected_branch_id'], experiment
            replay = client.get(f'/v1/experiments/{eid}/replay').json()
            assert all(branch['frames'] for branch in replay['branches'])
            if backend != 'scipy':
                assert experiment['result']['execution_evaluation']['success']
            else:
                fits = client.get(f'/v1/experiments/{eid}/branches').json()
                assert all(b['performance']['integration_calls'] > 0 for b in fits)
