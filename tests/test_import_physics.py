import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

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


def test_upload_can_be_staged_then_run_as_a_configured_task(tmp_path):
    with TestClient(create_app(tmp_path / 'test-cell.sqlite3')) as client:
        uploaded = client.post('/v1/imports?filename=orbital.zip', content=FIXTURE.read_bytes(),
                               headers={'Content-Type': 'application/octet-stream'})
        identifier = uploaded.json()['id']
        configured = client.put(f'/v1/imports/{identifier}/test-cell', json={
            'name': 'Customer arm movement trial', 'environment': 'robotics_lab',
            'task': 'movement', 'gripper': 'none', 'gripper_strength_n': 20,
            'pickup_position_m': [.4, -.1, .08], 'destination_position_m': [.4, .2, .08],
            'object_half_size_m': [.03, .03, .03], 'object_mass_kg': .08,
            'sliding_friction': .8, 'cad_longest_dimension_m': .6})
        assert configured.status_code == 200, configured.text
        assert configured.json()['status'] == 'test_cell_configured'
        assert configured.json()['task_trial'] is None
        queued = client.post(f'/v1/imports/{identifier}/task-trials')
        assert queued.status_code == 202, queued.text
        trial_id = queued.json()['task_trial']['id']
        invalid_cursor = client.get(f'/v1/imports/{identifier}/task-trials/{trial_id}/frames', params={'after':-2})
        assert invalid_cursor.status_code == 422
        missing_trial = client.get(f'/v1/imports/{identifier}/task-trials/{uuid.uuid4()}/frames')
        assert missing_trial.status_code == 404
        cursor = -1; streamed = []; saw_live_frame = False
        deadline = time.monotonic() + 30
        while True:
            live = client.get(f'/v1/imports/{identifier}/task-trials/{trial_id}/frames',
                              params={'after':cursor,'limit':16})
            assert live.status_code == 200, live.text
            update = live.json(); streamed.extend(update['frames']); cursor = update['next_cursor']
            saw_live_frame |= bool(update['frames'] and update['status']=='task_running')
            record = client.get(f'/v1/imports/{identifier}').json()
            if record['status'] != 'task_running': break
            assert time.monotonic() < deadline
            time.sleep(.04)
        assert record['status'] == 'task_succeeded'
        assert record['task_trial']['task'] == 'movement'
        assert record['task_trial']['measurements']['physics_steps'] > 0
        assert saw_live_frame, 'measured frames must arrive before the trial reaches terminal status'
        assert len(streamed) >= 2
        assert all('joint_states' in frame and 'contacts' in frame for frame in streamed)
        assert record['task_trial']['component_diagnostics']
        assert any(row['joint'] for row in record['task_trial']['component_diagnostics'])


def test_configured_reach_failure_is_measured_not_decided_at_upload():
    xml = b'''<mujoco model="one_axis"><option timestep="0.004"/>
    <worldbody><body name="base"><geom type="box" size=".1 .1 .1" mass="1"/>
    <body name="tool" pos=".2 0 .2"><joint name="joint" type="hinge" axis="0 0 1" range="-1 1"/>
    <geom type="capsule" size=".03 .12" mass=".2"/></body></body></worldbody>
    <actuator><position joint="joint" kp="50"/></actuator></mujoco>'''
    config = {'name':'Measured reach','environment':'robotics_lab','task':'reach',
              'end_effector_body':'tool','gripper':'none','gripper_strength_n':20.,
              'pickup_position_m':[1.5,1.5,1.5],'destination_position_m':[.4,.2,.08],
              'object_half_size_m':[.03,.03,.03],'object_mass_kg':.08,
              'sliding_friction':.8,'cad_longest_dimension_m':.6}
    result = probe({'xml': base64.b64encode(xml).decode(), 'assets': {},
                    'trusted_fixture': True, 'task_config': config})
    assert result['status'] == 'failed'
    assert result['failure_class'] == 'unreachable'
    assert result['measurements']['goal_error_m'] > .08
    assert result['measurements']['physics_steps'] > 0


