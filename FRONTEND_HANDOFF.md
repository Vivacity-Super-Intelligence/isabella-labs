# Current frontend handoff — master runtime, 2026-10-11

The existing React/TypeScript/Three.js frontend now runs bounded autonomous laboratories. **Do not scaffold over it or reinstate recorded playback.** The main robot/cloth scene consumes fresh authoritative MuJoCo states after independently validating candidates. Scientific paths are executed SciPy predictions. Result selection inspects evidence; it does not replay a branch in the main scene. Historical V2 release documents describe an earlier interface and are not the current contract.

**Manual start:** loading, reloading, switching laboratories and applying settings never create experiment sessions. The existing main button, **Start experiments**, is the only session-creation path. Initial loading creates/restores a stationary world via the existing world API. Applying settings updates geometry/observations and invalidates old results without submitting experiments. Reloading cancels an existing active session instead of silently continuing it. Completed evidence remains inspectable. Layout, styles and simulation algorithms are unchanged.

## Exact files to read

| File | Purpose |
| --- | --- |
| `openapi.json`, `docs/openapi.json` | Exported current REST specification and both `x-websockets` schemas |
| `docs/master-frontend-examples.json` | Measured persisted session/experiment response examples and captured WS examples when present |
| `vivacity/schemas.py`, `api.py` | Validated versioned contracts, capability checks, CORS and errors |
| `vivacity/runtime.py`, `supervisor.py`, `pick_place.py` | Branch evaluation, fresh selected execution, bounded sessions and contact pickup |
| `frontend/src/api.ts`, `useRuntime.ts`, `domain.ts` | Existing transport, session lifecycle, cancellation, recovery and measured frame types |
| `frontend/src/App.tsx`, `ResultCard.tsx`, `TechnicalInspector.tsx` | Clean lab navigation, actual top-three exports and one inspector |
| `frontend/src/RobotView.tsx`, `ClothView.tsx`, `ScienceView.tsx`, `ScienceScene.tsx` | Actual geometry, body/vertex states and numerical paths |
| `frontend/src/Settings.tsx`, `ClothSettings.tsx`, `ImportWorld.tsx`, `ImportScene.tsx` | Bounded condition edits and data-only previews |
| `frontend/src/generated/api.d.ts` | Generated REST types; regenerate from OpenAPI |
| `frontend/public/vivacity/robot-geometry.json`, `robot-meshes.bin` | Compiled Panda visual geometry and little-endian vertex/index buffer |
| `ARCHITECTURE.md`, `DEMO_STATUS.md`, validation reports | Verified scope, limitations and actual results |

Input-only sample requests: `fixtures/pick_place.json`, `pick_place_blocked.json`, `autonomous_pick_place.json`; these contain configuration and budgets, never prescribed solver outputs or winners.

The old `usePlayback.ts` was deleted intentionally. No Play/Pause/scrub/speed UI belongs in the current product. Camera controls and backend Stop experiments are real controls, with different purposes.

## Setup and exact Claude Code commands

From `P:\VIVACITY\DEMO-`, preserve uncommitted work first. Existing `.venv` and `frontend/node_modules` are usable. For a fresh checkout:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-lock.txt
npm ci --prefix frontend
.\.venv\Scripts\python -m scripts.export_openapi
npm run generate:api --prefix frontend
npm run build --prefix frontend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-demo.ps1 -NoBrowser -Dev
```

Open `http://127.0.0.1:5173/`. If script-owned old services are already running, use `scripts/stop-demo.ps1` before restarting; its identity checks preserve unrelated processes. Stop Vite before reinstalling native npm modules on Windows. If an old `frontend/dist` font is locked, a scoped fresh output build is supported: `npm run build --prefix frontend -- --outDir ../data/master-build`. Do not recursively delete unrelated output directories.

To edit in separate terminals instead of using startup scripts:

```powershell
# Backend terminal, repository root
$env:VIVACITY_DATABASE='data/vivacity.sqlite3'
$env:VIVACITY_CORS_ORIGINS='http://127.0.0.1:5173,http://localhost:5173'
$env:OMP_NUM_THREADS='1'; $env:OPENBLAS_NUM_THREADS='1'
.\.venv\Scripts\python -m uvicorn vivacity.api:app --host 127.0.0.1 --port 8000
# Frontend terminal, repository root
$env:VITE_API_BASE_URL='http://127.0.0.1:8000'
npm run dev --prefix frontend
```

Verification with both services running:

