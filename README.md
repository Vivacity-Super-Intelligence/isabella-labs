# Vivacity execution runtime

## Current V2 release

The V2 workspace adds genuine 5,000-candidate screening, separately counted physics shortlists, three measured result cards with automatic recorded replay and JSON exports, solver-derived discovery in a 3D viewer, a constrained MuJoCo flex fold, and bounded static GLB/glTF import previews. Panda Object Pickup remains **reach-only**; imported MJCF/URDF is inspected and staged, never executed.

Start with [DEMO_V2_STATUS.md](DEMO_V2_STATUS.md), [DEMO_V2_TEST_RESULTS.md](DEMO_V2_TEST_RESULTS.md), [DEMO_V2_LIMITATIONS.md](DEMO_V2_LIMITATIONS.md), and [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md). These supersede older feature descriptions and measurements below. The current suite contains 84 backend tests and eight browser journeys. The Vercel frontend uses a temporary API tunnel dependent on this computer; it is not independent production hosting.

A local investor application for measured alternative futures. The React/TypeScript workspace renders the real Franka Panda geometry and measured MuJoCo replay, and charts executed SciPy orbital model comparisons. Both labs use the same observe → snapshot → fork → action → simulate → evaluate → commit → replay cycle. The existing Python physics infrastructure is preserved.

## Investor workspace

After installing the Python environment below, install/build the frontend with Node.js (25.9.0 verified):

```powershell
Set-Location frontend
npm ci
npm run build
Set-Location ..
.\scripts\start-demo.ps1
```

Open **http://127.0.0.1:5173**. The start script checks both services and opens the workspace. Use `-NoBrowser` to start/check without opening a tab; `-Dev` selects the editable Vite frontend. `scripts/stop-demo.ps1` stops only recorded, matching processes launched by the script. Alternatively run the Uvicorn command below and `npm run preview` from `frontend` in separate terminals. `npm run dev` supports editing.

The UI includes independent computed branches, measured failures, playback/scrubbing/speed controls, camera orbit/zoom/reset (also keyboard), obstacle apply/replan, commit/reset, history, scientific controls/uncertainty/residuals, reconnect/poll fallback and retry keys. No static trajectory or fabricated-data fallback is used.

Follow [DEMO_GUIDE.md](DEMO_GUIDE.md) for the three-minute presentation, [DEMO_LIMITATIONS.md](DEMO_LIMITATIONS.md) for explicit scope, [frontend/README.md](frontend/README.md) for client/assets/testing, and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for executed checks and measurements. This remains a trusted loopback demo, not a public multi-tenant service.

## Current live demo

