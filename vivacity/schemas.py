from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Schema(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]


class RoboticsConfig(Schema):
    task: Literal['reach', 'pick_place'] = 'reach'
    scene_profile: Literal['workcell', 'orbital_salvage'] = 'workcell'
    source_import_id: str | None = None
    obstacle_enabled: bool = True
    cube_position: Vec3 = [0.5, -0.15, 0.026]
    placement_position: Vec3 = [0.5, 0.18, 0.026]
    cube_half_size: float = Field(0.025, ge=0.02, le=0.03)
    cube_mass: float = Field(0.06, ge=0.02, le=0.15)
    cube_friction: float = Field(1.0, ge=0.05, le=1.5)
    obstacle_position: Vec3 = [0.45, 0.04, 0.22]
    obstacle_size: Vec3 = [0.055, 0.13, 0.22]
    target_position: Vec3 = [0.55, 0.28, 0.22]

    @model_validator(mode='after')
    def bounds(self):
        if self.scene_profile == 'orbital_salvage':
            if self.task != 'pick_place' or not self.source_import_id:
                raise ValueError('Orbital task requires pickup and a verified source import')
            if abs(self.obstacle_size[0]-self.obstacle_size[1]) > 1e-8:
                raise ValueError('reactor radial half-sizes must match')
            if abs(self.cube_half_size - .025) > 1e-9:
                raise ValueError('Orbital cargo geometry is fixed by its adapted source fixture')
        for point in (self.cube_position, self.placement_position):
            if not (.15 <= point[0] <= .8 and abs(point[1]) <= .45 and .02 <= point[2] <= .032):
                raise ValueError('pickup and placement centers must be on the supported table workspace')
        if self.task == 'pick_place' and any(abs(point[2] - (self.cube_half_size + .001)) > .002 for point in (self.cube_position, self.placement_position)):
            raise ValueError('pickup and placement center heights must match the cube size')
        # Coordinates supplied by range controls are binary floats. Accept the
        # exact 10 cm boundary despite harmless representation error.
        if self.task == 'pick_place' and sum((a-b)**2 for a,b in zip(self.cube_position[:2], self.placement_position[:2])) < (.1 - 1e-9)**2:
            raise ValueError('pickup and placement must be at least 0.1 m apart')
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
    robot_model: Literal['panda'] = 'panda'
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
    physics_trials: int = Field(0, ge=0, le=5000)
    execute_selected: bool = False
    realtime_execution: bool = False
    candidates: int = Field(3, ge=2, le=5)
    planner_iterations: int = Field(1500, ge=100, le=4000)
    max_simulation_seconds: float = Field(25, ge=0.1, le=40)
    policy: Literal['deterministic', 'llm'] = 'deterministic'
    search_candidates: int = Field(0, ge=0, le=10000)
    physics_budget: int = Field(12, ge=3, le=24)

    @model_validator(mode='after')
    def trial_count_matches_generation(self):
        if self.physics_trials and self.physics_trials != self.search_candidates:
            raise ValueError('full physics trials require matching search_candidates')
        return self


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
    status: Literal['visual_only','configuration_required','physics_verifying','physics_valid','actuation_verified','physics_failed','manipulation_configured']
    physics_ready: bool=False
    preview_available: bool
    sha256: str
    uploaded_bytes: int
    created_unix_s: float
    summary: dict
    diagnostics: list[str]
    readiness: list[str]=[]
    capabilities: dict | None=None
    configured_world_id: str | None=None


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
    status: Literal['queued', 'running', 'completed', 'failed', 'cancelled']
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


class TrialResponse(Schema):
    schema_version: Literal['vivacity.trial/1.0'] = 'vivacity.trial/1.0'
    completion_seq: int
    candidate_index: int
    parent_state_reference: str
    action: dict
    engine: str
    control_sha256: str
    final_state: dict
    evaluation: dict
    performance: dict


class TrialsResponse(Schema):
    schema_version: Literal['vivacity.trials/1.0'] = 'vivacity.trials/1.0'
    completed: int
    items: list[TrialResponse]
    next_after: int | None


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
    kind: Literal['queued', 'running', 'planned', 'progress', 'branch_completed', 'completed', 'failed', 'cancelled']
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


class SessionRequest(CreateWorld):
    physics_trials: int = Field(0, ge=0, le=5000)
    max_cycles: int = Field(4, ge=1, le=8)
    realtime_execution: bool = True
    search_candidates: int = Field(0, ge=0, le=10000)
    physics_budget: int = Field(3, ge=3, le=12)

    @model_validator(mode='after')
    def trial_backend(self):
        if self.physics_trials and (self.backend!='mujoco' or self.config.task!='pick_place' or self.physics_trials!=self.search_candidates):
            raise ValueError('full physics trials require Panda pickup and matching search_candidates')
        return self


class SessionResponse(Schema):
    pause_requested: bool = False
    paused: bool = False
    paused_seconds: float = 0.
    schema_version: Literal['vivacity.session/1.0'] = 'vivacity.session/1.0'
    id: str
    backend: str
    status: Literal['active', 'stopping', 'stopped', 'completed', 'failed']
    world_id: str
    experiment_id: str | None = None
    cycle: int
    max_cycles: int
    experiments: list[str]
    world_ids: list[str]
    error: str | None = None
    started_unix_s: float
    last_heartbeat_unix_s: float
    conditions: list[dict]


class LiveState(Schema):
    schema_version: Literal['vivacity.live/1.0'] = 'vivacity.live/1.0'
    experiment_id: str
    world_id: str
    sequence: int
    timestamp_unix_s: float
    stage: str
    frame: dict
