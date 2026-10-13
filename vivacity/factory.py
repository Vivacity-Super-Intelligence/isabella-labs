"""Small-carton cell. All object motion is integrated by MuJoCo.

Driven cylindrical rollers transfer momentum through native friction contacts.
No runtime operation writes a carton pose. The shared layout uses metres/Z-up.
"""
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from .robotics import ASSET_DIR, RobotWorld, RoboticsBackend, STATE_SPEC, asset_digest
from .headless import collision_only

LAYOUT = json.loads(Path(__file__).with_name('factory_layout.json').read_text())


class FactorySettings(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    schema_version: str = 'vivacity.factory-settings/1.0'
    name: str = Field('Carton sorting baseline', min_length=1, max_length=80)
    seed: int = Field(19, ge=0, le=4294967295)
    carton_count: int = Field(3, ge=1, le=3)
    carton_mass_kg: float = Field(.06, ge=.02, le=.15)
    carton_friction: float = Field(.8, ge=.05, le=1.5)
    carton_half_size_m: float = Field(.025, ge=.02, le=.03)
    conveyor_speed_m_s: float = Field(.09, ge=.02, le=.18)
    arrival_interval_s: float = Field(18., ge=1., le=60.)
    realtime_speed: float = Field(2., ge=.25, le=8.)
    sort_threshold_kg: float = Field(.07, ge=.02, le=.15)
    gripper_force_scale: float = Field(1., ge=.005, le=1.)


def _geom(parent, name, kind, position, size, **kw):
    return ET.SubElement(parent, 'geom', name=name, type=kind,
                         pos=' '.join(map(str, position)), size=' '.join(map(str, size)), **kw)


def _rollers(root, parent, prefix, x, start_y, end_y):
    r = LAYOUT['roller_radius']
    count = round((end_y-start_y)/LAYOUT['roller_spacing'])+1
    for i in range(count):
        name = f'{prefix}_roller_{i}'
        body = ET.SubElement(parent, 'body', name=name, pos=f'{x} {start_y+i*LAYOUT["roller_spacing"]} {-r}')
        ET.SubElement(body, 'joint', name=name, type='hinge', axis='1 0 0', limited='false', damping='.002', armature='.0001')
        _geom(body, name, 'cylinder', [0,0,0], [r, LAYOUT['roller_width']/2],
              quat='.707106781 0 .707106781 0', mass='.035', friction='.8 .002 .0001',
              rgba='.5 .57 .54 1', condim='4', contype='2', conaffinity='1')
        ET.SubElement(root.find('actuator'), 'velocity', name=name, joint=name,
                      kv='.035', ctrlrange='-24 24', forcerange='-.25 .25')


@lru_cache(maxsize=2)
def _compiled(settings_json):
    settings = json.loads(settings_json)
    root = ET.parse(ASSET_DIR/'panda.xml').getroot()
    root.find('compiler').set('meshdir', str(ASSET_DIR/'assets'))
    root.find('option').set('timestep', '.002')
    root.find('option').set('cone', 'elliptic')
    root.find('option').set('impratio', '5')
    root.remove(root.find('keyframe'))
    for body in root.findall('.//body'): body.set('gravcomp','1')
    ET.SubElement(root.find(".//body[@name='hand']"),'site',name='pregrasp',pos='0 0 .103',size='.006')
    wb = root.find('worldbody')
    _geom(wb,'ground','plane',[0,0,-.8],[8,8,.1],rgba='.65 .67 .63 1')
    _geom(wb,'table','box',[0,0,-.4],[.185,.185,.4],rgba='.2 .25 .26 1')
    h = settings['carton_half_size_m']
    rng = np.random.default_rng(settings['seed'])
    for index in range(settings['carton_count']):
        name = 'target' if index==0 else f'carton_{index}'
        mass = settings['carton_mass_kg'] if index==0 else float(np.clip(settings['carton_mass_kg']*rng.uniform(.7,1.6),.02,.15))
        body=ET.SubElement(wb,'body',name=name,pos=f'.5 {-0.94-index*.16} {h+.001}')
        ET.SubElement(body,'freejoint',name='cube_free' if index==0 else name+'_free')
        _geom(body,'cube' if index==0 else name,'box',[0,0,0],[h,h,h],mass=str(mass),
              friction=f'{settings["carton_friction"]} .005 .0001', condim='4',priority='1',
              solref='.004 1',rgba='.66 .47 .25 1',contype='1',conaffinity='3')
    for prefix in ('infeed','transfer'):
        _rollers(root,wb,prefix,**LAYOUT[prefix])
    shuttle=ET.SubElement(wb,'body',name='shuttle',pos='0 0 0')
    ET.SubElement(shuttle,'joint',name='shuttle_slide',type='slide',axis='1 0 0',range='-.2 .2',damping='20')
    _geom(shuttle,'shuttle_deck','box',[.5,.68,-.055],[.12,.14,.025],mass='2',rgba='.25 .32 .3 1')
    _rollers(root,shuttle,'shuttle',**{k:v for k,v in LAYOUT['shuttle'].items() if k!='travel'})
    ET.SubElement(root.find('actuator'),'position',name='shuttle_slide',joint='shuttle_slide',kp='2000',kv='100',ctrlrange='-.2 .2',forcerange='-150 150')
    for lane in LAYOUT['lanes']:
        _rollers(root,wb,'lane_'+lane['id'],**{k:v for k,v in lane.items() if k!='id'})
        x=lane['x'];y=1.53
        _geom(wb,'bin_'+lane['id']+'_floor','box',[x,y,-.39],[.16,.2,.015],rgba='.35 .46 .4 1')
        for sign in (-1,1):
            _geom(wb,f'bin_{lane["id"]}_x_{sign}','box',[x+sign*.16,y,-.24],[.01,.2,.15])
            _geom(wb,f'bin_{lane["id"]}_y_{sign}','box',[x,y+sign*.2,-.24],[.16,.01,.15])
    # A physical end stop prevents station overshoot when the drive is disabled.
    _geom(wb,'infeed_stop','box',[.5,-.157,.017],[.095,.008,.017],rgba='.8 .6 .25 1')
    for prefix in ('infeed','transfer'):
        spec=LAYOUT[prefix]
        for side in (-1,1):
            _geom(wb,prefix+'_rail_'+str(side),'box',[spec['x']+side*.109,(spec['start_y']+spec['end_y'])/2,.004],
                  [.007,(spec['end_y']-spec['start_y'])/2+.025,.008],rgba='.2 .25 .26 1')
    ET.SubElement(wb,'camera',name='inspection',pos='.5 -.24 1.15',xyaxes='1 0 0 0 1 0',fovy='54')
    ET.SubElement(wb,'light',pos='1 -1 3',dir='-.3 .1 -1',diffuse='.8 .8 .8')
    visual=root.find('visual')
    if visual is None: visual=ET.SubElement(root,'visual')
    ET.SubElement(visual,'global',offwidth='320',offheight='240')
    from .physical_properties import configure_xml
    configure_xml(root,{'physics':{'gripper_force_scale':settings['gripper_force_scale']}})
    # Only remove visual robot meshes; inertias and collision surfaces remain.
    collision_only(root,enabled=True)
    digest=hashlib.sha256((ET.tostring(root,encoding='unicode')+asset_digest()+mj.__version__).encode()).hexdigest()
    return mj.MjModel.from_xml_string(ET.tostring(root,encoding='unicode')),digest


class FactoryBackend(RoboticsBackend):
    action_schema={'type':'factory_controls','drives':'roller velocity servos; shuttle position servo',
                   'units':{'belt_speed':'m/s','shuttle':'m'}}

    def create_world(self,config,seed=None):
        settings=FactorySettings.model_validate(config).model_dump()
        if seed is not None: settings['seed']=seed
        m,digest=_compiled(json.dumps(settings,sort_keys=True))
        d=mj.MjData(m)
        d.qpos[:9]=[0,0,0,-1.57079,0,1.57079,-.7853,.04,.04]
        d.ctrl[:7]=d.qpos[:7];d.ctrl[7]=255
        mj.mj_forward(m,d)
        return RobotWorld(m,d,settings,settings['seed'],digest)

    def snapshot(self,world):
        value=super().snapshot(world)
        value['backend']='factory'
        return value

    def fork(self,state):
        world=self.create_world(state['config'],state['seed'])
        self.restore(world,state)
        return world

    def set_drive(self,world,prefix,speed):
        for i in range(world.model.nu):
            if world.model.actuator(i).name.startswith(prefix+'_roller_'):
                world.data.ctrl[i]=-float(speed)/LAYOUT['roller_radius']

    def apply_action(self,world,action):
        allowed={'infeed','transfer','shuttle','lane_A','lane_B'}
        if set(action)-allowed: raise ValueError('unknown conveyor drive')
        for name,value in action.items():
            if not np.isfinite(value) or abs(value)>.18: raise ValueError('conveyor speed must be finite and within 0.18 m/s')
            self.set_drive(world,name,value)
        world.action=deepcopy(action)

    def step(self,world,steps=1):
        mj.mj_step(world.model,world.data,nstep=steps)
        if np.any(world.data.warning.number) or not np.isfinite(world.data.qpos).all():
            raise RuntimeError('MuJoCo reported an unstable factory state')

    def observe(self,world):
        m,d=world.model,world.data
        mj.mj_kinematics(m,d);mj.mj_comPos(m,d);mj.mj_comVel(m,d)
        cartons=[]
        for i in range(world.config['carton_count']):
            name='target' if i==0 else f'carton_{i}'
            body=m.body(name);v=np.zeros(6);mj.mj_objectVelocity(m,d,mj.mjtObj.mjOBJ_BODY,body.id,v,0)
            cartons.append({'id':name,'position_m':d.xpos[body.id].tolist(),'quaternion_wxyz':d.xquat[body.id].tolist(),
                            'linear_velocity_m_s':v[3:].tolist(),'angular_velocity_rad_s':v[:3].tolist(),'mass_kg':float(m.body_mass[body.id])})
        drives={}
        for prefix in ('infeed','transfer','shuttle','lane_A','lane_B'):
            aids=[i for i in range(m.nu) if m.actuator(i).name.startswith(prefix+'_roller_')]
            velocities=[float(d.qvel[m.jnt_dofadr[m.actuator_trnid[i,0]]]) for i in aids]
            drives[prefix]={'surface_speed_m_s':-float(np.mean(velocities))*LAYOUT['roller_radius'],
                            'motor_torque_sum_nm':float(np.sum(np.abs(d.actuator_force[aids])))}
        poses=[{'name':m.body(i).name,'position':d.xpos[i].tolist(),'quaternion_wxyz':d.xquat[i].tolist()} for i in range(1,m.nbody)]
        return {'schema_version':'vivacity.factory-frame/1.0','time':float(d.time),'qpos':d.qpos.tolist(),
                'qvel':d.qvel.tolist(),'ctrl':d.ctrl.tolist(),'body_transforms':poses,'cartons':cartons,
                'end_effector':d.site('pregrasp').xpos.tolist(),'conveyors':drives,'source':'mujoco'}

    def simulate(self,world,limits):
        trace=[self.observe(world)]
        for _ in range(int(limits.get('duration_s',1)/world.model.opt.timestep)):
            self.step(world)
            if round(world.data.time/world.model.opt.timestep)%25==0:trace.append(self.observe(world))
        return {'trace':trace,'final_state':self.snapshot(world)}

    def evaluate(self,world,result):
        position=world.data.body('target').xpos.copy()
        return {'reached_station':bool(-.29<position[1]<-.16),'position_m':position.tolist(),'source':'mujoco'}

    def commit(self,state): return self.snapshot(self.fork(state))
    def replay(self,branch): return {'source':'recorded_mujoco_frames','frames':deepcopy(branch['trace'])}
