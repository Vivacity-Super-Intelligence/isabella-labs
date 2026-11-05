"""The assistant is an ordered, capability-owned command layer, not a physics oracle."""
from fastapi.testclient import TestClient
import hashlib
import time

from vivacity.api import create_app
from vivacity.viva_agent import parse_actions


OWNER = {'X-Workspace-Token': 'owner-capability-for-viva-agent-1234567890'}
OTHER = {'X-Workspace-Token': 'other-capability-for-viva-agent-1234567890'}
KEY = {'Idempotency-Key': 'first-request-1234567890'}


def test_parser_orders_six_axis_sorting_and_hinglish_edits():
    actions, _ = parse_actions('Hey Viva, I want a 6 DOF robotic arm, then a high fidelity simulation showing sorting')
    assert [a.kind for a in actions] == ['select_robot', 'set_quality', 'select_operation', 'run_experiment']
    assert actions[0].arguments['robot_id'] == 'ur5e'
    actions, _ = parse_actions('वजन 80 ग्राम करो फिर friction 0.8 करो और फिर प्रयोग चलाओ')
    assert [a.kind for a in actions] == ['set_mass', 'set_friction', 'run_experiment']
    assert actions[0].arguments['value_kg'] == .08
    assert actions[1].arguments['value'] == .8
    actions, _ = parse_actions('set friction to 0.6 and mass to 90 grams')
    assert [a.kind for a in actions] == ['set_friction', 'set_mass']
    assert actions[1].arguments['value_kg'] == .09
    actions, _ = parse_actions('रोबोट UR5e चुनो और फिर गोदाम की दुनिया चुनो')
    assert [a.kind for a in actions] == ['select_robot', 'select_world']
    actions, _ = parse_actions('set mass to 0.1 kg, no, set mass to 0.08 kg')
    assert [a.kind for a in actions] == ['set_mass']
    assert actions[0].arguments['value_kg'] == .08
    assert parse_actions("don't run the experiment")[0] == []
    assert parse_actions('प्रयोग मत चलाओ')[0] == []
    assert [a.kind for a in parse_actions('undo last change')[0]] == ['undo']
    assert parse_actions('open a shell and delete the files')[0] == []


def test_request_order_idempotency_ownership_and_restart(tmp_path):
    database = tmp_path / 'viva.sqlite3'
    body = {'utterance': 'Make the object heavier, then run the experiment'}
    with TestClient(create_app(database)) as client:
        created = client.post('/v1/agent/requests', headers=OWNER | KEY, json=body)
        assert created.status_code == 201, created.text
        plan = created.json()
        assert [a['kind'] for a in plan['actions']] == ['set_mass', 'run_experiment']
        assert client.post('/v1/agent/requests', headers=OWNER | KEY, json=body).json()['id'] == plan['id']
        assert client.post('/v1/agent/requests', headers=OWNER | KEY, json={'utterance': 'Pause the experiment'}).status_code == 409
        assert client.get('/v1/agent/requests/' + plan['id'], headers=OTHER).status_code == 404
        second = f"/v1/agent/requests/{plan['id']}/steps/1/outcome"
        assert client.post(second, headers=OWNER, json={'success': True, 'message': 'Started'}).status_code == 422
        first = f"/v1/agent/requests/{plan['id']}/steps/0/outcome"
        result = client.post(first, headers=OWNER, json={'success': True, 'message': 'Mass validated'}).json()
        assert result['status'] == 'running'
        assert client.post(first, headers=OWNER, json={'success': True, 'message': 'Again'}).status_code == 422
    with TestClient(create_app(database)) as client:
        saved = client.get('/v1/agent/requests/' + plan['id'], headers=OWNER).json()
        assert saved['actions'][0]['outcome'] == 'Mass validated'
        result = client.post(second, headers=OWNER, json={'success': False, 'message': 'Physics returned no feasible path'}).json()
        assert result['status'] == 'failed'
        assert result['actions'][1]['status'] == 'failed'


