# Version 1 frontend contract

OpenAPI REST specification: root `openapi.json`, with an identical documentation copy at `docs/openapi.json` (regenerate both with `python -m scripts.export_openapi`). See `FRONTEND_HANDOFF.md` for complete frontend integration and `docs/frontend-examples.json` for actual responses. API schema version is `1.0`; URL major version is `/v1`. All request bodies reject unknown fields and non-finite values. World, state, experiment, branch and replay responses are named Pydantic schemas.

## Operations

| Endpoint | Meaning | HTTP |
| --- | --- | --- |
| POST /v1/worlds | Initialize adapter and persist initial/current state | 201 |
| GET /v1/worlds/{id} | Configuration, state, version, seed, lineage, history and evaluations | 200 |
| GET /v1/worlds/{id}/state | Measured structured observation | 200 |
| POST /v1/worlds/{id}/experiments | Persist and queue an isolated experiment | 202 |
| GET /v1/experiments/{id} | Job state, comparison, selected branch, metrics, stale flag | 200 |
| GET /v1/experiments/{id}/branches | Independently initialized candidates and measured outcomes | 200 |
| POST /v1/worlds/{id}/commit | Commit one successful branch from the current revision | 200 |
| POST /v1/worlds/{id}/reset | Restore current environment's initial snapshot | 200 |
| PATCH /v1/worlds/{id}/environment | Replace validated configuration and reset initial/current state | 200 |
| GET /v1/experiments/{id}/replay | Recorded evidence frames, original configuration | 200 |
| WS /v1/experiments/{id}/events | Persisted progress and measured branch outcomes | WebSocket |

Errors: 404 missing record; 409 failed/stale/mismatched branch commit or conflicting idempotency key; 422 invalid configuration/request/header; 429 bounded job queue full; 503 unavailable worker. Queue/worker responses include `Retry-After: 5`. A worker submission error is persisted as a failed experiment before 503 is returned.

## Safe experiment retries

Send an optional `Idempotency-Key` header with `POST /v1/worlds/{id}/experiments`. Generate one key for each deliberate action and reuse it when retrying that action after a lost/slow response. Keys are 1..128 ASCII letters, numbers, dot, underscore, colon or hyphen. They are scoped to the world ID. The normalized validated request settings are hashed; the same key/settings return the **original experiment ID and current status**, and different settings with the same key return 409. Requests without a key intentionally create separate experiments.

The key mapping is committed with the experiment, queued event and world history in SQLite. Concurrent retry requests and retries after restart cannot create another job. A retry also works when the job queue is full because it needs no new worker slot. Editing/resetting a world does not repurpose a key: the original result is returned with `stale: true`. Use a new key to deliberately compute a new revision or retry a failed job as new work. Keys currently remain for the lifetime of the local database; expiry/retention is not implemented. Browser CORS permits the header for configured origins.

## World state and lineage

MuJoCo snapshots store `mjSTATE_INTEGRATION` via `mj_getState` / `mj_setState`, including controls, solver warmstart, applied forces and other integration inputs. Metadata includes engine version, generated scene/mesh hash, seed, configuration and state bitmask. Each fork loads its own model and `MjData`. No mutable array or configuration list is shared between branches. Reproduction is validated in the pinned Windows/Python environment; cross-platform bitwise equality is not promised.

Branch `parent_state_reference` is world ID + revision + snapshot SHA-256. Each branch exposes its actual action, initial snapshot, final snapshot, sampled trace, evaluation and compute metrics. World history stores experiment IDs and branch relationships. Revision increments on environment edit, commit and reset. Older experiments remain replayable with their original configuration and `stale: true`; their results cannot be committed.

Branch rows, evaluation records, lineage and progress events are persisted together as each branch finishes. A later planner/worker failure retains already completed evidence. Unexpected adapter exceptions become `adapter_failure` with the operation phase and exception type. Such branches have an empty unavailable trace, and their physics timing/step/call counts are `null`; no fabricated counters or frames are supplied. `final_state` is `null` if it cannot be recovered safely. Replay source is `failed_adapter_execution`. Other independent candidates still run. A scientific comparison with a missing fit remains incomplete; when every branch has an adapter failure, the job ends `failed`. A mixed job may finish `completed` while reporting adapter errors in its performance; clients should display these failures beside the measured results.

## Robotics rendering

