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
import xml.etree.ElementTree as ET


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


def probe(request):
    # Imports and dynamic libraries are resolved before filesystem access closes.
    import mujoco as mj
    import numpy as np
    xml = base64.b64decode(request['xml'], validate=True)
    assets = {name: base64.b64decode(value, validate=True)
              for name, value in request['assets'].items()}
    root = ET.fromstring(xml)
    if root.tag == 'mujoco':
        compiler = root.find('compiler')
        if compiler is None:
            compiler = ET.SubElement(root, 'compiler')
        compiler.set('usethread', 'false')
        # VFS names have already been resolved by the parent validator.
        for key in ('meshdir', 'texturedir', 'assetdir'):
            compiler.attrib.pop(key, None)
        xml = ET.tostring(root, encoding='unicode')
    else:
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
        result = probe(json.loads(raw))
        print(json.dumps({'ok': True, 'result': result}, allow_nan=False))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)[:700]}))
        sys.exit(1)
