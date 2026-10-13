"""Versioned library/configuration contracts, independent of simulator state."""
from typing import Literal, Annotated
from pydantic import Field, model_validator
from .schemas import Schema, Vec3, StaticGeometry, CreateWorld, SessionRequest


class Lighting(Schema):
    ambient: float = Field(.72, ge=.1, le=2.)
    key_intensity: float = Field(3.2, ge=.1, le=5.)


class EnvironmentSpec(Schema):
    name: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=800)
    dimensions_m: Vec3 = [6., 6., 3.]
    lighting: Lighting = Lighting()
    geometries: Annotated[list[StaticGeometry], Field(max_length=24)] = []

    @model_validator(mode='after')
    def valid_scene(self):
        if any(not 1 <= x <= 16 for x in self.dimensions_m):
            raise ValueError('environment dimensions must be 1..16 m')
        if len({x.name for x in self.geometries}) != len(self.geometries):
            raise ValueError('geometry names must be unique')
        return self


class LibraryWorld(Schema):
    schema_version: Literal['vivacity.library/1.0'] = 'vivacity.library/1.0'
    id: str
    version: int = 1
    name: str
    description: str
    source: Literal['prebuilt', 'openai', 'worldlabs', 'imported']
    spec: EnvironmentSpec
    created_unix_s: float
    sha256: str
    import_id: str | None = None
    provider_world_id: str | None = None
    provider_url: str | None = None
    preview_available: bool = False
    physics_scope: str
    mapping: dict | None = None
    deleted: bool = False
    editable: bool = True


class RenameRequest(Schema):
    name: str = Field(min_length=1, max_length=64)


class GenerationRequest(Schema):
    prompt: str = Field(min_length=8, max_length=4000)
    provider: Literal['openai', 'worldlabs'] = 'worldlabs'
    seed: int = Field(7, ge=0, le=2**32-1)
    model: Literal['marble-1.0-draft', 'marble-1.1'] = 'marble-1.0-draft'


class GenerationResponse(Schema):
    schema_version: Literal['vivacity.generation/1.0'] = 'vivacity.generation/1.0'
    id: str
    status: Literal['queued', 'interpreting', 'generating', 'receiving', 'completed', 'failed']
    provider: str
    prompt: str
    seed: int
    model: str
    operation_id: str | None = None
    world_id: str | None = None
    created_unix_s: float
    updated_unix_s: float
    error: str | None = None
    interpretation: EnvironmentSpec | None = None
    provider_cost_credits: int | None = None
    events: list[dict] = []


class ImportMapping(Schema):
    name: str = Field(min_length=1, max_length=64)
    scale: float = Field(1., ge=.001, le=100.)
    position_m: Vec3 = [2.5, 2.5, .5]
    up_axis: Literal['y', 'z'] = 'y'

    @model_validator(mode='after')
    def bounds(self):
        if any(abs(v) > 6 for v in self.position_m):
            raise ValueError('import placement must be inside ±6 m')
        return self


class ExperimentConfiguration(Schema):
    schema_version: Literal['vivacity.configuration/1.0'] = 'vivacity.configuration/1.0'
    name: str = Field(min_length=1, max_length=80)
    environment_id: str
    robot_id: str = 'panda'
    gripper_id: str = 'panda_parallel'
    operation_id: Literal['pick_place', 'object_transfer', 'reach', 'randomized_manipulation', 'cloth_fold','sorting','assembly','stacking','insertion','machine_tending'] = 'pick_place'
    seed: int = Field(7, ge=0, le=2**32-1)
    target_position: Vec3 = [.5, -.15, .026]
    destination_position: Vec3 = [.5, .18, .026]
    object_half_sizes: Vec3 = [.025, .025, .025]
    object_mass_kg: float = Field(.06, ge=.02, le=.15)
    object_friction: float = Field(1., ge=.05, le=1.5)
    sort_property: Literal['mass','width'] = 'mass'
    sort_threshold: float = Field(.08,ge=.01,le=.2)
    alternate_destination_position: Vec3 = [.5,.35,.026]
    trial_mode: Literal['adaptive', 'fixed'] = 'adaptive'
    validation_trials: int = Field(3, ge=3, le=24)
    randomization_cycles: int = Field(1, ge=1, le=8)
    realtime_speed: float = Field(1., ge=.25, le=4.)


class ConfigurationResponse(Schema):
    schema_version: Literal['vivacity.saved-configuration/1.0'] = 'vivacity.saved-configuration/1.0'
    id: str
    configuration: ExperimentConfiguration
    created_unix_s: float
    sha256: str
    deleted: bool = False


class ResolvedConfiguration(Schema):
    world: CreateWorld
    session: SessionRequest
    provenance: dict


class CustomOperationRequest(Schema):
    prompt: str = Field(min_length=8, max_length=2000)
    environment_id: str


class OperationProposal(Schema):
    supported: bool
    explanation: str = Field(max_length=600)
    configuration: ExperimentConfiguration


class RunOverrides(Schema):
    config: dict | None = None
