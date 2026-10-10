# Vivacity frontend handoff

Verified 2026-10-10 on Windows / Python 3.12. Build the investor UI in `frontend/`, preserving this backend. The functional milestone is **collision-free reaching**, never grasping. Both labs run real numerical experiments. Default orchestration is explicitly a deterministic policy, not an LLM.

## Files Claude Code should read

| File | Purpose |
| --- | --- |
| `openapi.json` | Authoritative exported REST schemas and `x-websockets` event schema |
| `vivacity/schemas.py` | Request validation/defaults and named response envelopes |
| `docs/frontend-examples.json` | Complete responses from 15 actual HTTP exchanges plus actual WebSocket messages; capture metadata wraps each exchange |
| `docs/robot-geometry.json` | Compiled MuJoCo body/geom bindings, local geom poses, mesh buffer offsets and colors |
| `docs/robot-meshes.bin` | Actual compiled mesh vertices and triangle indices, 6,400,572 bytes |
| `assets/menagerie/franka_emika_panda/LICENSE` and `assets/PROVENANCE.md` | Model license and exact upstream revision |
| `docs/API.md` | Persistence, revisions, retries and failure semantics |
| `docs/SCIENTIFIC_SPEC.md`, `docs/EVALUATION_PROTOCOL.md`, `docs/TRUTH_LEAKAGE_POLICY.md` | Scientific assumptions, comparison criteria and truth isolation |
| `fixtures/robotics.json`, `fixtures/invisible_planet.json` | Input fixtures, never expected winners |
| `IMPLEMENTATION_STATUS.md` | Tested capabilities, measured performance and missing functionality |
| `artifacts/final-demo.json`, `artifacts/handoff-verification.json` | Real execution evidence; inspection only, never feed these as live results |
| `artifacts/package-verification.json` | Six real HTTP/WS experiments from an isolated export of the staged backend and vendored assets |

Captured IDs belong to the verification database and may not exist in a fresh checkout. Always create worlds and use IDs returned by the running service. Inner `response_body` values in `docs/frontend-examples.json` are exact responses, not mocked examples. That file includes large branch/replay payloads intentionally; it should not be bundled into the UI.

## Start the backend

Run from `P:\VIVACITY\DEMO-` in PowerShell. The existing `.venv` works. For a fresh checkout:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-lock.txt
.\.venv\Scripts\python -m uvicorn vivacity.api:app --host 127.0.0.1 --port 8000
```

Use one Uvicorn process. Do not add multiple workers or use reload during a demonstration; restarting fails interrupted jobs honestly. Health: `http://127.0.0.1:8000/health`; Swagger: `http://127.0.0.1:8000/docs`. SQLite defaults to `data/vivacity.sqlite3`; set server `VIVACITY_DATABASE` to a different filename for an isolated demonstration.

React development origin must be exactly `http://localhost:5173` or `http://127.0.0.1:5173`. Both HTTP CORS and WebSocket origin checks permit these. For another origin set server `VIVACITY_CORS_ORIGINS` to a comma-separated explicit list and restart. No wildcard credentialed CORS or authentication is implemented. Keep the backend on loopback.

Suggested frontend environment (create within the new frontend only):

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Use native `fetch` and `WebSocket`; no backend SDK is needed. Any frontend dependency versions and browser rendering must be verified when Claude builds the UI.