Positions are meters in MuJoCo's right-handed Z-up frame. Joint values are radians, velocities radians/second, time seconds. Body quaternions are **w,x,y,z**; Three.js constructors ordinarily require **x,y,z,w**, so reorder them. `body_transforms` are world transforms, not parent-relative transforms. Replay frames contain actual measured `qpos`, `qvel`, `ctrl`, simulation time, end-effector coordinates and body transforms sampled every 25 integration steps (50 ms) plus initial/final/failure frames. Contacts are checked every 2 ms even though replay is decimated. UI interpolation between sampled frames is visualization only.

The pre-grasp site is 0.103 m along the hand's local Z axis. Desired rotation matrix is diag(1,-1,-1). `target_position` is the pre-grasp site goal; the blue cube center is at the same XY, Z=0.026 m with 0.025 m half-size. Table center `[0.4,0,-0.04]`, half-size `[0.7,0.65,0.04]`; ground Z=-0.8. Obstacle size is **half-size**, not full dimensions. To render the arm accurately, consume the vendored Menagerie meshes and XML local geom transforms with returned body transforms. Mesh asset serving, React and Three.js integration are separate frontend work.

Robotics evaluation distinguishes `planning_failure`, `collision_failure`, `joint_limit_failure`, `controller_failure`, `timeout`, and `execution_success`. `planning_feasible` describes geometric checks only. Contacts with robot/environment or non-excluded self bodies are prohibited; the fixed link0/table mount is allowed. Successful execution requires position error ≤ 0.02 m, orientation error ≤ 0.08 rad, and no prohibited event. The direct candidate is executed as a diagnostic even when geometric checking predicts collision, and it stops at first prohibited event. RRT candidates with no path are recorded as planning failures with initial/final state and zero integration steps.

## Scientific rendering and metrics

Replay frames include observed position, fitted predicted position/velocity, time and a `train`/`heldout` tag. Residuals are predicted minus observed. RMSE is per-coordinate: sqrt(mean(dx²,dy²)). Fits see only the chronological training prefix; predictions are tested against the suffix. Training BIC is chi-squared under known observation noise + k*log(number of training coordinates); the common Gaussian constant cancels in comparison.

The additional mass is selected only if training BIC improves by >6, held-out RMSE improves by >5%, and the fit Jacobian has full rank. Otherwise retain the baseline. If a fit fails numerically, comparison remains incomplete with no selected result. Standard errors are a local Jacobian covariance approximation using known measurement noise; inspect rank, active bounds and caveats. No posterior probability is provided. A weak/noisy experiment may not support a real perturbation; this is a valid outcome.

## Events and reconnect

Connect to `ws://127.0.0.1:8000/v1/experiments/{id}/events?after=0`. Each JSON message has `schema_version`, monotonically increasing `seq`, `kind`, and `details`. Kinds: `queued`, `running`, `planned`, `branch_completed`, `completed`, `failed`. Keep the last `seq` and reconnect with `after=<seq>` to receive missed events. These are job/branch events, not a real-time 500 Hz frame stream. Replay holds the frames. A terminal event closes the socket with code 1000; missing IDs or disallowed browser origins close with 1008. Events are retained in SQLite and can be read after completion.

## Performance

The deterministic policy may run **one additional robotics planning round** when no candidate succeeds, IK converged, the starting state is collision-free, and the search budget is below 4000 iterations. It doubles the search budget (capped at 4000), retains every original failure, and executes additional RRT actions from the same parent snapshot. `followup_settings` and a second `planned` event identify this work. A request can therefore produce more than its initial candidate count, with at most nine branches. Scientific active observation acquisition is not automated; the investor controls a new experiment through environment settings.

World metrics expose initialization wall time. Experiment metrics expose planning, physics and whole-job wall time, process CPU time, queue wait, candidate count, simulation step count, SciPy integration-call count, serialized replay bytes and branch failure rate. A rejected candidate is an expected measured outcome, not an infrastructure error. A worker error reports `job_error_rate: 1`. CPU measurements include any concurrent API activity in the same process. Deterministic execution has zero hosted model cost; optional hosted adapter usage/billing telemetry is not implemented.

`adapter_error_count` counts failed adapter boundaries. `measurement_complete: false` means aggregate physics timing, simulation steps and integration calls sum the **available measurements only**; their missing portions cannot be inferred as zero. Branch performance uses nullable counters to make those gaps explicit. `job_error_rate` is 1 for a job containing adapter errors, including a mixed job that completed evaluation; it is 0 for normally measured jobs. Robotics selection and reported ranking both order successful candidates by measured simulated duration, then goal error.
