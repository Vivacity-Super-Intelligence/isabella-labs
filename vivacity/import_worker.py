"""Disposable native probe. Input is data, never imported Python or a plugin.

Linux installs CPU/address-space/file limits and a seccomp filter before model
compilation. No host files, sockets, subprocesses or cross-process memory access
can be opened afterward. Windows is restricted to the exact trusted fixture.
"""
import base64
import ctypes
import json
import os
import platform
import sys
import time
import xml.etree.ElementTree as ET


def augment_test_cell(root, config):
    """Add only measured test-cell geometry to an MJCF model."""
    world = root.find('worldbody')
    if world is None:
        raise ValueError('configured lab tasks require an MJCF worldbody')
    if world.find(".//*[@name='vivacity_floor']") is not None:
        raise ValueError('submitted model uses a reserved vivacity_ name')
    ET.SubElement(world, 'geom', name='vivacity_floor', type='plane', size='4 4 .1',
                  rgba='.12 .14 .13 1', friction=f"{config['sliding_friction']} .01 .001")
    offset = config.get('robot_base_offset_m', [0., 0., 0.])
    base = next((item for item in world if item.tag == 'body'
                 and not (item.get('name') or '').startswith('vivacity_')), None)
    if base is not None:
        position = [float(value) for value in base.get('pos', '0 0 0').split()]
        if len(position) != 3:
            raise ValueError('robot base position must have three coordinates')
        base.set('pos', ' '.join(str(value + delta) for value, delta in zip(position, offset)))
    environment = config['environment']
    if environment == 'tabletop':
        ET.SubElement(world, 'geom', name='vivacity_table', type='box', pos='.45 0 .35',
                      size='.5 .45 .025', rgba='.38 .4 .39 1', friction='.9 .01 .001')
    elif environment == 'warehouse_cell':
        ET.SubElement(world, 'geom', name='vivacity_pallet', type='box', pos='.55 0 .08',
                      size='.55 .42 .08', rgba='.36 .3 .22 1', friction='.75 .01 .001')
    destination = config['destination_position_m']
    ET.SubElement(world, 'site', name='vivacity_destination', type='box',
                  pos=' '.join(map(str, destination)), size='.055 .055 .003',
                  rgba='.85 .18 .14 .75', group='4')
    if config['task'] == 'pick_place':
        pickup = config['pickup_position_m']; half = config['object_half_size_m']
        body = ET.SubElement(world, 'body', name='vivacity_object', pos=' '.join(map(str, pickup)))
        ET.SubElement(body, 'freejoint', name='vivacity_object_free')
        ET.SubElement(body, 'geom', name='vivacity_object_geom', type='box',
                      size=' '.join(map(str, half)), mass=str(config['object_mass_kg']),
                      friction=f"{config['sliding_friction']} .01 .001", rgba='.05 .28 .92 1')
        if config['gripper'] == 'vivacity_force_fixture':
            submitted = [item for item in world.iter('body') if not (item.get('name') or '').startswith('vivacity_')]
            selected = next((item for item in submitted if item.get('name') == config.get('end_effector_body')), None)
            if selected is None:
                selected = submitted[-1] if submitted else None
            if selected is not None:
                ET.SubElement(selected, 'geom', name='vivacity_force_fixture', type='sphere',
                              size='.035', mass='.001', rgba='.16 .76 .68 .65',
                              contype='1', conaffinity='1')