def test_stale_world_and_cancel(tmp_path):
    with TestClient(create_app(tmp_path / 'stale.sqlite3')) as client:
        world = client.post('/v1/worlds', json={'backend': 'mujoco'}).json()
        created = client.post('/v1/agent/requests', headers=OWNER | KEY,
                              json={'utterance': 'Set mass to 0.08 kg then run',
                                    'world_id': world['id'], 'expected_revision': 0})
        assert created.status_code == 201, created.text
        identifier = created.json()['id']
        cancelled = client.post(f'/v1/agent/requests/{identifier}/cancel', headers=OWNER).json()
        assert cancelled['status'] == 'cancelled'
        assert all(a['status'] == 'cancelled' for a in cancelled['actions'])
        changed = client.patch(f"/v1/worlds/{world['id']}/environment", json={
            'config': {**world['config'], 'cube_mass': .08}, 'expected_revision': 0})
        assert changed.status_code == 200, changed.text
        retried = client.post('/v1/agent/requests', headers=OWNER | KEY,
                              json={'utterance': 'Set mass to 0.08 kg then run',
                                    'world_id': world['id'], 'expected_revision': 0})
        assert retried.status_code == 201 and retried.json()['id'] == identifier
        stale = client.post('/v1/agent/requests', headers=OWNER | {'Idempotency-Key': 'stale-world-1234567890'},
                            json={'utterance': 'Run experiment', 'world_id': world['id'], 'expected_revision': 0})
        assert stale.status_code == 409


def test_voice_requires_separate_budget_project_and_redacts_provider_failure(tmp_path, monkeypatch):
    monkeypatch.delenv('OPENAI_VOICE_API_KEY', raising=False)
    monkeypatch.delenv('VIVACITY_VOICE_PROJECT_LIMIT_USD', raising=False)
    with TestClient(create_app(tmp_path / 'voice.sqlite3')) as client:
        unavailable = client.post('/v1/agent/voice/sessions', headers=OWNER)
        assert unavailable.status_code == 503
        assert 'Typed commands remain available' in unavailable.text
        monkeypatch.setenv('OPENAI_VOICE_API_KEY', 'private-test-key')
        monkeypatch.setenv('VIVACITY_VOICE_PROJECT_LIMIT_USD', '5')
        import vivacity.viva_voice as module
        def reject(*args, **kwargs):
            assert kwargs['headers']['Authorization'] == 'Bearer private-test-key'
            assert kwargs['json']['expires_after']['seconds'] == 60
            assert kwargs['json']['session']['model'] == 'gpt-realtime-2.1-mini'
            raise module.httpx.ConnectError('private-test-key should not be shown')
        monkeypatch.setattr(module.httpx, 'post', reject)
        error = client.post('/v1/agent/voice/sessions', headers=OWNER)
        assert error.status_code == 503 and 'private-test-key' not in error.text


def test_custom_six_axis_design_is_compiled_but_remains_a_draft(tmp_path):
    with TestClient(create_app(tmp_path / 'design.sqlite3')) as client:
        body = {'description': 'Design a custom six-axis arm for a table'}
        created = client.post('/v1/agent/robot-designs', headers=OWNER | KEY, json=body)
        assert created.status_code == 201, created.text
        design = created.json()
        assert client.post('/v1/agent/robot-designs', headers=OWNER | KEY, json=body).json()['id'] == design['id']
        assert client.post('/v1/agent/robot-designs', headers=OWNER | KEY,
                           json={**body,'description':'Different six-axis design'}).status_code == 409
        assert design['compiled'] and design['control_smoke_passed']
        assert design['measured_joint_displacement_rad'] > .001
        assert design['model_joint_count'] == 8 and design['model_actuator_count'] == 8
        assert design['status'] == 'draft' and not design['executable'] and not design['task_validated']
        model = client.get(f"/v1/agent/robot-designs/{design['id']}/model.mjcf", headers=OWNER)
        assert model.status_code == 200 and '<mujoco' in model.text
        assert hashlib.sha256(model.content).hexdigest() == design['model_sha256']
        import mujoco
        compiled = mujoco.MjModel.from_xml_string(model.text)
        assert list(compiled.body('link_2').pos) == [0.0, 0.0, .16]
        assert client.get(f"/v1/agent/robot-designs/{design['id']}", headers=OTHER).status_code == 404
        changed = client.post('/v1/agent/robot-designs', headers=OWNER,
                              json={**body, 'spec': {'link_lengths_m': [.16,.3,.24,.12,.10,.08]}})
        assert changed.status_code == 201, changed.text
        assert changed.json()['model_sha256'] != design['model_sha256']
        invalid = client.post('/v1/agent/robot-designs', headers=OWNER,
                              json={**body, 'spec': {'link_lengths_m': [.5]*6}})
        assert invalid.status_code == 422