```powershell
.\.venv\Scripts\python -m scripts.test_backend -q
.\.venv\Scripts\python -m scripts.benchmark_pick_place --runs 20
.\.venv\Scripts\python -m scripts.benchmark_cloth --runs 5
$env:UI_URL='http://127.0.0.1:5173/'
$env:API_URL='http://127.0.0.1:8000'
$env:PROOF_PREFIX='frontend-handoff'
$env:CHECK_CONDITIONS='1'
npm run test:e2e --prefix frontend
```

The current `test:e2e` runs `scripts/check-master-live.mjs`: real fresh two-cycle pickup/science jobs, one constrained cloth cycle, rendering checks, downloads, mobile layouts, camera, axe and imports. `CHECK_CONDITIONS=1` also exercises blocked-scene failure, stale results/replay and fresh clear-route execution. It can take several minutes on software graphics. `test:e2e:legacy` retains the preceding V2 harness for historical reference; its playback expectations are incompatible with the current UI. Fresh browser installation: `PLAYWRIGHT_BROWSERS_PATH=<repo>/data/playwright`, then `npx playwright install chromium` from `frontend`.

## Exact endpoints

All JSON requests reject unknown fields and non-finite numbers. IDs are always returned by the server, not hardcoded from artifacts. Standard envelopes use `schema_version:"1.0"`; session/live/import/branch exports have their explicitly named versions below.

| Method / path | Status / purpose |
| --- | --- |
| GET `/health` | 200; actual engine versions and readiness |
| POST `/v1/sessions` | 201; create leased autonomous session; required capability header |
| GET `/v1/sessions/{id}` | 200; current world/job/cycle; refreshes browser lease |
| POST `/v1/sessions/{id}/stop` | 200; request safe cancellation; poll until stopped |
| POST `/v1/worlds` | 201; explicit standalone world creation |
| GET `/v1/worlds/{id}` | 200; configuration, opaque states, versions, seed, history, evaluations |
| GET `/v1/worlds/{id}/state` | 200; measured observation wrapped in world ID/revision |
| POST `/v1/worlds/{id}/experiments` | 202; bounded asynchronous job, optional `Idempotency-Key` |
| GET `/v1/experiments/{id}` | 200; job/result/search/performance/stale/error |
| GET `/v1/experiments/{id}/branches` | 200; complete independent candidate evidence |
| GET `/v1/experiments/{id}/events?after={seq}` | 200; persisted missed messages |
| GET `/v1/experiments/{id}/live` | 200; latest live envelope or null while queued |
| POST `/v1/experiments/{id}/cancel` | 200; cancel flag; termination is asynchronous |
| GET `/v1/experiments/{id}/branches/{bid}/export` | 200; exact downloadable JSON evidence |
| GET `/v1/experiments/{id}/replay` | 200; historical measured traces, original configuration, stale flag |
| POST `/v1/worlds/{id}/commit` | 200; explicitly commit successful current-revision branch |
| POST `/v1/worlds/{id}/reset` | 200; original state under current geometry, increments revision |
| PATCH `/v1/worlds/{id}/environment` | 200; full validated backend configuration replacement, resets and invalidates |
| POST `/v1/imports?filename=scene.glb` | 201; raw bytes, not multipart |
| GET `/v1/imports/{id}` | 200; inspected metadata, always `physics_ready:false` |
| GET `/v1/imports/{id}/preview` | 200; validated static triangles |
| WS `/v1/experiments/{id}/events?after={seq}` | Sequenced persisted progress and terminal events |
| WS `/v1/experiments/{id}/live` | Latest-only measured state, up to 20 Hz |

Errors: 403 capability mismatch; 404 missing record; 409 stale/failed commit or conflicting retry settings; 422 invalid input; 429 bounded capacity exhausted; 503 shutting-down/unavailable worker. Capacity responses include `Retry-After:5`. A completed job can honestly have no successful candidate. Display measured failures, not a fabricated fallback.

## Session requests, responses and capability transport

Client generates a new random capability (32–128 ASCII alphanumeric/underscore/hyphen characters), saves it with its session ID and supplies `X-Session-Token` on every session-owned world/experiment request. Only its SHA-256 digest is persisted. Reusing the same token and same normalized create request returns the original session; changed settings with that token return 409. It is capability isolation, not account authentication. Legacy standalone worlds and imports remain explicitly public demo data.

Exact contact-pickup session request body:

```json
{"backend":"mujoco","seed":7,"config":{"task":"pick_place","obstacle_enabled":false},"max_cycles":1,"realtime_execution":true,"search_candidates":5000,"physics_budget":3}
```

