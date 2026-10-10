from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Schema(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]


class RoboticsConfig(Schema):
    obstacle_position: Vec3 = [0.45, 0.04, 0.22]
    obstacle_size: Vec3 = [0.055, 0.13, 0.22]
    target_position: Vec3 = [0.55, 0.28, 0.22]

    @model_validator(mode='after')
    def bounds(self):
        x, y, z = self.obstacle_position
        if not (0.15 <= x <= 0.8 and -0.5 <= y <= 0.5 and 0.05 <= z <= 0.6):
            raise ValueError('obstacle outside workcell bounds')
        if not all(0.01 <= v <= 0.4 for v in self.obstacle_size):
            raise ValueError('obstacle half-sizes must be 0.01..0.4 m')
        if not (0.15 <= self.target_position[0] <= 0.8 and abs(self.target_position[1]) <= 0.5 and 0.1 <= self.target_position[2] <= 0.7):
            raise ValueError('target outside workcell bounds')
        return self


class ScienceConfig(Schema):
    central_mu: float = Field(1, ge=0.7, le=1.3)
    hidden_mass: float = Field(0.12, ge=0, le=0.3)
    perturbing_position: Annotated[list[float], Field(min_length=2, max_length=2)] = [2.5, 0.4]
    initial_state: Annotated[list[float], Field(min_length=4, max_length=4)] = [1.0, 0.0, 0.0, 1.0]
    noise_std: float = Field(0.001, ge=0.00001, le=0.05)
    samples: int = Field(70, ge=30, le=200)
    horizon: float = Field(5, ge=2, le=8)
    train_fraction: float = Field(0.7, ge=0.5, le=0.85)

    @model_validator(mode='after')
    def bounds(self):
        import numpy as np
        if not (2 <= np.linalg.norm(self.perturbing_position) <= 5):
            raise ValueError('fixed perturber radius must be 2..5')
        if not (0.8 <= np.linalg.norm(self.initial_state[:2]) <= 1.2):
            raise ValueError('initial orbital radius must be 0.8..1.2')
        if not (0.85 <= np.linalg.norm(self.initial_state[2:]) <= 1.15):
            raise ValueError('initial orbital speed must be 0.85..1.15')
        return self


class ClothConfig(Schema):
    side_length: float = Field(.4,ge=.3,le=.5)
    mass: float = Field(.08,ge=.03,le=.2)
    friction: float = Field(.6,ge=.1,le=1.5)


class CreateWorld(Schema):
    schema_version: Literal['1.0'] = '1.0'
    backend: Literal['mujoco', 'scipy', 'cloth']
    seed: int = Field(7, ge=0, le=2**32-1)
    config: RoboticsConfig | ScienceConfig | ClothConfig | None = None

    @model_validator(mode='after')
    def matching_config(self):
        expected = {'mujoco':RoboticsConfig,'scipy':ScienceConfig,'cloth':ClothConfig}[self.backend]
        if self.config is None:
            self.config = expected()
        if not isinstance(self.config, expected):
            raise ValueError('config does not match backend')
        return self


class ExperimentRequest(Schema):
    candidates: int = Field(3, ge=2, le=5)
    planner_iterations: int = Field(1500, ge=100, le=4000)
    max_simulation_seconds: float = Field(25, ge=0.1, le=40)
    policy: Literal['deterministic', 'llm'] = 'deterministic'
    search_candidates: int = Field(0, ge=0, le=10000)
    physics_budget: int = Field(12, ge=3, le=24)


class HostedProposal(Schema):
    candidates: int = Field(ge=2, le=5)
    planner_iterations: int = Field(ge=100, le=4000)


class EnvironmentPatch(Schema):
    config: RoboticsConfig | ScienceConfig | ClothConfig


class CommitRequest(Schema):
    experiment_id: str
    branch_id: str


class ImportResponse(Schema):
    schema_version: Literal['vivacity.import/1.0']='vivacity.import/1.0'
    id: str
    filename: str
    entrypoint: str
    format: str
    status: Literal['visual_only','configuration_required']
    physics_ready: Literal[False]=False
    preview_available: bool
    sha256: str
    uploaded_bytes: int
    created_unix_s: float
    summary: dict
    diagnostics: list[str]


class ImportPreview(Schema):
    positions: list[Vec3]
    indices: list[int]
    vertex_count: int
    triangle_count: int
    coordinate_system: str


class WorldResponse(Schema):
    schema_version: Literal['1.0'] = '1.0'
    id: str
    backend: str
    config: dict
    state: dict
    initial_state: dict
    action_schema: dict
    simulator_version: str
    seed: int
    revision: int
    history: list[str]
    branches: list[dict]
    evaluations: list[dict]
    performance: dict


class ExperimentResponse(Schema):
    schema_version: Literal['1.0'] = '1.0'
    id: str
    world_id: str
    revision: int
    status: Literal['queued', 'running', 'completed', 'failed']
    request: dict
    selected_branch_id: str | None = None
    result: dict = {}
    performance: dict = {}
    error: str | None = None
    stale: bool = False


class BranchResponse(Schema):
    schema_version: Literal['1.0'] = '1.0'
    id: str
    experiment_id: str
    parent_state_reference: str
    initial_state: dict
    action: dict
    trace: list[dict]
    final_state: dict | None
    evaluation: dict
    performance: dict


class StateResponse(Schema):
    schema_version: Literal['1.0'] = '1.0'
    world_id: str
    revision: int
    observation: dict


class ReplayResponse(Schema):
    schema_version: Literal['1.0'] = '1.0'
    experiment_id: str
    backend: str
    config: dict
    stale: bool
    branches: list[dict]


class EventResponse(Schema):
    schema_version: Literal['1.0'] = '1.0'
    seq: int
    kind: Literal['queued', 'running', 'planned', 'progress', 'branch_completed', 'completed', 'failed']
    details: dict


class BranchExport(Schema):
    schema_version: Literal['vivacity.branch/1.0'] = 'vivacity.branch/1.0'
    experiment_id: str
    branch_id: str
    world_type: str
    simulation_backend: str
    simulator_version: str
    initial_configuration: dict
    initial_state_reference: str
    state_encoding: str
    initial_state: dict
    final_state: dict | None
    action: dict
    recorded_frames: list[dict]
    evaluation: dict
    constraint_violations: list[dict]
    success: bool
    seed: int
    configuration_sha256: str
    model_hash: str | None
    timestamps: dict
    performance: dict
