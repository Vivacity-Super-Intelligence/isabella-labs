"""Bounded six-axis MJCF drafts built from one shared physical/visual specification.

Compilation and a control smoke test do not qualify a custom robot for a task.
No design enters the executable catalogue until an actual task controller passes.
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Annotated, Literal
from xml.etree import ElementTree as ET

import mujoco as mj
import numpy as np
from pydantic import Field, model_validator

from .schemas import Schema
from .storage import encode
from .workspace import owner


LinkLength = Annotated[float, Field(ge=.06, le=.45)]
LinkMass = Annotated[float, Field(ge=.1, le=6.)]


class SixAxisDesignSpec(Schema):
    schema_version: Literal['vivacity.robot-design-spec/1.0'] = 'vivacity.robot-design-spec/1.0'
    name: str = Field('Custom six-axis arm', min_length=3, max_length=60)
    link_lengths_m: Annotated[list[LinkLength], Field(min_length=6, max_length=6)] = [.16, .28, .24, .12, .10, .08]
    link_masses_kg: Annotated[list[LinkMass], Field(min_length=6, max_length=6)] = [2.0, 2.2, 1.8, .9, .6, .4]
    link_radius_m: float = Field(.035, ge=.018, le=.06)
    torque_limit_nm: float = Field(35., ge=5., le=100.)
    gripper_opening_m: float = Field(.08, ge=.04, le=.12)

    @model_validator(mode='after')
    def geometry(self):
        if sum(self.link_lengths_m) > 1.45:
            raise ValueError('total link length must be at most 1.45 m')
        if self.link_radius_m * 2 >= min(self.link_lengths_m):
            raise ValueError('link radius must be less than half the shortest link')
        return self


class RobotDesignRequest(Schema):
    schema_version: Literal['vivacity.robot-design-request/1.0'] = 'vivacity.robot-design-request/1.0'
    description: str = Field(min_length=8, max_length=500)
    spec: SixAxisDesignSpec = Field(default_factory=SixAxisDesignSpec)


class RobotDesignResponse(Schema):
    schema_version: Literal['vivacity.robot-design/1.0'] = 'vivacity.robot-design/1.0'
    id: str
    description: str
    spec: SixAxisDesignSpec
    status: Literal['draft'] = 'draft'
    compiled: bool
    control_smoke_passed: bool
    task_validated: bool = False
    executable: bool = False
    model_sha256: str
    simulator_version: str
    measured_joint_displacement_rad: float
    model_joint_count: int
    model_actuator_count: int
    explanation: str
    created_unix_s: float


def mjcf_for(spec: SixAxisDesignSpec) -> str:
    root = ET.Element('mujoco', model='vivacity_six_axis_draft')
    ET.SubElement(root, 'compiler', angle='radian')
    ET.SubElement(root, 'option', timestep='.002', gravity='0 0 -9.81')
    world = ET.SubElement(root, 'worldbody')
    ET.SubElement(world, 'geom', name='floor', type='plane', size='2 2 .1', rgba='.25 .28 .27 1')
    parent = ET.SubElement(world, 'body', name='robot_base', pos='0 0 .55')
    ET.SubElement(parent, 'geom', name='base', type='cylinder', size='.09 .06', mass='3', rgba='.36 .42 .44 1')
    axes = ('0 0 1', '0 1 0', '0 1 0', '1 0 0', '0 1 0', '1 0 0')
    actuator = ET.SubElement(root, 'actuator')
    for i, (length, mass, axis) in enumerate(zip(spec.link_lengths_m, spec.link_masses_kg, axes), 1):
        vertical = i == 1
        body = ET.SubElement(parent, 'body', name=f'link_{i}',
                             pos='0 0 .06' if i == 1 else
                             f'0 0 {spec.link_lengths_m[0]:.6f}' if i == 2 else
                             f'{spec.link_lengths_m[i-2]:.6f} 0 0')
        ET.SubElement(body, 'joint', name=f'joint_{i}', type='hinge', axis=axis,
                      range='-2.9 2.9', limited='true', damping='.35', armature='.02')
        endpoint = f'0 0 {length:.6f}' if vertical else f'{length:.6f} 0 0'
        ET.SubElement(body, 'geom', name=f'link_geom_{i}', type='capsule', fromto=f'0 0 0 {endpoint}',
                      size=f'{spec.link_radius_m:.6f}', mass=f'{mass:.6f}', rgba='.72 .77 .76 1')
        ET.SubElement(actuator, 'motor', name=f'motor_{i}', joint=f'joint_{i}', gear='1',
                      ctrllimited='true', ctrlrange=f'{-spec.torque_limit_nm:.6f} {spec.torque_limit_nm:.6f}')
        parent = body
    tool = ET.SubElement(parent, 'body', name='parallel_gripper', pos=f'{spec.link_lengths_m[-1]:.6f} 0 0')
    ET.SubElement(tool, 'geom', name='gripper_palm', type='box', size='.035 .05 .018', mass='.18', rgba='.28 .35 .35 1')
    for side in (-1, 1):
        finger = ET.SubElement(tool, 'body', name=f'finger_{"left" if side < 0 else "right"}', pos='0 0 0')
        ET.SubElement(finger, 'joint', name=f'finger_joint_{"left" if side < 0 else "right"}',
                      type='slide', axis=f'0 {side} 0', range=f'0 {spec.gripper_opening_m/2:.6f}', limited='true')
        ET.SubElement(finger, 'geom', name=f'finger_geom_{"left" if side < 0 else "right"}',
                      type='box', pos=f'.035 {side*.035:.6f} 0', size='.03 .008 .015',
                      mass='.06', rgba='.22 .30 .30 1')
        ET.SubElement(actuator, 'motor', name=f'finger_motor_{"left" if side < 0 else "right"}',
                      joint=f'finger_joint_{"left" if side < 0 else "right"}', gear='1',
                      ctrllimited='true', ctrlrange='-8 8')
    return ET.tostring(root, encoding='unicode')


class RobotDesignService:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS viva_robot_designs(
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, mjcf TEXT NOT NULL)''')
            db.execute('''CREATE TABLE IF NOT EXISTS viva_robot_design_keys(
                owner TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL,
                design_id TEXT NOT NULL, PRIMARY KEY(owner,key))''')
            db.execute('''CREATE TABLE IF NOT EXISTS viva_robot_design_admissions(
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, ip_hash TEXT NOT NULL,
                created_unix_s REAL NOT NULL)''')

    def create(self, request: RobotDesignRequest, token: str, key: str | None = None, ip: str = '') -> dict:
        fingerprint=hashlib.sha256(encode(request.model_dump()).encode()).hexdigest()
        if key:
            with self.store.connect() as db:
                prior=db.execute('SELECT fingerprint,design_id FROM viva_robot_design_keys WHERE owner=? AND key=?',
                                 (owner(token),key)).fetchone()
            if prior:
                if prior[0]!=fingerprint:
                    from .runtime import Conflict
                    raise Conflict('robot design key was reused for another specification')
                return self.get(prior[1],token)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COUNT(*) FROM viva_robot_designs WHERE owner=?',(owner(token),)).fetchone()[0]>=30:
                from .runtime import Busy
                raise Busy('robot design limit reached for this workspace')
            recent=time.time()-3600
            ip_hash=hashlib.sha256(ip.encode()).hexdigest()
            counts=db.execute('''SELECT COUNT(*),SUM(CASE WHEN ip_hash=? THEN 1 ELSE 0 END)
                                 FROM viva_robot_design_admissions WHERE created_unix_s>?''',(ip_hash,recent)).fetchone()
            if counts[0]>=120 or (counts[1] or 0)>=20:
                from .runtime import Busy
                raise Busy('robot design rate limit reached; try later')
            db.execute('INSERT INTO viva_robot_design_admissions VALUES(?,?,?,?)',
                       (str(uuid.uuid4()),owner(token),ip_hash,time.time()))
        xml = mjcf_for(request.spec)
        try:
            model = mj.MjModel.from_xml_string(xml)
            data = mj.MjData(model)
            mj.mj_forward(model, data)
            initial = float(data.qpos[0])
            data.ctrl[0] = min(4., request.spec.torque_limit_nm)
            for _ in range(100):
                mj.mj_step(model, data)
            displacement = abs(float(data.qpos[0]) - initial)
            smoke = bool(np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all() and displacement > .001)
        except (mj.FatalError, ValueError) as exc:
            raise ValueError(f'custom robot draft did not compile or step: {type(exc).__name__}') from None
        if not smoke:
            raise ValueError('custom robot draft did not pass the bounded control smoke test')
        now = time.time()
        record = RobotDesignResponse(id=str(uuid.uuid4()), description=request.description,
            spec=request.spec, compiled=True, control_smoke_passed=True,
            model_sha256=hashlib.sha256(xml.encode()).hexdigest(), simulator_version=mj.__version__,
            measured_joint_displacement_rad=displacement, model_joint_count=model.njnt,
            model_actuator_count=model.nu,
            explanation='Compiled and stepped in MuJoCo. IK, collision-aware planning, grasping and sorting are not validated for this design; it remains a non-executable draft.',
            created_unix_s=now).model_dump()
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if key:
                prior=db.execute('SELECT fingerprint,design_id FROM viva_robot_design_keys WHERE owner=? AND key=?',
                                 (owner(token),key)).fetchone()
                if prior:
                    if prior[0]!=fingerprint:
                        from .runtime import Conflict
                        raise Conflict('robot design key was reused for another specification')
                    return self.get(prior[1],token)
            db.execute('INSERT INTO viva_robot_designs VALUES(?,?,?,?)',
                       (record['id'],owner(token),encode(record),xml))
            if key:db.execute('INSERT INTO viva_robot_design_keys VALUES(?,?,?,?)',
                              (owner(token),key,fingerprint,record['id']))
        return record

    def get(self, identifier: str, token: str) -> dict:
        with self.store.connect() as db:
            row=db.execute('SELECT payload FROM viva_robot_designs WHERE id=? AND owner=?',(identifier,owner(token))).fetchone()
        if not row:raise KeyError(identifier)
        return json.loads(row[0])

    def xml(self, identifier: str, token: str) -> str:
        with self.store.connect() as db:
            row=db.execute('SELECT mjcf FROM viva_robot_designs WHERE id=? AND owner=?',(identifier,owner(token))).fetchone()
        if not row:raise KeyError(identifier)
        return row[0]