For cloth use `{"backend":"cloth","seed":7,"max_cycles":1,"search_candidates":5000,"physics_budget":3}`. For science use `{"backend":"scipy","seed":7,"max_cycles":2,"search_candidates":0,"physics_budget":3}`. API robotics default without `task` remains legacy reaching; the current frontend explicitly requests pickup. Omitted config fields receive validated defaults, not frontend guesses.

Session response version is `vivacity.session/1.0`, with `id`, `backend`, `status`, `world_id`, nullable `experiment_id`, `cycle`, `max_cycles`, `experiments`, `world_ids`, `conditions`, `error`, `started_unix_s`, `last_heartbeat_unix_s`. Full real response examples are in `docs/master-frontend-examples.json` and the browser proof's `sessions` array. Each next cycle changes world ID and recorded seed/conditions; reconnect to that experiment's sockets. Sessions run at most eight cycles (cloth at most two), expire after a 180 s heartbeat lapse, and have a 30 min wall bound. GET heartbeat every second while active is the existing client behavior.

Standalone pickup: POST `/v1/worlds` with `{"backend":"mujoco","seed":7,"config":{"task":"pick_place","obstacle_enabled":false}}`. Submit `{"candidates":3,"search_candidates":5000,"physics_budget":3,"max_simulation_seconds":40,"execute_selected":true,"realtime_execution":true,"policy":"deterministic"}` to its experiments endpoint. `execute_selected:false` keeps experiments observational: independent validation without committing a fresh execution. Request keys are scoped to world ID; reuse the same key for network retry, a new key for deliberate recomputation.

Environment edits must stop the session first. PATCH body is `{"config":{...full current config...,"obstacle_enabled":true,"obstacle_position":[0.75,-0.4,0.2]}}`; construct actual full JSON from the returned configuration, not literal ellipses. A new configuration increments revision and makes older results/replays stale; create a fresh session with a fresh token for the new conditions. Never change rendering geometry without sending the physics configuration.

Explicit commit JSON is `{"experiment_id":"<returned experiment id>","branch_id":"<returned successful branch id>"}`; substitute actual IDs. It is for a completed successful current-revision validation when no fresh execution already committed it. Reset and cancel/stop use POST with no JSON body. Branch export is a GET returning the versioned evidence, not a frontend reconstruction of an action.

## WebSocket formats and reconnect

Browser capability transport:

```typescript
const socket = new WebSocket(
  `${API.replace(/^http/, 'ws')}/v1/experiments/${experimentId}/live`,
  ['vivacity.live', `vivacity.token.${capability}`]
);
socket.onmessage = event => consumeMeasuredState(JSON.parse(event.data));
```

The server accepts `vivacity.live`. Tokens never belong in URLs or exported evidence. HTTP and WebSocket browser Origin must exactly match `VIVACITY_CORS_ORIGINS`; HTTPS frontend uses HTTPS API and WSS. Terminal sockets close 1000; forbidden/missing records close 1008 before acceptance. Reconnect events with last `seq`, recover through REST on interruption, and keep a single latest live frame. Slow clients skip intermediate physics frames; never accumulate an unbounded queue.

Persisted event format: `{schema_version:"1.0",seq:number,kind,details:object}`. Kinds: queued, running, planned, progress, branch_completed, completed, failed, cancelled. `details.timestamp_unix_s` is the recorded timestamp; progress includes an actual stage/message and available generated/screened/rejected/physics counts. Sequence is database-wide, not necessarily starting at one per experiment.

Live format: `{schema_version:"vivacity.live/1.0",experiment_id,world_id,sequence:number,timestamp_unix_s:number,stage:string,frame:object}`. `sequence` increases within the experiment. Frames come from actual MuJoCo integration, not exported replay. Captured complete messages are retained in public browser proof `live_message_example` and `event_message_examples`, and in the current example export. Exact schemas are embedded in OpenAPI `x-websockets`.

During independent validation the main scene remains at its initialized physical state. Only fresh selected execution drives its motion. Physical outcome is validated again before a successful final state is committed; failure does not commit a validation prediction. Cancelled/failed partial traces remain evidence. After completion, fetching the world supplies its persisted successful state. Archived evidence does not replace that scene.

## Physical geometry and measured transforms

