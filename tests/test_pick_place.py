from copy import deepcopy
import json

import mujoco as mj
import numpy as np
import pytest

from vivacity.pick_place import PickPlaceBackend
from vivacity.schemas import RoboticsConfig, CreateWorld, ExperimentRequest


def test_cube_obstacle_contact_is_prohibited_even_without_robot_contact():
    backend = PickPlaceBackend()
    world = backend.create_world(RoboticsConfig(task='pick_place', obstacle_enabled=True,
        obstacle_position=[.5, -.15, .05], obstacle_size=[.05, .05, .05]).model_dump(), 7)
    violations = backend.contacts(world)
    assert any(v['category'] == 'object_environment_collision' and
               set(v['geoms']) == {'cube', 'obstacle_geom'} for v in violations)


@pytest.fixture(scope='module')
def pickup():
    backend = PickPlaceBackend()
    world = backend.create_world(RoboticsConfig(task='pick_place', obstacle_enabled=False).model_dump(), 7)
    state = backend.snapshot(world)
    actions, _ = backend.candidates(world, 3, 100)
    branch = backend.fork(state)
    backend.apply_action(branch, actions[0])
    result = backend.simulate(branch, {'max_simulation_seconds':60})
    return backend, world, state, actions, branch, result, backend.evaluate(branch, result)


def test_free_cube_real_grasp_lift_transport_release_placement(pickup):
    b, w, state, actions, branch, result, evaluation = pickup
    assert w.model.nq == 16 and w.model.nv == 15 and w.model.nu == 8 and w.model.nmocap == 0
    assert w.model.jnt_type[w.model.joint('cube_free').id] == mj.mjtJoint.mjJNT_FREE
    assert w.model.neq == 1  # Only the Menagerie finger symmetry constraint; no object attachment.
    assert evaluation['success'], evaluation
    assert evaluation['grasp_established'] and evaluation['lifted'] and evaluation['retained_during_transport']
    assert evaluation['released'] and evaluation['table_supported'] and evaluation['goal_error_m'] < .025
    assert result['simulation_steps'] > 1000
    lifted = [f for f in result['trace'] if f['phase'] == 'transport']
    assert lifted and all(f['cube_position'][2] > .07 and f['grasp']['bilateral_grasp'] for f in lifted)
    assert np.linalg.norm(np.asarray(branch.data.body('target').xpos)-w.config['cube_position']) > .1
    assert b.snapshot(w) == state
    assert len({json.dumps(a['stages']) for a in actions}) == 3
    json.dumps(evaluation, allow_nan=False)


def test_full_state_fork_and_exact_physics_reexecution(pickup):
    b, w, state, actions, branch, result, evaluation = pickup
    restored = b.fork(state)
    assert restored.data is not w.data and restored.model is not w.model
    b.apply_action(restored, actions[0])
    repeat = b.simulate(restored, {'max_simulation_seconds':60})
    assert repeat['trace'] == result['trace']
    assert b.snapshot(restored) == b.snapshot(branch)
    assert b.evaluate(restored, repeat) == evaluation


@pytest.mark.parametrize('mode,expected', [('open', 'grasp_failure'), ('drop', 'dropped_object'), ('timeout','timeout')])
def test_real_failure_cases(pickup, mode, expected):
    b, _, state, actions, *_ = pickup
    branch = b.fork(state); action = deepcopy(actions[0])
    if mode == 'open':
        action['stages'][2]['gripper'] = 255
    if mode == 'drop':
        action['stages'][4]['gripper'] = 255
    b.apply_action(branch, action)
    result = b.simulate(branch, {'max_simulation_seconds': .05 if mode == 'timeout' else 60})
    evaluation = b.evaluate(branch, result)
    assert not evaluation['success'] and evaluation['status'] == expected, evaluation


def test_collision_screen_and_action_parent_validation(pickup):
    b, _, _, actions, *_ = pickup
    blocked = b.create_world(RoboticsConfig(task='pick_place', obstacle_position=[.5,0,.2],
                                          obstacle_size=[.3,.3,.2]).model_dump(), 7)
    candidates, _ = b.candidates(blocked, 3, 100)
    assert all(not a['planning_feasible'] and a['screening_rejection'] == 'kinematic_collision' for a in candidates)
    with pytest.raises(ValueError, match='parent'):
        action = deepcopy(actions[0]); action['stages'][0]['start'][0] += .1
        b.apply_action(blocked, action)


def test_runtime_pickup_persistence_exports_and_geometry_invalidation(runtime):
    w = runtime.create_world(CreateWorld(backend='mujoco', config=RoboticsConfig(task='pick_place', obstacle_enabled=False)))
    e = runtime.wait(runtime.submit(w['id'], ExperimentRequest(candidates=2, max_simulation_seconds=40))['id'], timeout=300)
    assert e['status'] == 'completed' and e['selected_branch_id'], e
    assert e['result']['milestone'] == 'physical_pick_and_place'
    exported = runtime.export_branch(e['id'], e['selected_branch_id'])
    assert exported['evaluation']['grasp_established'] and exported['success']
    assert exported['recorded_frames'][-1]['cube_position'] == exported['evaluation']['final_cube_position']
    changed = runtime.environment(w['id'], RoboticsConfig(task='pick_place', obstacle_position=[.5,0,.2],obstacle_size=[.3,.3,.2]))
    assert changed['state']['model_hash'] != w['state']['model_hash']
    assert runtime.get_experiment(e['id'])['stale']
    failed = runtime.wait(runtime.submit(w['id'], ExperimentRequest(candidates=2, planner_iterations=100))['id'])
    assert failed['selected_branch_id'] is None
    assert all(not b['evaluation']['success'] for b in runtime.store.branches(failed['id']))
