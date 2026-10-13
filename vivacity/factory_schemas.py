"""Wire contracts for factory clients; simulator-specific fields stay in adapters."""
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,JsonValue
from .factory import FactorySettings

class Wire(BaseModel):
    model_config=ConfigDict(extra='allow',allow_inf_nan=False)

class BodyTransform(Wire):
    name:str
    position:list[float]=Field(min_length=3,max_length=3)
    quaternion_wxyz:list[float]=Field(min_length=4,max_length=4)

class Carton(Wire):
    id:str
    position_m:list[float]=Field(min_length=3,max_length=3)
    quaternion_wxyz:list[float]=Field(min_length=4,max_length=4)
    linear_velocity_m_s:list[float]=Field(min_length=3,max_length=3)
    angular_velocity_rad_s:list[float]=Field(min_length=3,max_length=3)
    mass_kg:float

class FactoryFrame(Wire):
    schema_version:Literal['vivacity.factory-frame/1.0']
    time:float=Field(ge=0,description='Native MuJoCo simulation time in seconds.')
    qpos:list[float]
    qvel:list[float]
    ctrl:list[float]
    body_transforms:list[BodyTransform]
    cartons:list[Carton]
    carton_half_size_m:float
    end_effector:list[float]
    conveyors:dict[str,dict[str,JsonValue]]
    measurements:dict[str,JsonValue]=Field(description='SI native joint/contact/object data, power and per-step work integrals. See FACTORY_MEASUREMENTS.md. Null means unavailable.')
    source:Literal['mujoco']

class FactoryCellResponse(Wire):
    schema_version:Literal['vivacity.factory-cell/1.0']
    id:str
    created_at:float
    config:FactorySettings
    world_version:str
    engine:dict[str,str]
    initial_state:dict[str,JsonValue]=Field(description='Full mjSTATE_INTEGRATION, model hash, settings, seed and work ledger.')
    frame:FactoryFrame
    last_run_id:str|None
    collision_geometry:list[dict[str,JsonValue]]

class FactoryRunResponse(Wire):
    schema_version:Literal['vivacity.factory-run/1.0']
    id:str
    cell_id:str
    created_at:float
    config:FactorySettings
    world_version:str
    engine:dict[str,str]
    status:Literal['queued','running','paused','completed','failed','stopped','emergency_stopped','interrupted']
    phase:str
    mode:Literal['production','conveyor']
    frame:FactoryFrame
    events:list[dict[str,JsonValue]]
    metrics:dict[str,JsonValue]
    error:str|None

class FactorySamplesResponse(Wire):
    schema_version:Literal['vivacity.factory-samples/1.0']
    run_id:str
    frames:list[FactoryFrame]
    next_index:int
    total_samples:int
    status:str

class FactoryBenchmarkResponse(Wire):
    schema_version:Literal['vivacity.factory-benchmark-record/1.0']
    id:str
    name:str
    created_at:float
    status:str
    phase:str
    cell_id:str
    definition:dict[str,JsonValue]
    request:dict[str,JsonValue]
    trials:list[dict[str,JsonValue]]
    comparison:dict[str,JsonValue]
    error:str|None
    total_trials:int