- MuJoCo: right-handed **Z-up**, XYZ meters, joint radians, seconds. `body_transforms` are **world poses**. Build flat groups, not nested FK transforms. Reorder WXYZ to Three.js XYZW: `new Quaternion(q[1],q[2],q[3],q[0])`.
- Panda body bindings/mesh-local poses are in the compiled geometry manifest. Its binary buffer contains compiled centered/rotated mesh vertices; applying raw XML mesh transforms again would double-transform them. Static visual bindings remain valid across supported workcell variants; the model hash describes the source export, not a new dynamic-world hash. Live snapshots carry the actual world hash.
- Pickup has 16 qpos / 15 qvel / eight controls: first seven arm joints, two fingers, then the cube's free joint. Cube free qpos holds XYZ then WXYZ. Render using measured `target` body pose; **never parent the cube to the hand**. The cube is 50 mm per side, 0.06 kg by default, friction coefficient 1.0, with actual finger/contact forces and gravity.
- Gripper actuator `ctrl[7]`: 0 closed, 255 open. Hand-local pregrasp site offset `[0,0,0.103]` m, downward orientation `diag(1,-1,-1)`. Finger-cube frictional retention is measured; there is no object weld or mocap attachment.
- Table center `[0.4,0,-0.04]`, half-size `[0.7,0.65,0.04]`; tabletop Z=0, ground Z=-0.8. Obstacle configuration uses **half-sizes**, so render dimensions are twice those values. If obstacle disabled, collision masks are also disabled and renderer hides it. The default opening pickup explicitly has it disabled; controls can enable/reposition it.
- Robot frames include `time`, `qpos`, `qvel`, `ctrl`, `body_transforms`, `end_effector`, `contacts`, `cube_position`, `cube_quaternion_wxyz`, `placement_position`, `grasp`, and physical `phase` during execution. `grasp` includes bilateral finger contacts, summed actual normal force and table support. Contacts/limits are checked every 2 ms, streamed frames approximately every 50 ms. Sampling is not a collision-proof interpolation guarantee.
- Cloth frames add 49 actual world-space `vertices`, compiled `triangles`, folding-bar pose and `grasp_active`. Robot body poses come from the same physics engine. Its pre-attached edge constraints/fixed hinge are explicit experimental limitations; disable them only through a tested backend model change.
- Science positions/predictions are nondimensional **`[x,y,0]`**, with genuine observed points, residuals, train/heldout tags and fitted paths. No frontend orbit animation substitutes for numerical integration. The extra body is a stationary known-location perturber in a simplified 2D model.
- Uploaded glTF preview is **Y-up**; preserve its documented coordinate convention. Camera/grid/light controls never mutate simulator state.

## Ranking, replay and export formats

Use `result.top_feasible_branch_ids` for the three measured feasible physical candidates. Fewer than three is valid, zero must be shown honestly. Scientific comparison has two hypotheses, not three fabricated candidates. `result.execution_branch_id` identifies the separate fresh selected execution; it is not a fourth ranked validation candidate. `execution_evaluation` records its measured outcome.

`result.search.generated/distinct_generated/screened/rejected/screening_passed` are genuine proposal counts. `fully_simulated` counts actual integrated validation episodes; `physics_attempts` includes attempts. `performance.candidate_count` and step totals also include fresh authoritative execution. Never call 5,000 screened timing variations 5,000 physics runs. Kinematic checks can be cached for identical geometry; the response labels this screening scope.

Replay response: `{schema_version:"1.0",experiment_id,backend,config,stale,branches:[{branch_id,source,frames,evaluation}]}`. Sources identify measured MuJoCo, measured robot-cloth, executed SciPy predictions or failed adapter execution. It is available for evidence inspection, not current live execution. Branches additionally retain opaque complete initial/final integration snapshots, parent reference, action, trace, evaluation and performance. Old geometry remains reproducible through its original configuration/hash; stale results cannot be committed.

Download version `vivacity.branch/1.0` includes experiment/branch IDs, world type, actual backend/version, initial configuration, parent reference, state encoding, initial/final snapshots, command, **recorded_frames**, evaluation/violations/success, seed, configuration SHA-256, model hash, timestamps and performance. `Content-Disposition` suggests a JSON filename. The existing client verifies schema and matching branch ID before downloading. Real examples: `artifacts/master-live-pickup-1.json` through `-3.json`, and equivalent public release exports. IDs in evidence belong to verification databases; always use fresh returned IDs.

## Remaining limitations

Current pickup proves a fixed unobstructed contact benchmark and supported new-condition cycles; general obstacle-detour pickup planning/randomized robustness are incomplete. Existing reaching has RRT; new staged pickup has DLS and actual kinematic screening. All-paths-fail is honest. Cloth is constrained experimental manipulation. Science is synthetic restricted model comparison. Imports are data-only; isolated native execution is unavailable. Legacy public worlds/imports have no account auth or storage-retention quota. The Vercel frontend currently relies on a temporary local API tunnel: consult `DEPLOYMENT_GUIDE.md`, not historical production claims.