def execute_task(model, config, mj, np, sandbox, emit=None):
    data = mj.MjData(model)
    mj.mj_forward(model, data)
    name = lambda kind, i: mj.mj_id2name(model, kind, i)
    task = config['task']
    durations = {'movement': [1.2], 'reach': [2.0], 'pick_place': [1.4,.8,1.2,1.6,1.3,.35,.65,.7],
                 'static_drop': [2.0]}[task]
    total_steps = sum(int(np.ceil(duration/model.opt.timestep)) for duration in durations)
    body_ids = list(range(1, min(model.nbody, 65)))
    body_index = {body_id: index for index, body_id in enumerate(body_ids)}
    body_names = [name(mj.mjtObj.mjOBJ_BODY, body_id) or f'body_{body_id}' for body_id in body_ids]
    body_parents = [body_index.get(int(model.body_parentid[body_id]), -1) for body_id in body_ids]
    object_name = 'vivacity_cad_body' if task == 'static_drop' else 'vivacity_object'
    object_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY, object_name)
    terminal_name = config.get('end_effector_body')
    terminal_id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY, terminal_name) if terminal_name else -1
    if terminal_id < 0:
        candidates = [body_id for body_id in body_ids if not (body_names[body_index[body_id]]).startswith('vivacity_')]
        terminal_id = candidates[-1] if candidates else -1
    frames = []
    supported = []
    physics_steps = 0
    target_qpos_by_joint = {}
    component_max = {}
    started_wall = time.monotonic()
    start_time = float(data.time)

    def joint_diagnostics():
        result = []
        for actuator_id, joint_id, dof, qadr in supported:
            joint_name = name(mj.mjtObj.mjOBJ_JOINT, joint_id) or f'joint_{joint_id}'
            actuator_name = name(mj.mjtObj.mjOBJ_ACTUATOR, actuator_id) or f'actuator_{actuator_id}'
            position = float(data.qpos[qadr]); velocity = float(data.qvel[dof])
            target = float(target_qpos_by_joint.get(joint_id, position))
            error = abs(target-position); force = float(data.actuator_force[actuator_id])
            force_limited = bool(model.actuator_forcelimited[actuator_id])
            force_limit = float(max(abs(model.actuator_forcerange[actuator_id]))) if force_limited else None
            utilization = abs(force)/force_limit if force_limit and force_limit > 0 else None
            ctrl_limited = bool(model.actuator_ctrllimited[actuator_id]); ctrl = float(data.ctrl[actuator_id])
            ctrl_saturated = bool(ctrl_limited and min(abs(ctrl-model.actuator_ctrlrange[actuator_id, 0]),
                                                        abs(ctrl-model.actuator_ctrlrange[actuator_id, 1])) < 1e-5)
            limited = bool(model.jnt_limited[joint_id])
            margin = float(min(position-model.jnt_range[joint_id, 0], model.jnt_range[joint_id, 1]-position)) if limited else None
            violation = bool(limited and (position < model.jnt_range[joint_id, 0]-1e-6
                                          or position > model.jnt_range[joint_id, 1]+1e-6))
            row = {'joint': joint_name, 'joint_type': 'hinge' if int(model.jnt_type[joint_id]) == 2 else 'slide',
                   'position': position, 'velocity': velocity, 'target_position': target,
                   'tracking_error': error, 'position_unit': 'rad' if int(model.jnt_type[joint_id]) == 2 else 'm',
                   'actuator': actuator_name, 'actuator_force_n': force, 'force_limit_n': force_limit,
                   'force_utilization': utilization, 'force_limit_reached': bool(utilization is not None and utilization >= .995),
                   'control_signal': ctrl, 'control_saturated': ctrl_saturated,
                   'joint_limit_margin': margin, 'joint_limit_violation': violation}
            result.append(row)
            aggregate = component_max.setdefault(actuator_id, {'joint': joint_name, 'actuator': actuator_name,
                'position_unit': row['position_unit'], 'max_tracking_error': 0., 'peak_abs_force_n': 0.,
                'force_limit_n': force_limit, 'max_force_utilization': 0., 'force_limit_reached': False,
                'control_saturated': False, 'minimum_joint_limit_margin': margin,
                'joint_limit_violation': False})
            aggregate['max_tracking_error'] = max(aggregate['max_tracking_error'], error)
            aggregate['peak_abs_force_n'] = max(aggregate['peak_abs_force_n'], abs(force))
            if utilization is not None: aggregate['max_force_utilization'] = max(aggregate['max_force_utilization'], utilization)
            aggregate['force_limit_reached'] |= row['force_limit_reached']
            aggregate['control_saturated'] |= ctrl_saturated
            aggregate['joint_limit_violation'] |= violation
            if margin is not None: aggregate['minimum_joint_limit_margin'] = min(aggregate['minimum_joint_limit_margin'], margin)
        return result

    def contact_diagnostics():
        contacts = []
        for contact_id in range(min(int(data.ncon), 128)):
            contact = data.contact[contact_id]; wrench = np.zeros(6)
            mj.mj_contactForce(model, data, contact_id, wrench)
            geom_a, geom_b = map(int, contact.geom)
            body_a, body_b = int(model.geom_bodyid[geom_a]), int(model.geom_bodyid[geom_b])
            contacts.append({'geom_a': name(mj.mjtObj.mjOBJ_GEOM, geom_a) or f'geom_{geom_a}',
                'geom_b': name(mj.mjtObj.mjOBJ_GEOM, geom_b) or f'geom_{geom_b}',
                'body_a': name(mj.mjtObj.mjOBJ_BODY, body_a) or f'body_{body_a}',
                'body_b': name(mj.mjtObj.mjOBJ_BODY, body_b) or f'body_{body_b}',
                'normal_force_n': abs(float(wrench[0])), 'position_m': np.asarray(contact.pos).tolist()})
        contacts.sort(key=lambda item: item['normal_force_n'], reverse=True)
        return contacts[:24]

    def component_diagnostic_rows():
        rows = []
        for source in component_max.values():
            row = dict(source); observations = []
            if row['joint_limit_violation']: observations.append('declared_joint_limit_exceeded')
            if row['force_limit_reached']: observations.append('declared_actuator_force_limit_reached')
            if row['control_saturated']: observations.append('declared_control_range_saturated')
            review_threshold = .15 if row['position_unit'] == 'rad' else .02
            row['tracking_error_review_threshold'] = review_threshold
            if row['max_tracking_error'] > review_threshold: observations.append('tracking_lag_review')
            row['status'] = 'attention' if observations else 'no_declared_limit_event_observed'
            row['observations'] = observations
            if row['joint_limit_violation']:
                row['recommendation'] = 'Reduce or re-plan this motion and check the submitted joint range; the model reported a declared limit violation.'
            elif row['force_limit_reached']:
                row['recommendation'] = 'Reduce payload or speed and review actuator sizing and controller demand; reaching a model-declared limit is not proof of hardware damage.'
            elif row['control_saturated']:
                row['recommendation'] = 'The actuator control reached its declared range; review target, load and controller tuning before changing hardware.'
            elif 'tracking_lag_review' in observations:
                row['recommendation'] = 'Tracking error crossed the review threshold; inspect the measured trajectory, load and controller tuning.'
            else:
                row['recommendation'] = 'No declared joint or actuator limit event was observed during this trial.'
            rows.append(row)
        return rows

    def task_diagnostics():
        rows = component_diagnostic_rows()
        findings = [{'severity': 'info', 'code': 'structural_failure_not_modeled',
            'message': 'Screw fracture, gear damage and material fatigue are not assessed unless the uploaded model supplies explicit components and failure laws.'}]
        if any(row['joint_limit_violation'] or row['force_limit_reached'] for row in rows):
            findings.insert(0, {'severity': 'error', 'code': 'declared_limit_event',
                'message': 'A declared joint or actuator limit was exceeded or reached; inspect the listed components.'})
        elif any(row['control_saturated'] for row in rows):
            findings.insert(0, {'severity': 'warning', 'code': 'control_saturation',
                'message': 'One or more controls reached their configured range; review load and controller targets.'})
        if task == 'pick_place' and grip_lost:
            findings.insert(0, {'severity': 'error', 'code': 'grip_lost',
                'message': 'The measured force-limited fixture lost object retention.'})
        return findings

    def record(phase):
        if len(frames) >= 192: return
        frame = {'seq': len(frames), 'phase': phase, 'time_s': float(data.time),
                 'physics_steps': physics_steps, 'positions_m': data.xpos[body_ids].tolist(),
                 'quaternions_wxyz': data.xquat[body_ids].tolist(),
                 'object_position_m': data.xpos[object_id].tolist() if object_id >= 0 else None,
                 'joint_states': joint_diagnostics(), 'contacts': contact_diagnostics()}
        frames.append(frame)
        # One-second presentation keeps the visible pose tied to measured state.
        due = started_wall + max(0., float(data.time-start_time))
        delay = due-time.monotonic()
        if delay > 0: time.sleep(min(delay, 1.0))
        if emit is not None:
            emit({'type': 'progress', 'frame': frame, 'current_phase': phase,
                  'completed_steps': physics_steps, 'total_steps': total_steps,
                  'simulated_seconds': float(data.time-start_time),
                  'elapsed_wall_seconds': min(120., time.monotonic()-started_wall),
                  'measurements': {'physics_steps': physics_steps, 'simulated_seconds': float(data.time-start_time),
                    'terminal_position_m': data.xpos[terminal_id].tolist() if terminal_id >= 0 else None,
                    'object_position_m': data.xpos[object_id].tolist() if object_id >= 0 else None},
                  'body_names': body_names, 'body_parent_indices': body_parents,
                  'component_diagnostics': component_diagnostic_rows(), 'diagnostics': task_diagnostics()})

    def finite():
        return bool(np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all()
                    and not np.any(data.warning.number))

    if task == 'static_drop':
        if object_id < 0:
            raise ValueError('static CAD test body is missing')
        start = data.xpos[object_id].copy(); record('static_drop')
        steps = int(np.ceil(2.0 / model.opt.timestep)); every = max(1, steps // 20)
        for step in range(steps):
            mj.mj_step(model, data)
            physics_steps += 1
            if (step + 1) % every == 0:
                record('static_drop')
        speed = float(np.linalg.norm(data.cvel[object_id, :3]))
        drop = float(start[2] - data.xpos[object_id, 2])
        stable = finite() and speed < .2
        return {'schema_version': 'vivacity.robot-task-trial/1.0', 'status': 'succeeded' if stable else 'failed',
                'task': task, 'failure_class': 'none' if stable else 'unstable',
                'measurements': {'simulated_seconds': float(data.time), 'physics_steps': steps,
                                 'vertical_drop_m': drop, 'final_linear_speed_m_s': speed,
                                 'final_position_m': data.xpos[object_id].tolist()},
                'body_names': body_names, 'body_parent_indices': body_parents, 'frames': frames,
                'completed_steps': physics_steps, 'total_steps': steps,
                'simulated_seconds': float(data.time-start_time),
                'elapsed_wall_seconds': min(120., time.monotonic()-started_wall),
                'component_diagnostics': [],
                'diagnostics': [{'severity': 'info', 'code': 'static_geometry_only',
                    'message': 'A static mesh drop cannot identify screw, gear, actuator or fatigue failures.'}],
                'effective_config': config,
                'scope': 'Real MuJoCo rigid-body drop and collision trial of the uploaded CAD mesh convex hull. Static CAD contains no joints or actuators, so this result does not validate robot kinematics or control.'}

    supported = []
    for actuator_id in range(model.nu):
        joint_id = int(model.actuator_trnid[actuator_id, 0])
        position = (int(model.actuator_trntype[actuator_id]) == 0 and 0 <= joint_id < model.njnt
                    and int(model.jnt_type[joint_id]) in (2, 3)
                    and model.actuator_gainprm[actuator_id, 0] > 0
                    and np.isclose(model.actuator_biasprm[actuator_id, 1], -model.actuator_gainprm[actuator_id, 0]))
        if position:
            supported.append((actuator_id, joint_id, int(model.jnt_dofadr[joint_id]), int(model.jnt_qposadr[joint_id])))
            data.ctrl[actuator_id] = data.qpos[model.jnt_qposadr[joint_id]]
            target_qpos_by_joint[joint_id] = float(data.qpos[model.jnt_qposadr[joint_id]])
    if not supported:
        return {'schema_version': 'vivacity.robot-task-trial/1.0', 'status': 'failed', 'task': task,
                'failure_class': 'unactuated', 'measurements': {'physics_steps': 0},
                'body_names': body_names, 'body_parent_indices': body_parents, 'frames': [],
                'effective_config': config,
                'scope': 'The uploaded model was compiled, but no supported position actuator was available for this configured task.'}
    if terminal_id < 0:
        raise ValueError('no terminal robot body is available')

    def set_targets(target_qpos):
        desired = mj.MjData(model)
        desired.qpos[:] = target_qpos; desired.qvel[:] = 0
        mj.mj_forward(model, desired)
        for actuator_id, _joint_id, dof, qadr in supported:
            target_qpos_by_joint[_joint_id] = float(target_qpos[qadr])
            gain = float(model.actuator_gainprm[actuator_id, 0])
            value = float(target_qpos[qadr] + desired.qfrc_bias[dof] / max(gain, 1e-9))
            if model.actuator_ctrllimited[actuator_id]:
                value = float(np.clip(value, *model.actuator_ctrlrange[actuator_id]))
            data.ctrl[actuator_id] = value

    def plan(target):
        planning = mj.MjData(model)
        planning.qpos[:] = data.qpos; planning.qvel[:] = 0
        mj.mj_forward(model, planning)
        for _ in range(100):
            error = np.asarray(target) - planning.xpos[terminal_id]
            if np.linalg.norm(error) <= .035:
                break
            jacp = np.zeros((3, model.nv)); jacr = np.zeros((3, model.nv))
            mj.mj_jacBody(model, planning, jacp, jacr, terminal_id)
            columns = [dof for _a, _j, dof, _q in supported]
            jac = jacp[:, columns]
            delta = jac.T @ np.linalg.solve(jac @ jac.T + .0025*np.eye(3), error)
            norm = float(np.linalg.norm(delta))
            if norm > .12:
                delta *= .12 / norm
            for amount, (_a, joint_id, _dof, qadr) in zip(delta, supported):
                planning.qpos[qadr] += amount
                if model.jnt_limited[joint_id]:
                    planning.qpos[qadr] = np.clip(planning.qpos[qadr], *model.jnt_range[joint_id])
            mj.mj_forward(model, planning)
        return planning.qpos.copy(), float(np.linalg.norm(np.asarray(target)-planning.xpos[terminal_id]))

    grip_lost = False
    peak_grip_force = 0.
    grip_offset = np.array([0., 0., float(config['object_half_size_m'][2]) + .038])
    def execute_phase(phase, target, duration=1.2, grip=False):
        nonlocal physics_steps, grip_lost, peak_grip_force
        target_qpos, planned_error = plan(target)
        set_targets(target_qpos)
        steps = int(np.ceil(duration / model.opt.timestep)); every = max(1, steps // 20)
        for step in range(steps):
            # Apply the visible test fixture through generalized forces so its
            # equal-and-opposite load passes through the submitted mechanism.
            # mj_applyFT avoids depending on xfrc_applied's raw vector layout.
            data.qfrc_applied[:] = 0
            if grip and object_id >= 0:
                offset = data.xpos[terminal_id] - grip_offset - data.xpos[object_id]
                distance = float(np.linalg.norm(offset))
                if distance > .16:
                    grip_lost = True
                relative_velocity = data.cvel[terminal_id, 3:] - data.cvel[object_id, 3:]
                force = 260.*offset + 18.*relative_velocity
                magnitude = float(np.linalg.norm(force)); limit = float(config['gripper_strength_n'])
                if magnitude > limit:
                    force *= limit / magnitude
                    magnitude = limit
                zero = np.zeros(3)
                mj.mj_applyFT(model, data, force, zero, data.xpos[object_id],
                              object_id, data.qfrc_applied)
                mj.mj_applyFT(model, data, -force, zero, data.xpos[terminal_id],
                              terminal_id, data.qfrc_applied)
                peak_grip_force = max(peak_grip_force, magnitude)
            mj.mj_step(model, data); physics_steps += 1
            if (step + 1) % every == 0:
                record(phase)
        mj.mj_forward(model, data)
        return planned_error, float(np.linalg.norm(np.asarray(target)-data.xpos[terminal_id]))

    record('movement' if task == 'movement' else 'approach')
    if task == 'movement':
        start = data.qpos.copy(); target_q = data.qpos.copy()
        for _a, joint_id, _dof, qadr in supported:
            delta = .12
            if model.jnt_limited[joint_id] and target_q[qadr] + delta > model.jnt_range[joint_id, 1]:
                delta = -.12
            target_q[qadr] += delta
        set_targets(target_q)
        steps = int(np.ceil(1.2 / model.opt.timestep)); every = max(1, steps // 20)
        for step in range(steps):
            mj.mj_step(model, data); physics_steps += 1
            if (step + 1) % every == 0: record('movement')
        displacement = float(np.linalg.norm(data.qpos-start))
        success = finite() and displacement > 1e-4
        failure = 'none' if success else 'numerical_instability' if not finite() else 'unactuated'
        measurements = {'physics_steps': physics_steps, 'simulated_seconds': float(data.time),
                        'joint_displacement_norm': displacement, 'terminal_position_m': data.xpos[terminal_id].tolist()}
    elif task == 'reach':
        target = config['pickup_position_m']
        planned, measured = execute_phase('approach', target, 2.)
        success = finite() and measured <= .08
        failure = 'none' if success else 'numerical_instability' if not finite() else 'unreachable'
        measurements = {'physics_steps': physics_steps, 'simulated_seconds': float(data.time),
                        'planned_goal_error_m': planned, 'goal_error_m': measured,
                        'terminal_position_m': data.xpos[terminal_id].tolist()}
    else:
        if object_id < 0:
            raise ValueError('configured pick-and-place object is missing')
        object_start = data.xpos[object_id].copy()
        pickup = np.asarray(config['pickup_position_m']); destination = np.asarray(config['destination_position_m'])
        results = []
        results.append(execute_phase('approach', pickup + np.array([0,0,.13]), 1.4))
        results.append(execute_phase('grasp', pickup + grip_offset, .8))
        results.append(execute_phase('lift', pickup + np.array([0,0,.22]), 1.2, True))
        results.append(execute_phase('transport', destination + np.array([0,0,.22]), 1.6, True))
        results.append(execute_phase('place', destination + grip_offset, 1.3, True))
        execute_phase('release', destination + grip_offset, .35, False)
        execute_phase('release', destination + np.array([0,0,.16]), .65, False)
        for _ in range(int(np.ceil(.7/model.opt.timestep))):
            data.qfrc_applied[:] = 0; mj.mj_step(model,data); physics_steps += 1
        mj.mj_forward(model,data); record('release')
        placement_error = float(np.linalg.norm(data.xpos[object_id]-destination))
        reachable = max(value for pair in results for value in pair) <= .12
        moved = float(np.linalg.norm(data.xpos[object_id]-object_start))
        success = bool(finite() and reachable and not grip_lost and moved > .05 and placement_error <= .10)
        if success: failure = 'none'
        elif not finite(): failure = 'numerical_instability'
        elif not reachable: failure = 'unreachable'
        elif grip_lost or moved <= .05: failure = 'grip_lost'
        else: failure = 'placement_error'
        measurements = {'physics_steps': physics_steps, 'simulated_seconds': float(data.time),
                        'object_start_m': object_start.tolist(), 'object_final_m': data.xpos[object_id].tolist(),
                        'placement_error_m': placement_error, 'object_displacement_m': moved,
                        'peak_grip_force_n': peak_grip_force, 'grip_lost': grip_lost,
                        'waypoint_errors_m': [list(pair) for pair in results]}
    component_diagnostics = component_diagnostic_rows()
    diagnostics = task_diagnostics()
    return {'schema_version': 'vivacity.robot-task-trial/1.0', 'status': 'succeeded' if success else 'failed',
            'task': task, 'failure_class': failure, 'measurements': measurements,
            'body_names': body_names, 'body_parent_indices': body_parents, 'frames': frames,
            'component_diagnostics': component_diagnostics, 'diagnostics': diagnostics,
            'completed_steps': physics_steps, 'total_steps': physics_steps,
            'current_phase': frames[-1]['phase'] if frames else None,
            'simulated_seconds': float(data.time-start_time),
            'elapsed_wall_seconds': min(120., time.monotonic()-started_wall),
            'effective_config': config,
            'scope': ('Real MuJoCo task execution with submitted joints, bodies, collisions and supported position actuators. '
                      + ('The visible Vivacity force fixture applies equal, force-limited Cartesian grip forces; it does not validate an uploaded gripper. '
                         if config['gripper'] == 'vivacity_force_fixture' else '')
                      + 'The result applies only to this model, initial state and configured test cell; it is not hardware certification.')}


def restrict_linux():
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024**2, 768 * 1024**2))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024**2, 1024**2))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    machine = platform.machine().lower()
    if machine in ('x86_64', 'amd64'):
        arch = 0xC000003E
        denied = [2, 85, 257, 437, 41, 42, 43, 49, 50, 53, 288,
                  57, 58, 56, 435, 59, 322, 101, 310, 311,
                  425, 426, 427, 304, 82, 83, 84, 86, 87, 88, 90, 92,
                  76, 132, 133, 165, 166, 272, 308, 263, 264, 265, 266,
                  267, 268, 280, 316]
    elif machine in ('aarch64', 'arm64'):
        arch = 0xC00000B7
        denied = [56, 437, 198, 199, 200, 201, 202, 203, 242,
                  220, 435, 221, 281, 117, 270, 271,
                  425, 426, 427, 265, 33, 34, 35, 36, 37, 38, 276,
                  40, 39, 97, 268, 53, 54]
    else:
        raise ValueError('native sandbox unavailable on this CPU architecture')

    class Filter(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte),
                    ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint)]

    class Program(ctypes.Structure):
        _fields_ = [('length', ctypes.c_ushort), ('filter', ctypes.POINTER(Filter))]

    instructions = [(0x20, 0, 0, 4), (0x15, 1, 0, arch),
                    (0x06, 0, 0, 0x80000000), (0x20, 0, 0, 0)]
    # Reject x32 ABI syscall numbers, which otherwise share the x86-64 arch tag.
    instructions.extend([(0x35, 0, 1, 0x40000000), (0x06, 0, 0, 0x80000000)])
    for number in denied:
        instructions.extend([(0x15, 0, 1, number), (0x06, 0, 0, 0x00050001)])
    instructions.append((0x06, 0, 0, 0x7FFF0000))
    filters = (Filter * len(instructions))(*(Filter(*i) for i in instructions))
    program = Program(len(filters), filters)
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(38, 1, 0, 0, 0) or libc.prctl(22, 2, ctypes.byref(program), 0, 0):
        raise ValueError('native sandbox installation failed')