The current Vercel deployment is [demo.tryvivacity.com](https://demo.tryvivacity.com/). Cloth Folding now uses a real actuated Panda and recorded robot/cloth motion; see [ROBOT_CLOTH_RELEASE.md](ROBOT_CLOTH_RELEASE.md) for current verification and deployment commands. Its API is currently reached through a temporary Cloudflare quick tunnel from the local MuJoCo/SciPy process, so the URL is live only while that tunnel and backend process remain running. A durable public release requires a paid/ provisioned Python host with authentication, persistent storage and explicit CORS. The existing `vivacity-demo` project was updated at the user's request; unrelated projects were preserved.

## Setup (Windows PowerShell)

Use Python 3.12, the tested interpreter. The code requires Python 3.11+ but other interpreter/platform combinations have not been verified.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --cache-dir data/pip-cache -r requirements-lock.txt
.\.venv\Scripts\python -m uvicorn vivacity.api:app --host 127.0.0.1 --port 8000
```

The Panda assets are already vendored under `assets/menagerie/franka_emika_panda`; no GitHub fetch or GPU is required at startup. Keep the XML, all mesh files, and LICENSE together. Run from the repository root. On Unix, replace the interpreter path with `.venv/bin/python`.

Open http://127.0.0.1:8000/docs for the interactive API, http://127.0.0.1:8000/openapi.json for generated OpenAPI, and `/health` for simulator versions. Use **one process**, without multiple Uvicorn workers. SQLite and a bounded one-thread experiment executor provide local persistence and resource limits. Simulation jobs survive as records; interrupted jobs are explicitly failed on restart.

In another terminal:

```powershell
.\.venv\Scripts\python -m scripts.demo
.\.venv\Scripts\python -m scripts.verify_live_retries
.\.venv\Scripts\python -m scripts.test_backend -q --junitxml=artifacts/fullstack-backend-tests.xml
.\.venv\Scripts\python -m scripts.export_openapi
```

The demonstration performs real HTTP and WebSocket calls, repeated MuJoCo execution, failed/successful branch inspection, obstacle editing, stale commit rejection, replanning, commit/reset, a blocked scene, SciPy model comparison and a zero-mass counterexample. Results are saved to `artifacts/live-demo.json`; failure raises an error and preserves collected evidence. Fixtures set inputs only; neither fixtures nor policy specify which candidate succeeds.

## API journey

1. `POST /v1/worlds` with `{"backend":"mujoco","seed":7}` or `{"backend":"scipy","seed":7}`. Copy an input from `fixtures/` for explicit settings.
2. `GET /v1/worlds/{id}/state` reads actual joint state/body transforms or numerical observations. `GET /v1/worlds/{id}` includes full persistent simulator state and history.
3. `POST /v1/worlds/{id}/experiments` with `{}` returns **202** and an experiment ID. This schedules bounded background work; physics does not block the request.
4. Subscribe to `WS /v1/experiments/{id}/events`, or poll `GET /v1/experiments/{id}` until `completed` or `failed`.
5. `GET /v1/experiments/{id}/branches` returns all candidates, including planning and execution failures. `selected_branch_id: null` is a genuine unsupported/failed result. `completed` means evaluation finished, not that a candidate succeeded.
6. `GET /v1/experiments/{id}/replay` returns actual sampled physics frames or executed numerical predictions. It does not alter the world.
7. `POST /v1/worlds/{id}/commit` with `{"experiment_id":"...","branch_id":"..."}` explicitly continues from a successful final state. Simulation alone never commits.
8. `PATCH /v1/worlds/{id}/environment` with `{"config":{"obstacle_position":[0.75,-0.4,0.2]}}` rebuilds the workcell at home, advances its revision, and invalidates previous commits. Configuration objects are complete replacements with documented defaults; this example also uses the default target and obstacle size.
9. `POST /v1/worlds/{id}/reset` restores the current environment's initial state, retaining history and invalidating prior branch commits.

For science, environment replacement accepts observation settings and generation-only `central_mu` / `hidden_mass`. Those two values are used to create observations and are then discarded. Science reset preserves the exact seeded observations; environment replacement regenerates them. The selection policy sees public observations and declared assumptions, not the hidden truth.

For safe experiment submission retries, send one `Idempotency-Key` header per deliberate action. Repeat the same key/settings to retrieve the original job, including after restart; changed settings return 409. Use a new key for a new experiment or revision. Unhandled adapter errors are recorded as failed branches, with unavailable evidence marked explicitly, and remaining candidates still execute. See the API guide for null snapshot/counter handling.

## Optional hosted proposal adapter

Default policy is explicitly `deterministic_planning_policy`. No key or hosted model is needed. To opt in, set server-side `OPENAI_API_KEY` and an exact `OPENAI_MODEL`, then submit `{"policy":"llm"}`. This adapter sends public observations to the configured OpenAI model and accepts only bounded candidate-count/planning-budget proposals. It cannot supply simulation results. Missing configuration or provider failure fails the job honestly; it is never relabeled as a successful LLM run. It is contract-tested with a mock transport; live provider access is **unverified**.

The request format follows [official OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Use a model supporting strict structured outputs. API keys remain in environment variables; never put them in fixtures or source.

## Contracts and operating limits

The implemented client uses generated types from root [openapi.json](openapi.json). [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) remains the detailed REST/WS contract, with [actual API examples](docs/frontend-examples.json) and the compiled [robot geometry manifest](docs/robot-geometry.json). `python -m scripts.sync_frontend_assets` regenerates and copies the actual compiled geometry to the frontend. `python -m scripts.verify_handoff` checks exported arrays/transforms against MuJoCo and live API behavior after running the CLI demo. The external UI hook investigation is documented in [HOOK_DIAGNOSTICS.md](docs/HOOK_DIAGNOSTICS.md).

- [Frontend/API guide](docs/API.md), [scientific scope](docs/SCIENTIFIC_SPEC.md), [evaluation](docs/EVALUATION_PROTOCOL.md), [truth isolation](docs/TRUTH_LEAKAGE_POLICY.md), [architecture](docs/ARCHITECTURE.md), [implementation status](IMPLEMENTATION_STATUS.md).
- Runtime/backend operations are in `vivacity/runtime.py` and `vivacity/backends.py`; adapters retain different raw state representations.
- `VIVACITY_DATABASE` selects SQLite location; default `data/vivacity.sqlite3`. `VIVACITY_CORS_ORIGINS` is a comma-separated browser allowlist, defaulting to the two local Vite origins. WebSocket browser origins use the same list.
- This is a local trusted investor demo. Keep it bound to loopback. Multi-tenant authentication, distributed job leasing, billing, cancellation, public deployment hardening and storage-retention controls are not implemented.
- The arm demonstrates collision-free reaching, not grasping or lifting. The cube and obstacle are fixed bodies moved through configuration, not free bodies pushed by the controller.
- RRT is bounded and incomplete in finite time. It may fail to find an existing path. Dynamic collisions can invalidate geometrically feasible paths. Failure remains visible.
- Scientific parameters use nondimensional units. The fixed external mass, known initial state, known perturber location, Gaussian measurement noise and two predefined hypotheses are explicit simplifying assumptions. No novel physical law, posterior probability or real-world astronomical discovery is claimed.

## Documentation used

[MuJoCo state functions](https://mujoco.readthedocs.io/en/stable/APIreference/APIfunctions.html), [MuJoCo integration state](https://mujoco.readthedocs.io/en/stable/computation/index.html), [SciPy solve_ivp](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html), [SciPy least_squares](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html), and [Menagerie provenance](assets/PROVENANCE.md).