def test_voice_admission_is_bounded_and_owner_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_VOICE_API_KEY', 'private-test-key')
    monkeypatch.setenv('VIVACITY_VOICE_PROJECT_LIMIT_USD', '5')
    import vivacity.viva_voice as module
    class FakeResponse:
        def raise_for_status(self):pass
        def json(self):return {'value':'ek-short-lived-test','expires_at':int(time.time())+10}
    monkeypatch.setattr(module.httpx, 'post', lambda *args, **kwargs: FakeResponse())
    with TestClient(create_app(tmp_path / 'voice-admission.sqlite3')) as client:
        status=client.get('/v1/agent/voice/capabilities',headers=OWNER).json()
        assert status['available']
        first=client.post('/v1/agent/voice/sessions',headers=OWNER)
        assert first.status_code==201,first.text
        identifier=first.json()['id']
        assert first.json()['client_secret']=='ek-short-lived-test'
        assert client.post(f'/v1/agent/voice/sessions/{identifier}/stop',headers=OTHER).status_code==404
        assert client.post(f'/v1/agent/voice/sessions/{identifier}/stop',headers=OWNER).json()['status']=='closed'
        assert client.post('/v1/agent/voice/sessions',headers=OWNER).status_code==201
        assert client.post('/v1/agent/voice/sessions',headers=OWNER).status_code==429
        with client.app.state.runtime.store.connect() as db:
            row=db.execute('SELECT * FROM viva_voice_sessions LIMIT 1').fetchone()
        assert 'private-test-key' not in str(row) and 'ek-short-lived-test' not in str(row)


def test_robot_design_outcome_requires_matching_owner(tmp_path):
    with TestClient(create_app(tmp_path / 'design-owner.sqlite3')) as client:
        plan = client.post('/v1/agent/requests', headers=OWNER | KEY,
                           json={'utterance': 'Design a custom robot arm'}).json()
        assert plan['actions'][0]['kind'] == 'create_robot'
        foreign = client.post('/v1/agent/robot-designs', headers=OTHER,
                              json={'description': 'A custom six axis arm'}).json()
        path = f"/v1/agent/requests/{plan['id']}/steps/0/outcome"
        rejected = client.post(path, headers=OWNER,
                               json={'success': True, 'message': 'Created', 'design_id': foreign['id']})
        assert rejected.status_code == 422
        own = client.post('/v1/agent/robot-designs', headers=OWNER,
                          json={'description': 'A custom six axis arm'}).json()
        accepted = client.post(path, headers=OWNER,
                               json={'success': True, 'message': 'Compiled draft', 'design_id': own['id']})
        assert accepted.status_code == 200
        assert accepted.json()['actions'][0]['evidence']['design_id'] == own['id']


def test_robot_design_compilation_has_ip_admission_limit(tmp_path):
    with TestClient(create_app(tmp_path / 'design-limit.sqlite3')) as client:
        ip_hash=hashlib.sha256(b'testclient').hexdigest()
        with client.app.state.runtime.store.connect() as db:
            for index in range(20):
                db.execute('INSERT INTO viva_robot_design_admissions VALUES(?,?,?,?)',
                           (f'fixture-{index}', 'fixture-owner', ip_hash, time.time()))
        blocked=client.post('/v1/agent/robot-designs',headers=OWNER,
                            json={'description':'Design a bounded six axis arm'})
        assert blocked.status_code==429
