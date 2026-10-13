"""Equation discovery works on real frame data and keeps held-out evidence."""
import math
import time

import numpy as np
from fastapi.testclient import TestClient

from vivacity.api import create_app
from vivacity.factory_discovery import discover
from vivacity.factory_discovery_data import scalar
from vivacity.factory_relationships import infer_joint_torque


OWNER = {'X-Workspace-Token': 'discovery-owner-capability-123456789000'}
OTHER = {'X-Workspace-Token': 'discovery-other-capability-123456789000'}


def test_linear_recovery_and_time_ordered_validation():
    x = np.linspace(0, 10, 120)
    values = [(float(t), float(1.2 + .8 * t)) for t in x]
    result = discover(values, 'measured-run', 'z', updated_at=100)
    assert result['selected_model'] == 'linear'
    assert result['status'] == 'validated_approximation'
    assert result['sample_count'] == 120
    assert result['held_out_count'] == 24
    assert result['models'][0]['validation']['rmse'] < 1e-9
    assert result['models'][0]['validation_status'] == 'validated_approximation'
    assert result['provenance']['run_id'] == 'measured-run'
    assert result['models'][0]['equation_latex'].startswith('y=')


def test_unpredictable_future_is_not_called_validated():
    values = [(i * .1, math.sin(i * .1) if i < 80 else 20 + math.sin(i * .1)) for i in range(100)]
    result = discover(values, 'changed-condition', 'z')
    assert result['status'] == 'poor_fit'
    assert result['models']
    assert result['models'][0]['validation']['rmse'] > 1
    assert all(model['validation_status'] == 'poor_fit' for model in result['models'])


def test_missing_values_are_not_invented():
    assert scalar({'cartons': [], 'measurements': {}}, 'z') is None
    assert scalar({'cartons': [], 'measurements': {}}, 'work') is None
    result = discover([(i, None) for i in range(100)], 'empty', 'force')
    assert result['status'] == 'insufficient_data'


def test_nonlinear_model_families_fit_computed_curves():
    times = np.linspace(0, 8, 120)
    cases = {
        'exponential': lambda t: 1.4 + .7 * np.exp(-.35 * t),
        'sinusoidal': lambda t: .2 + .9 * np.sin(1.3 * t + .4),
        'damped_sinusoidal': lambda t: .2 + .9 * np.exp(-.15 * t) * np.sin(1.3 * t + .4),
        'piecewise_linear': lambda t: np.where(t < 3, .2 + .3 * t, 1.1 - .15 * (t - 3)),
    }
    for family, function in cases.items():
        result = discover(list(zip(times, function(times))), family, 'z',
                          families=('constant', family))
        model = next(row for row in result['models'] if row['model'] == family)
        assert model['training']['rmse'] < .05, (family, model['training'])
        assert model['equation_text'].startswith('y(t) = ')
        assert len(model['predicted_curve']) == 120


def test_joint_relationship_recovers_only_supported_association():
    times=np.linspace(0,20,180)
    rows=[]
    for stamp in times:
        acceleration=math.sin(float(stamp)*.8)
        velocity=math.cos(float(stamp)*.37)
        rows.append((float(stamp),{'torque':2+.5*acceleration+.2*velocity,
                                   'joint_acceleration':acceleration,'joint_velocity':velocity}))
    result=infer_joint_torque(rows,'joint-run')
    assert result['status']=='validated_association'
    assert result['selected_model']=='acceleration_and_velocity'
    coefficients=result['models'][0]['coefficients']
    assert np.allclose(coefficients,[2,.5,.2],atol=1e-9)
    assert result['models'][0]['validation']['rmse']<1e-9
    assert 'not a causal' in result['scope']
    weak=infer_joint_torque([(float(i),{'torque':0.,'joint_acceleration':0.,'joint_velocity':0.}) for i in range(100)],'static')
    assert weak['status']=='insufficient_signal' and not weak['models']


def test_real_mujoco_run_discovery_persists_and_is_owned(tmp_path):
    path = tmp_path / 'discovery.sqlite3'
    with TestClient(create_app(path)) as client:
        cell = client.post('/v1/factory/cells', headers=OWNER,
                           json={'carton_count': 1, 'carton_start_y_m': -.4, 'realtime_speed': 8}).json()
        started = client.post(f"/v1/factory/cells/{cell['id']}/runs", headers=OWNER,
                              json={'mode': 'conveyor'})
        assert started.status_code == 202
        run_id = started.json()['id']
        url = f'/v1/factory/runs/{run_id}/discovery'
        assert client.get(url, headers=OTHER).status_code == 404
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            run = client.get(f'/v1/factory/runs/{run_id}', headers=OWNER).json()
            discovery = client.get(url, headers=OWNER).json()
            if run['status'] == 'completed' and len(discovery['series']) == 8 and not discovery['processing']:
                break
            time.sleep(.05)
        else:
            raise AssertionError((run['status'], discovery))
        frames = client.get(f'/v1/factory/runs/{run_id}/samples?limit=1000', headers=OWNER).json()['frames']
        actual = [(frame['time'], scalar(frame, 'y')) for frame in frames]
        measured = discovery['series']['y']
        assert measured['sample_count'] == len(actual)
        assert measured['provenance']['source'] == 'MuJoCo factory frames'
        assert measured['provenance']['experiment_conditions']['carton_start_y_m'] == -.4
        assert measured['models']
        assert discovery['relationships'][0]['status']=='insufficient_signal'
        assert discovery['relationships'][0]['provenance']['experiment_conditions']['carton_count'] == 1
        with client.app.state.runtime.store.connect() as db:
            saved = db.execute('SELECT count(*) FROM factory_discoveries WHERE run_id=?', (run_id,)).fetchone()[0]
            assert saved == 8
    with TestClient(create_app(path)) as client:
        restored = client.get(url, headers=OWNER).json()
        assert restored['series']['y'] == measured