def test_configured_pick_place_executes_and_measures_release():
    xml = b'''<mujoco model="gantry"><option timestep="0.004" gravity="0 0 -9.81"/>
    <worldbody><body name="gantry" pos=".3 0 .16">
      <joint name="x" type="slide" axis="1 0 0" range="-.25 .25" damping="2"/>
      <joint name="y" type="slide" axis="0 1 0" range="-.25 .25" damping="2"/>
      <joint name="z" type="slide" axis="0 0 1" range="-.13 .3" damping="2"/>
      <geom type="sphere" size=".02" mass="1"/></body></worldbody>
    <actuator><position joint="x" kp="300"/><position joint="y" kp="300"/>
      <position joint="z" kp="300"/></actuator></mujoco>'''
    config = {'name':'Gantry placement','environment':'robotics_lab','task':'pick_place',
              'end_effector_body':'gantry','gripper':'vivacity_force_fixture','gripper_strength_n':35.,
              'pickup_position_m':[.3,0,.035],'destination_position_m':[.3,.16,.035],
              'object_half_size_m':[.025,.025,.025],'object_mass_kg':.05,
              'sliding_friction':.8,'cad_longest_dimension_m':.6}
    result = probe({'xml': base64.b64encode(xml).decode(), 'assets': {},
                    'trusted_fixture': True, 'task_config': config})
    assert result['status'] == 'succeeded'
    assert result['failure_class'] == 'none'
    assert result['measurements']['physics_steps'] == 2001
    assert result['measurements']['object_displacement_m'] > .15
    assert result['measurements']['placement_error_m'] < .03
    assert result['frames'][-1]['phase'] == 'release'


def test_test_cell_robot_base_offset_moves_the_submitted_model():
    xml = b'''<mujoco model="offset"><option timestep="0.004"/><worldbody>
      <body name="base" pos=".2 0 .2"><joint name="slide" type="slide" axis="1 0 0" range="-.5 .5"/>
      <geom type="box" size=".05 .05 .05" mass="1"/></body></worldbody>
      <actuator><position joint="slide" kp="50"/></actuator></mujoco>'''
    config = {'name':'Base placement','environment':'robotics_lab','task':'movement',
              'end_effector_body':'base','robot_base_offset_m':[.1,0.,0.],
              'gripper':'none','gripper_strength_n':20.,
              'pickup_position_m':[.4,-.1,.08],'destination_position_m':[.4,.2,.08],
              'object_half_size_m':[.03,.03,.03],'object_mass_kg':.08,
              'sliding_friction':.8,'cad_longest_dimension_m':.6}
    result = probe({'xml':base64.b64encode(xml).decode(),'assets':{},
                    'trusted_fixture':True,'task_config':config})
    assert result['status'] == 'succeeded'
    assert result['frames'][0]['positions_m'][0][0] == pytest.approx(.3)


def test_static_cad_is_wrapped_as_a_real_rigid_body_drop(tmp_path):
    tetra = b'''v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1
    f 1 2 3\nf 1 2 4\nf 1 3 4\nf 2 3 4\n'''
    service = ImportService(tmp_path / 'cad')
    record = service.create('robot-shape.obj', tetra)
    payload = service._load(record['id'])
    config = {'name':'CAD drop','environment':'robotics_lab','task':'static_drop',
              'end_effector_body':None,'gripper':'none','gripper_strength_n':20.,
              'pickup_position_m':[0,0,.8],'destination_position_m':[.4,.2,.08],
              'object_half_size_m':[.03,.03,.03],'object_mass_kg':.5,
              'sliding_friction':.8,'cad_longest_dimension_m':.6}
    source_value = service._visual_task_source(payload['preview'], config)
    result = probe({'xml': source_value['content'], 'assets': source_value['assets'],
                    'trusted_fixture': True, 'task_config': config})
    assert result['status'] == 'succeeded'
    assert result['measurements']['vertical_drop_m'] > .1
    assert result['measurements']['physics_steps'] == 500
    assert result['measurements']['final_linear_speed_m_s'] < .01
    assert len(result['frames']) >= 20


def test_static_cad_cannot_be_misrepresented_as_an_articulated_task(tmp_path):
    service = ImportService(tmp_path / 'cad')
    record = service.create('shape.obj', b'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
    from vivacity.schemas import RobotTestCellConfig
    config = RobotTestCellConfig(task='movement', gripper='none')
    with pytest.raises(ValueError, match='static CAD has no joints'):
        service.configure_test_cell(record['id'], config)


def test_urdf_diagnostic_is_not_misrepresented_as_augmented_test_cell(tmp_path):
    service = ImportService(tmp_path / 'urdf')
    record = service.create('robot.urdf', b'''<robot name="one_link">
      <link name="base"/><link name="tool"/><joint name="joint" type="revolute">
      <parent link="base"/><child link="tool"/><axis xyz="0 0 1"/>
      <limit lower="-1" upper="1" effort="1" velocity="1"/></joint></robot>''')
    from vivacity.schemas import RobotTestCellConfig
    with pytest.raises(ValueError, match='configured test cells currently require MJCF'):
        service.configure_test_cell(record['id'], RobotTestCellConfig(task='movement', gripper='none'))


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