def probe(request, emit=None):
    # Imports and dynamic libraries are resolved before filesystem access closes.
    import mujoco as mj
    import numpy as np
    xml = base64.b64decode(request['xml'], validate=True)
    assets = {name: base64.b64decode(value, validate=True)
              for name, value in request['assets'].items()}
    root = ET.fromstring(xml)
    task_config = request.get('task_config')
    if root.tag == 'mujoco':
        compiler = root.find('compiler')
        if compiler is None:
            compiler = ET.SubElement(root, 'compiler')
        compiler.set('usethread', 'false')
        # VFS names have already been resolved by the parent validator.
        for key in ('meshdir', 'texturedir', 'assetdir'):
            compiler.attrib.pop(key, None)
        if task_config is not None:
            augment_test_cell(root, task_config)
        xml = ET.tostring(root, encoding='unicode')
    else:
        if task_config is not None:
            raise ValueError('configured lab tasks require MJCF; convert URDF to MJCF or run the initial movement diagnostic')
        xml = xml.decode('utf-8-sig')
    if sys.platform.startswith('linux'):
        restrict_linux()
        sandbox = 'linux_seccomp_cpu_memory_file_caps'
    elif request.get('trusted_fixture') is True:
        sandbox = 'trusted_fixed_fixture_child_only'
    else:
        raise ValueError('untrusted native execution requires the Linux sandbox')
    model = mj.MjModel.from_xml_string(xml, assets=assets)
    if model.nv > 128 or model.nu > 64 or model.ngeom > 512 or model.nbody > 256:
        raise ValueError('compiled model exceeds probe bounds')
    if not .001 <= model.opt.timestep <= .01:
        raise ValueError('native timestep must be 0.001..0.01 seconds')
    data = mj.MjData(model)
    mj.mj_forward(model, data)
    if task_config is not None:
        return execute_task(model, task_config, mj, np, sandbox, emit=emit)
    name = lambda kind, i: mj.mj_id2name(model, kind, i)
    joints = [{'name': name(mj.mjtObj.mjOBJ_JOINT, i),
               'type': int(model.jnt_type[i]), 'range': model.jnt_range[i].tolist(),
               'limited': bool(model.jnt_limited[i]), 'qpos_address': int(model.jnt_qposadr[i])}
              for i in range(model.njnt)]
    actuators = []
    for i in range(model.nu):
        joint = int(model.actuator_trnid[i, 0])
        position = (int(model.actuator_trntype[i]) == 0 and 0 <= joint < model.njnt
                    and int(model.jnt_type[joint]) in (2, 3)
                    and model.actuator_gainprm[i, 0] > 0
                    and np.isclose(model.actuator_biasprm[i, 1], -model.actuator_gainprm[i, 0]))
        actuators.append({'name': name(mj.mjtObj.mjOBJ_ACTUATOR, i),
                          'joint': joints[joint]['name'] if position else None,
                          'position_control_supported': bool(position),
                          'control_range': model.actuator_ctrlrange[i].tolist()})
        if position:
            data.ctrl[i] = data.qpos[model.jnt_qposadr[joint]]
    spec = mj.mjtState.mjSTATE_INTEGRATION
    initial = np.empty(mj.mj_stateSize(model, spec))
    mj.mj_getState(model, data, initial, spec)
    q0 = data.qpos.copy()
    body_ids = list(range(1, min(model.nbody, 65)))
    body_index = {body_id: index for index, body_id in enumerate(body_ids)}
    body_names = [name(mj.mjtObj.mjOBJ_BODY, body_id) or f'body_{body_id}' for body_id in body_ids]
    body_parents = [body_index.get(int(model.body_parentid[body_id]), -1) for body_id in body_ids]
    frames = []

    def frame(current, phase):
        frames.append({'seq': len(frames), 'phase': phase, 'time_s': float(current.time),
                       'positions_m': current.xpos[body_ids].tolist(),
                       'quaternions_wxyz': current.xquat[body_ids].tolist()})

    def finite(current):
        return bool(np.isfinite(current.qpos).all() and np.isfinite(current.qvel).all()
                    and not np.any(current.warning.number))

    def limit_violations(current):
        violations = 0
        for joint_id in range(model.njnt):
            if not model.jnt_limited[joint_id] or int(model.jnt_type[joint_id]) not in (2, 3):
                continue
            value = float(current.qpos[model.jnt_qposadr[joint_id]])
            lo, hi = model.jnt_range[joint_id]
            violations += int(value < lo - 1e-4 or value > hi + 1e-4)
        return violations

    def self_contacts(current):
        count = 0
        for contact_id in range(current.ncon):
            contact = current.contact[contact_id]
            body_a = int(model.geom_bodyid[contact.geom1])
            body_b = int(model.geom_bodyid[contact.geom2])
            count += int(body_a and body_b and body_a != body_b)
        return count

    # First let the submitted mechanism settle with no control. A free or poorly
    # supported assembly is allowed to fail visibly; no pose is overwritten.
    settle = mj.MjData(model)
    mj.mj_forward(model, settle)
    settle_start = settle.xpos[body_ids].copy()
    frame(settle, 'gravity_settle')
    settle_steps = int(np.ceil(1.0 / model.opt.timestep))
    sample_every = max(1, settle_steps // 10)
    peak_self_contacts = 0
    for step in range(settle_steps):
        mj.mj_step(model, settle)
        peak_self_contacts = max(peak_self_contacts, self_contacts(settle))
        if (step + 1) % sample_every == 0 and len(frames) < 12:
            frame(settle, 'gravity_settle')
    mj.mj_forward(model, settle)
    settle_delta = settle.xpos[body_ids] - settle_start
    max_body_displacement = float(np.max(np.linalg.norm(settle_delta, axis=1))) if body_ids else 0.
    max_body_drop = float(np.max(settle_start[:, 2] - settle.xpos[body_ids, 2])) if body_ids else 0.
    settle_limits = limit_violations(settle)
    settle_stable = finite(settle)

    # Probe each supported position actuator from an independent initial state.
    # The first response retains the legacy final-state fields for compatibility.
    supported = [i for i, item in enumerate(actuators) if item['position_control_supported']][:12]
    driven = supported[0] if supported else None
    responses = []
    first_data = None
    first_steps = int(np.ceil(.5 / model.opt.timestep))
    actuation_limit_violations = 0
    actuator_self_contacts = 0
    for probe_index, actuator_id in enumerate(supported):
        current_data = mj.MjData(model)
        mj.mj_forward(model, current_data)
        for candidate in supported:
            candidate_joint = int(model.actuator_trnid[candidate, 0])
            current_data.ctrl[candidate] = current_data.qpos[model.jnt_qposadr[candidate_joint]]
        joint = int(model.actuator_trnid[actuator_id, 0])
        qpos_address = int(model.jnt_qposadr[joint])
        start = float(current_data.qpos[qpos_address])
        lo, hi = (-1e3, 1e3)
        if model.actuator_ctrllimited[actuator_id]:
            lo, hi = model.actuator_ctrlrange[actuator_id]
        if model.jnt_limited[joint]:
            lo, hi = max(lo, model.jnt_range[joint, 0]), min(hi, model.jnt_range[joint, 1])
        target = float(np.clip(start + (.1 if start + .1 < hi else -.1), lo, hi))
        current_data.ctrl[actuator_id] = target
        probe_steps = first_steps if probe_index == 0 else int(np.ceil(.25 / model.opt.timestep))
        trace_every = max(1, probe_steps // 10)
        if probe_index == 0:
            frame(current_data, 'actuator_probe')
        for step in range(probe_steps):
            mj.mj_step(model, current_data)
            actuator_self_contacts = max(actuator_self_contacts, self_contacts(current_data))
            if probe_index == 0 and (step + 1) % trace_every == 0 and len(frames) < 24:
                frame(current_data, 'actuator_probe')
        mj.mj_forward(model, current_data)
        response = abs(float(current_data.qpos[qpos_address]) - start)
        violations = limit_violations(current_data)
        actuation_limit_violations += violations
        responses.append({'actuator_id': actuator_id, 'name': actuators[actuator_id]['name'],
                          'command_delta': abs(target - start), 'measured_joint_displacement': response,
                          'responded': bool(response > 1e-5 and finite(current_data)),
                          'joint_limit_violations': violations})
        if probe_index == 0:
            first_data = current_data

    final_data = first_data if first_data is not None else settle
    final = np.empty_like(initial)
    mj.mj_getState(model, final_data, final, spec)
    displacement = responses[0]['measured_joint_displacement'] if responses else 0.
    stable = bool(settle_stable and finite(final_data))
    moving_actuators = sum(int(item['responded']) for item in responses)
    joint_limit_violations = settle_limits + actuation_limit_violations

    jacobian_rank = 0
    if model.nv and body_ids:
        jacp = np.zeros((3, model.nv))
        jacr = np.zeros((3, model.nv))
        mj.mj_jacBody(model, data, jacp, jacr, body_ids[-1])
        jacobian_rank = int(np.linalg.matrix_rank(np.vstack((jacp, jacr)), tol=1e-7))
    dynamic_ids = [i for i in range(1, model.nbody) if model.body_dofnum[i]]
    physical_properties_valid = bool(all(model.body_mass[i] > 0 and np.all(model.body_inertia[i] > 0)
                                         for i in dynamic_ids))
    gravity_passed = bool(settle_stable and max_body_drop <= .25 and settle_limits == 0)
    actuator_passed = bool(supported and moving_actuators == len(supported))
    kinematic_passed = bool(model.nv and jacobian_rank > 0)

    failure_class = 'none'
    if not physical_properties_valid:
        failure_class = 'model_invalid'
    elif not stable:
        failure_class = 'numerical_instability'
    elif joint_limit_violations:
        failure_class = 'joint_limit_violation'
    elif not gravity_passed:
        failure_class = 'unstable_under_gravity'
    elif not supported or not actuator_passed:
        failure_class = 'unactuated'
    elif not kinematic_passed:
        failure_class = 'insufficient_kinematic_mobility'
    warnings = int(peak_self_contacts > 0 or actuator_self_contacts > 0 or len(supported) < model.nu)
    verdict = 'failed' if failure_class != 'none' else 'passed_with_warnings' if warnings else 'passed'
    tests = [
        {'id': 'model_compile', 'status': 'passed', 'measured': {'bodies': model.nbody - 1, 'joints': model.njnt, 'actuators': model.nu}, 'explanation': 'MuJoCo compiled the submitted native model in the isolated worker.'},
        {'id': 'physical_properties', 'status': 'passed' if physical_properties_valid else 'failed', 'measured': {'dynamic_bodies': len(dynamic_ids), 'minimum_dynamic_mass_kg': float(min((model.body_mass[i] for i in dynamic_ids), default=0.))}, 'explanation': 'Dynamic bodies require positive mass and principal inertia.'},
        {'id': 'gravity_settle', 'status': 'passed' if gravity_passed else 'failed', 'measured': {'simulated_seconds': float(settle.time), 'max_body_drop_m': max_body_drop, 'max_body_displacement_m': max_body_displacement}, 'explanation': 'The unpowered model was integrated under its configured gravity without pose overrides.'},
        {'id': 'actuator_response', 'status': 'passed' if actuator_passed else 'failed', 'measured': {'supported_position_actuators': len(supported), 'responded': moving_actuators}, 'explanation': 'Supported position actuators were commanded independently from restored initial states.'},
        {'id': 'joint_limits', 'status': 'passed' if joint_limit_violations == 0 else 'failed', 'measured': {'violations': joint_limit_violations}, 'explanation': 'Hinge and slide coordinates were checked against declared limits during both probes.'},
        {'id': 'kinematic_mobility', 'status': 'passed' if kinematic_passed else 'failed', 'measured': {'velocity_dofs': model.nv, 'terminal_body_jacobian_rank': jacobian_rank}, 'explanation': 'The terminal submitted body Jacobian was measured at the initial configuration.'},
    ]
    qualification = {
        'schema_version': 'vivacity.robot-qualification/1.0', 'verdict': verdict,
        'failure_class': failure_class, 'tests': tests,
        'measurements': {'gravity_m_s2': model.opt.gravity.tolist(), 'settle_steps': settle_steps,
                         'actuator_probe_steps': sum(first_steps if i == 0 else int(np.ceil(.25 / model.opt.timestep)) for i in range(len(supported))),
                         'max_body_drop_m': max_body_drop, 'max_body_displacement_m': max_body_displacement,
                         'position_actuators_tested': len(supported), 'position_actuators_responded': moving_actuators,
                         'peak_internal_contact_pairs': max(peak_self_contacts, actuator_self_contacts),
                         'joint_limit_violations': joint_limit_violations,
                         'terminal_body_jacobian_rank': jacobian_rank, 'numerically_stable': stable},
        'body_names': body_names, 'body_parent_indices': body_parents, 'frames': frames,
        'scope': 'Bounded initial-condition qualification. It measures compilation, passive gravity response, declared joint limits, supported position-actuator response and local Jacobian mobility. It does not certify fatigue life, manufacturing tolerances, controller safety, task success or hardware.'}
    return {'simulator': 'mujoco', 'simulator_version': mj.__version__, 'sandbox': sandbox,
            'physics_model_valid': True, 'robot_actuation_verified': bool(driven is not None and stable and displacement > 1e-5),
            'task_execution_verified': False, 'joints': joints, 'actuators': actuators,
            'sites': [name(mj.mjtObj.mjOBJ_SITE, i) for i in range(model.nsite)],
            'dynamic_bodies': [name(mj.mjtObj.mjOBJ_BODY, i) for i in range(1, model.nbody) if model.body_jntnum[i]],
            'collision_geometries': int(np.count_nonzero(model.geom_contype | model.geom_conaffinity)),
            'simulation_steps': first_steps, 'simulated_seconds': float(final_data.time),
            'driven_actuator': driven, 'joint_displacement': displacement, 'stable': stable,
            'state_encoding': 'mjSTATE_INTEGRATION', 'initial_state': initial.tolist(),
            'final_state': final.tolist(), 'initial_qpos': q0.tolist(), 'final_qpos': final_data.qpos.tolist(),
            'scope': 'Bounded initial-state robot qualification; not a manipulation controller or hardware certification.',
            'qualification': qualification}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(48 * 1024**2 + 1)
        if len(raw) > 48 * 1024**2:
            raise ValueError('worker input exceeds bound')
        request = json.loads(raw)
        streaming = request.get('task_config') is not None
        result = probe(request, emit=(lambda event: print(json.dumps(event, allow_nan=False), flush=True)) if streaming else None)
        print(json.dumps({'type': 'result', 'ok': True, 'result': result} if streaming
                         else {'ok': True, 'result': result}, allow_nan=False), flush=True)
    except Exception as exc:
        response = {'type': 'result', 'ok': False, 'error': str(exc)[:700]} if 'streaming' in locals() and streaming else {'ok': False, 'error': str(exc)[:700]}
        print(json.dumps(response), flush=True)
        sys.exit(1)