If `frontend/` does not already exist, Claude can initialize it with the following commands. If it exists, inspect and preserve its implementation instead of scaffolding over it. These frontend setup commands have not been executed in this backend handoff. The scaffold syntax follows the current [Vite guide](https://vite.dev/guide/).

```powershell
node --version
npm create vite@latest frontend -- --template react-ts
Set-Location frontend
npm install
npm install three
npm install -D @types/three
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Use a supported Node release per Vite's package engine requirements, retain the generated package lock, and run `npm run build` after implementation. The strict port keeps the browser origin aligned with the backend allowlist. The scaffold alone is not the investor UI; Claude must implement and browser-test the journey below.

## Exact REST operations

All bodies are JSON; unknown request fields and non-finite values are rejected. API envelope `schema_version` is `"1.0"`; route version is `/v1`. Backend-specific observations, evaluations and snapshots remain dictionaries. Treat snapshots as opaque server state.

| Method and endpoint | Request | Response / status |
| --- | --- | --- |
| `POST /v1/worlds` | `CreateWorld` below | `WorldResponse`, 201 |
| `GET /v1/worlds/{world_id}` | None | `WorldResponse`, 200 |
| `GET /v1/worlds/{world_id}/state` | None | `StateResponse`, 200 |
| `POST /v1/worlds/{world_id}/experiments` | `ExperimentRequest`; optional `Idempotency-Key` header | `ExperimentResponse`, 202 |
| `GET /v1/experiments/{experiment_id}` | None | `ExperimentResponse`, 200 |
| `GET /v1/experiments/{experiment_id}/branches` | None | Array of `BranchResponse`, 200 |
| `POST /v1/worlds/{world_id}/commit` | `{"experiment_id":"...","branch_id":"..."}` | Updated `WorldResponse`, 200 |
| `POST /v1/worlds/{world_id}/reset` | No body | Updated `WorldResponse`, 200 |
| `PATCH /v1/worlds/{world_id}/environment` | `{"config":{...}}` | Updated `WorldResponse`, 200 |
| `GET /v1/experiments/{experiment_id}/replay` | None | `ReplayResponse`, 200 |
| `GET /health` | None | Status, schema version, simulator versions, 200 |

No world-list, experiment-list, delete, cancellation, manual joint action, mesh-serving or live physics-stream endpoint exists. World history is available through `GET /v1/worlds/{world_id}`. The frontend can retain its own created world IDs locally; store only IDs/preferences, not copies of private server state.

### Create a robotics world

```json
{"schema_version":"1.0","backend":"mujoco","seed":7,"config":{"obstacle_position":[0.45,0.04,0.22],"obstacle_size":[0.055,0.13,0.22],"target_position":[0.55,0.28,0.22]}}
```

`{"backend":"mujoco","seed":7}` is equivalent through defaults. `WorldResponse` fields are `schema_version`, `id`, `backend`, `config`, `state`, `initial_state`, `action_schema`, `simulator_version`, `seed`, `revision`, `history`, `branches`, `evaluations`, `performance`. A new world starts at revision 0 with empty history/lineage/evaluations. MuJoCo state includes version/hash/config/seed/state-spec and the full integration vector; do not rebuild it from qpos in the UI.

`StateResponse` has `schema_version`, `world_id`, `revision`, `observation`. Robotics observation fields:

| Field | Meaning |
| --- | --- |
| `time` | Actual simulator seconds, absolute within the branch state |
| `qpos`, `qvel` | 7 arm joints + 2 sliding finger joints; radians/rad per second for hinges, meters/m per second for fingers |
| `ctrl` | 7 joint position controls plus the model's gripper actuator control; do not present the last control as an arm angle |
| `end_effector` | Pre-grasp site's measured world position, meters |
| `body_transforms` | Body name, world position, quaternion in **w,x,y,z** order |
| `target_pose` | Goal position and 3x3 desired rotation matrix |
| `contacts` | Current prohibited penetrating contacts; excluded mounting contact is omitted |

### Submit and inspect an experiment

```http
POST /v1/worlds/{world_id}/experiments
Content-Type: application/json
Idempotency-Key: one-unique-key-per-deliberate-click

{"candidates":3,"planner_iterations":1500,"max_simulation_seconds":25,"policy":"deterministic"}
```

`{}` uses these defaults. Bounds: candidates 2..5, iterations 100..4000, simulation seconds 0.1..40. Science runs its two defined hypotheses regardless of the robotics candidate-count setting. Robotics may perform one bounded follow-up search and produce additional branches, so render the returned list rather than assume three rows. The simulation limit bounds simulated robot time; it is not an HTTP deadline or science cancellation facility.

The 202 response contains `schema_version`, `id`, `world_id`, `revision`, `status`, `request`, `selected_branch_id`, `result`, `performance`, `error`, `stale`. Initial status is normally `queued`, but scheduling may already have advanced it. Wait for terminal status. `completed` means evaluation finished, including honest all-paths-fail outcomes. `failed` means infrastructure/provider/unrecoverable adapter failure. Selection may be null in either case.

The following is a **field projection** of a real completed robotics response, omitting its request/policy/performance/envelope fields for readability; the complete response is in the examples file:

```json
{"id":"f361cf8e-e505-47bd-a704-d347148453ca","status":"completed","selected_branch_id":"e641d8e6-22f9-4e7b-a37c-5ce0992961dd","result":{"conclusion":"Measured collision-free reach found.","milestone":"reach_only"},"error":null}
```

Its independently restored candidates produced:

| Candidate | Measured status | Goal error m | Simulated duration s |
| --- | --- | ---: | ---: |
| direct | collision_failure | 0.2544755026 | 2.608 |
| rrt_seed_8 | planning_failure | 0.4114899273 | 0 |
| rrt_seed_9 | execution_success | 0.0088268297 | 7.026 |

These are observed outcomes, not UI rules or fixture winners. Never select based on seed/name/index. Use `selected_branch_id` and measured evaluations. `BranchResponse` contains `schema_version`, `id`, `experiment_id`, `parent_state_reference`, `initial_state`, `action`, `trace`, `final_state`, `evaluation`, `performance`. Action waypoints are planned radians; the trace is actual execution. Do not animate waypoints as though they were executed physics.

Successful reach requires no prohibited failure, final position error <= 0.02 m and orientation error <= 0.08 rad. Other statuses: `planning_failure`, `collision_failure`, `joint_limit_failure`, `controller_failure`, `timeout`, `adapter_failure`. Planning feasibility and execution success are distinct. Contact records include bodies, geoms, `penetration_m`, and `environment_collision` / `self_collision`. Adapter failures may have `final_state:null`, an empty trace and null counters. Display evidence as unavailable rather than zero motion or a fabricated trajectory.

### Change geometry, commit and reset

```json
{"config":{"obstacle_position":[0.75,-0.4,0.2],"obstacle_size":[0.055,0.13,0.22],"target_position":[0.55,0.28,0.22]}}
```

PATCH is a **configuration replacement**, not a partial merge, despite its method name. Send the whole intended config; omitted fields revert to schema defaults. It rebuilds geometry, resets the robot to home and advances revision. Old experiments/replays remain inspectable with their original geometry and become `stale:true`; old commit requests return 409. Recompute with a new submission key. Changing sliders locally is a preview only: send PATCH on explicit apply/debounced completion and then show the returned authoritative state. Avoid queuing many jobs while dragging.

Obstacle center bounds: x 0.15..0.8, y -0.5..0.5, z 0.05..0.6 meters; each half-size 0.01..0.4. Pre-grasp goal bounds: x 0.15..0.8, y -0.5..0.5, z 0.1..0.7. Server validation is authoritative.

Commit sends the selected successful branch ID plus experiment ID. It advances revision and persists the branch's full final simulator state. It does not reexecute the trajectory. Reset has no body and restores the current environment's initial snapshot, advances revision and retains history. Physics experiments never implicitly commit. Re-fetch world/state and refresh stale flags after these operations; replaying an old branch must not move the current world silently.

Retry keys must match `[A-Za-z0-9._:-]{1,128}` and are per world. Generate one with `crypto.randomUUID()` on an intentional action. Reuse it after a lost response; same validated settings return the original experiment even after restart. Changed settings with the same key return 409. A new revision/new deliberate experiment needs a new key. Never create the submission inside an unguarded React effect that runs twice under StrictMode.

## WebSocket protocol

Connect to `ws://127.0.0.1:8000/v1/experiments/{experiment_id}/events?after=0`. For HTTPS derive `wss:`. The server sends JSON text messages only; the client sends no commands. Events are persisted progress records, **not video or per-step transforms**.

Envelope: `{"schema_version":"1.0","seq":154,"kind":"queued","details":{}}` is an actual captured event. Sequence IDs are global database integers, increasing but not necessarily contiguous for one experiment. Reconnect using `after=<highest successfully handled seq>` and ignore messages with seq <= the saved cursor.

| kind | details fields |
| --- | --- |
| `queued` | `{}` |
| `running` | `{}` |
| `planned` | `candidate_count`, `planning_wall_seconds`; follow-up adds `followup:true` |
| `branch_completed` | `branch_id`, full measured `evaluation` for that adapter |
| `completed` | `selected_branch_id` (nullable), `stale`, `adapter_error_count`, `error` (nullable) |
| `failed` | `error`; fields depend on restart, scheduling, job, or all-adapter-failure path; inspect `GET experiment` for the final authoritative status |

Actual robotics branch event:

```json
{"schema_version":"1.0","seq":159,"kind":"branch_completed","details":{"branch_id":"e641d8e6-22f9-4e7b-a37c-5ce0992961dd","evaluation":{"success":true,"status":"execution_success","planning_feasible":true,"goal_error_m":0.008826829741012019,"orientation_error_rad":0.015457884527439214,"contact_violations":[],"execution_duration_s":7.025999999999448,"milestone":"collision_free_reach"}}}
```

Normal terminal close code is 1000. Disallowed browser origin or unknown experiment is rejected before accept (observed HTTP 403 handshake, server policy code 1008); do not retry indefinitely. A connection after all terminal events were consumed may close without another message. Always GET the experiment on close. Retry unexpected network disconnection with bounded backoff and the cursor; use polling fallback around 250..1000 ms. Detach listeners, cancel polling and close the previous socket when switching experiments or unmounting. Handle queued/running, no result, no supported selection, stale, adapter error and network error separately.

## Replay and robot rendering

`ReplayResponse` is `{"schema_version":"1.0","experiment_id":"...","backend":"mujoco|scipy","config":{...},"stale":false,"branches":[...]}`. Each replay branch is `{"branch_id":"...","source":"...","frames":[...],"evaluation":{...}}`. Sources: `measured_mujoco_trace`, `executed_scipy_predictions_and_observations`, or `failed_adapter_execution`. Empty failed evidence is legitimate. A planning failure has its observed stationary state; show that the planner found no path.

Robot frames have the observation fields listed above. Physics integrates every 0.002 s; contact/failure checks run each step. Stored frames are sampled every 25 steps (0.05 s) plus initial/final/failure. Frames are not guaranteed equally spaced. Playback uses actual `frame.time`, subtracting the first time for display. Interpolation between recorded positions/quaternions is a frontend visualization only, never a new simulation measurement. Keep joint/site/contact readouts tied to recorded frames. Permit play/pause/scrub/speed controls and single-frame failed branches. Use the replay's original `config` when viewing a stale result.

### Static mesh assets

The backend does not serve files. Copy `docs/robot-geometry.json` and `docs/robot-meshes.bin` into `frontend/public/vivacity/`; include the model license there. Fetch them from the frontend origin. Assets are static geometry, not prerecorded motion. Their exported model hash refers to the default scene; environment edits change model hash but not the robot mesh buffers. Take obstacle dimensions and all active body transforms from the current observation or replay. Do not substitute the static manifest's default scene for an edited world.

```powershell
New-Item -ItemType Directory -Force frontend/public/vivacity | Out-Null
Copy-Item docs/robot-geometry.json,docs/robot-meshes.bin frontend/public/vivacity/
Copy-Item assets/menagerie/franka_emika_panda/LICENSE frontend/public/vivacity/PANDA_LICENSE.txt
```

The binary is little-endian. Manifest meshes provide aligned `positions.byte_offset/count` and `indices.byte_offset/count`. Counts are scalar element counts. Positions are float32 triples; indices are uint32 triangle triples, mesh-local vertex indices. Create a Three.js `BufferGeometry`, attach a `BufferAttribute(new Float32Array(buffer, offset, count),3)`, set indices from `Uint32Array`, then `computeVertexNormals()`. Normal recomputation/color-only materials may look less refined than an authored asset pipeline; no texture/UV fidelity is promised.

Manifest geoms provide `body_id`, type, group, optional `mesh_id`, local `position`, local `quaternion_wxyz`, size, RGBA and contact masks. Body ID resolves through `bodies`; ID 0 is the static world with identity transform. Body names match returned `body_transforms`. Groups 2 are Panda visual geoms, groups 3 collision geoms (including finger boxes). Render visual group 2 plus scene group 0 by default; collision group 3 is an optional debug overlay. Do not render both arm sets opaquely. No render transform hierarchy needs to be reconstructed from qpos.

Use a **flat set of body groups attached directly to one MuJoCo scene root**, because returned body poses are world transforms. Attach each geom to its body group using the compiled local geom pose. For body b and geom g: `worldPosition = p_b + R_b * p_g`, `worldRotation = R_b * R_g`. The exporter already includes MuJoCo's mesh-centering/rotation correction in vertices and geom poses; do not apply the raw XML mesh transform or `mesh_pos/mesh_quat` again. All 85 geom transforms and all 67 binary meshes were numerically checked against MuJoCo; Three.js browser rendering is still frontend work. See [MuJoCo mesh compilation](https://mujoco.readthedocs.io/en/stable/XMLreference.html#asset-mesh) for why compiled and raw mesh frames differ.

Coordinates are right-handed **Z-up** in meters. Keep the Three.js scene Z-up (`camera.up.set(0,0,1)` before configuring orbit controls) and reorder every quaternion from `[w,x,y,z]` to `.set(x,y,z,w)`. Alternatively rotate one common scene root -pi/2 around X for a Y-up camera. Pick one convention and apply it to robot, table, obstacle, trails and goal together; never convert twice. Mesh vertices are already scaled.

Scene dimensions:

| Element | Geometry / transform |
| --- | --- |
| Panda | 7 revolute arm joints, 2 finger slide joints; returned body poses drive rendering |
| table | Box center `[0.4,0,-0.04]`; half-size `[0.7,0.65,0.04]` |
| ground | Z=-0.8; finite visual plane may use 4m x 4m, physics plane is infinite |
| blue cube | Fixed center `[target_position[0],target_position[1],0.026]`; half-size `[0.025,0.025,0.025]` |
| obstacle | Center from body pose/config; box half-size `config.obstacle_size` |
| pre-grasp site | Hand-local `[0,0,0.103]`; measured `end_effector` is its world location |
| desired pose | Position `config.target_position`; rotation matrix diag(1,-1,-1) |

Three.js `BoxGeometry` accepts **full** dimensions: multiply half-size by 2. PlaneGeometry's normal is local +Z. Geom sphere/capsule/cylinder sizes follow MuJoCo conventions; the exported Panda uses meshes and finger/scene boxes, plus the ground plane. Static source XML/OBJ/STL are also vendored, but the compiled buffer route avoids another parser and transform guessing.

## Scientific Discovery Lab

Create with `{"backend":"scipy","seed":7}` or explicit settings:

```json
{"backend":"scipy","seed":7,"config":{"central_mu":1,"hidden_mass":0.12,"perturbing_position":[2.5,0.4],"initial_state":[1,0,0,1],"noise_std":0.001,"samples":70,"horizon":5,"train_fraction":0.7}}
```

`central_mu` and `hidden_mass` are **generation-only controls**. The server uses them to generate observations then discards them from state/config before the hypothesis policy sees anything. If exposing investor controls, separate generating settings from inference display and never send those values to a frontend/LLM selection policy. API predictions/metrics and fitted parameters are public; hidden ground truth is not returned. On reload its previous generating values cannot be recovered from the server. Explicitly supply generation settings for a new desired experiment.

Returned science observation/state includes backend, version, seed, public config, `times`, `observations`, `current_state`, `selected_model`. Positions/velocities/time are nondimensional. Models are central-only Newtonian gravity and central plus a **stationary mass at a known declared location**. This is not a moving hidden planet reconstruction or discovery of a novel law.

Each scientific replay frame is exactly:

```json
{"time":0.0,"observed_position":[1.0000012301533574,0.00029874553750846986],"predicted_position":[1.0,0.0],"predicted_velocity":[0.0,1.0],"split":"train"}
```

This frame is from the executed default experiment. Chart observed samples separately from each fitted predicted curve, color/label training versus held-out suffix and allow hypothesis switching. Residuals are `predicted - observed`. No smooth line should be claimed to be new observations.

Science branch `action` has `kind`, `hypothesis`, `definition`. Evaluation has `status`, `success`, `hypothesis`, `failure`, `fit_message`, fitted `parameters`, local `uncertainty`, `train_rmse`, `heldout_rmse`, `training_bic`, train/heldout counts, residual arrays, integration calls and optimizer evaluation count. Failed integration/adapter fits may lack these metrics; render missing values honestly.

Actual default fit:

| Hypothesis | Held-out per-coordinate RMSE | Fitted parameters |
| --- | ---: | --- |
| central_only | 0.30751205896843453 | central_mu 0.9959514424171484 |
| central_plus_fixed_perturber | 0.0010203880982996062 | central_mu 0.99997845, perturbing_mass 0.11987185 |

The numerical verifier reexecuted `solve_ivp` with each fitted parameter vector and obtained identical stored predictions, then recalculated training RMSE, held-out RMSE and BIC from observations. Selection requires extra-model BIC improvement >6, held-out RMSE improvement >5%, and full-rank fit Jacobian. Both fits must complete to select a supported comparison. `fit_completed` means numerical fitting succeeded, not that a hypothesis won. `selected_branch_id` is the comparison result. Uncertainty is a local linearized standard error under known measurement noise; no posterior/confidence-of-discovery percentage exists.

To regenerate observations, PATCH the entire science configuration then submit with a new key. A tested zero-mass counterexample uses `hidden_mass:0`, `noise_std:0.002`, `samples:60` and other default settings; it selects the central-only model based on actual metrics. Bounds: samples 30..200, noise 0.00001..0.05, horizon 2..8, train fraction 0.5..0.85, central generating mu 0.7..1.3, hidden mass 0..0.3. Initial radius 0.8..1.2, speed 0.85..1.15, known perturber radius 2..5; exact validation is in OpenAPI/schemas.

## Minimal React transport

Use separate transport, world state, job progress and replay playback state. A replay preview must not overwrite server world state. This small fetch pattern is illustrative integration code, not a shipped frontend:

```ts
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw { status: response.status, detail: body.detail,
    retryAfter: response.headers.get('Retry-After') ?? '5' };
  return body as T;
}
function submit(worldId: string, settings: object, key: string) {
  return api(`/v1/worlds/${encodeURIComponent(worldId)}/experiments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(settings)
  });
}
function eventURL(experimentId: string, after: number) {
  const url = new URL(`/v1/experiments/${encodeURIComponent(experimentId)}/events`, API);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('after', String(after));
  return url.toString();
}
```

Errors: 404 unknown ID; 409 stale/failed/incomplete/mismatched commit or retry conflict; 422 validation; 429 queue full; 503 worker unavailable. 429/503 have `Retry-After:5`. HTTP CORS currently does not expose that response header to cross-origin JavaScript, so use the documented 5 second fallback for 429/503; do not auto-retry other statuses. Pydantic validation detail may be an array; runtime detail may be a string. Show actionable messages. A 503 scheduling failure is persisted; retrying its same key returns that failed job, so use a new deliberate action after recovery. Don't replace an honest no-path conclusion with a transport error.

Performance response fields include initialization, job wall, process CPU, queue wait, planning, physics integration, candidate count, MuJoCo steps, SciPy calls, replay byte size, branch failure rate, job error rate, adapter error count and measurement completeness. CPU includes concurrent API activity; do not present it as a billable price or hosted token cost. Timings vary with machine load. Null branch counters mean unavailable evidence.

## Investor journey acceptance for Claude

1. Launch backend and frontend, check health, create the Panda world and render returned state.
2. Run alternatives, show real progress, inspect collision/planning failures and successful reaching, then play/scrub actual frames. Do not hardcode which branch wins.
3. Apply an obstacle edit, visibly label stale results, rerun with a new key and replay the new geometry. Commit and reset must reflect the returned state.
4. Show blocked-scene failure with no selected branch and useful recovery; retain failed branches for inspection.
5. Switch to Science, show real observations, fit both hypotheses, display train/heldout curves, residuals, comparison and uncertainty caveats. Regenerate zero-mass data and allow measured rejection of unnecessary complexity.
6. Verify page reload, disconnect/reconnect, slow jobs, validation and stale-commit errors; preserve focus, keyboard controls, accessible charts, reduced motion and narrow-screen layouts.

The frontend should supply understandable labels and states, not expose integration vectors, geom IDs or numerical implementation internals by default. Label deterministic agent activity honestly. Public service deployment, LLM provider verification, grasping and active autonomous observation acquisition are outside this verified slice.

## Reproduce verification

With the backend running, from repository root:

```powershell
.\.venv\Scripts\python -m pytest -q --junitxml=artifacts/final-pytest.xml
.\.venv\Scripts\python -m scripts.demo --output artifacts/final-demo.json
.\.venv\Scripts\python -m scripts.verify_live_events
.\.venv\Scripts\python -m scripts.verify_live_retries
.\.venv\Scripts\python -m scripts.export_openapi
.\.venv\Scripts\python -m scripts.export_robot_geometry
.\.venv\Scripts\python -m scripts.verify_handoff
```

`verify_handoff` uses the demonstration artifact and current live database IDs; run demo first if using a new database. Exports are deterministic contract/static-geometry artifacts; measurements/examples are refreshed from actual execution. Latest full suite: **57 passed, one upstream deprecation warning, 33.88 s**. See status/evidence for measured live timings and limits.

Suggested Claude Code instruction: “Read FRONTEND_HANDOFF.md, openapi.json, docs/frontend-examples.json and IMPLEMENTATION_STATUS.md. Build the investor-facing React/Three.js UI in frontend/ using the existing live backend. Preserve backend contracts and unrelated work. Use compiled geometry plus measured replay, show honest failures and deterministic policy labels, and verify the complete investor journey in the actual browser. Never substitute captured fixtures/evidence for live API computation.”
