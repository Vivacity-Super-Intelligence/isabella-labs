# Vivacity execution runtime

A functioning local Python backend for measured alternative futures. MuJoCo runs the Menagerie Franka Panda workcell; SciPy runs a restricted 2D orbital inference experiment. Both implement the same observe → snapshot → fork → action → simulate → evaluate → commit → replay cycle. No frontend is included; Swagger and the live demonstration script exercise the APIs.

## Setup (Windows PowerShell)

Use Python 3.12, the tested interpreter. The code requires Python 3.11+ but other interpreter/platform combinations have not been verified.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-lock.txt
.\.venv\Scripts\python -m uvicorn vivacity.api:app --host 127.0.0.1 --port 8000
```

The Panda assets are already vendored under `assets/menagerie/franka_emika_panda`; no GitHub fetch or GPU is required at startup. Keep the XML, all mesh files, and LICENSE together. Run from the repository root. On Unix, replace the interpreter path with `.venv/bin/python`.

Open http://127.0.0.1:8000/docs for the interactive API, http://127.0.0.1:8000/openapi.json for generated OpenAPI, and `/health` for simulator versions. Use **one process**, without multiple Uvicorn workers. SQLite and a bounded one-thread experiment executor provide local persistence and resource limits. Simulation jobs survive as records; interrupted jobs are explicitly failed on restart.

In another terminal:

```powershell
.\.venv\Scripts\python -m scripts.demo
.\.venv\Scripts\python -m scripts.verify_live_retries
.\.venv\Scripts\python -m pytest -q --junitxml=artifacts/pytest.xml
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

For Claude Code / React integration, start with [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md), root [openapi.json](openapi.json), [actual API examples](docs/frontend-examples.json), and the compiled [robot geometry manifest](docs/robot-geometry.json). `python -m scripts.export_robot_geometry` regenerates the manifest and mesh buffer; `python -m scripts.verify_handoff` checks them against actual MuJoCo state and live API behavior after running the demo. The UI hook investigation is documented in [HOOK_DIAGNOSTICS.md](docs/HOOK_DIAGNOSTICS.md).

- [Frontend/API guide](docs/API.md), [scientific scope](docs/SCIENTIFIC_SPEC.md), [evaluation](docs/EVALUATION_PROTOCOL.md), [truth isolation](docs/TRUTH_LEAKAGE_POLICY.md), [architecture](docs/ARCHITECTURE.md), [implementation status](IMPLEMENTATION_STATUS.md).
- Runtime/backend operations are in `vivacity/runtime.py` and `vivacity/backends.py`; adapters retain different raw state representations.
- `VIVACITY_DATABASE` selects SQLite location; default `data/vivacity.sqlite3`. `VIVACITY_CORS_ORIGINS` is a comma-separated browser allowlist, defaulting to the two local Vite origins. WebSocket browser origins use the same list.
- This is a local trusted investor demo. Keep it bound to loopback. Multi-tenant authentication, distributed job leasing, billing, cancellation, public deployment hardening and storage-retention controls are not implemented.
- The arm demonstrates collision-free reaching, not grasping or lifting. The cube and obstacle are fixed bodies moved through configuration, not free bodies pushed by the controller.
- RRT is bounded and incomplete in finite time. It may fail to find an existing path. Dynamic collisions can invalidate geometrically feasible paths. Failure remains visible.
- Scientific parameters use nondimensional units. The fixed external mass, known initial state, known perturber location, Gaussian measurement noise and two predefined hypotheses are explicit simplifying assumptions. No novel physical law, posterior probability or real-world astronomical discovery is claimed.

## Documentation used

[MuJoCo state functions](https://mujoco.readthedocs.io/en/stable/APIreference/APIfunctions.html), [MuJoCo integration state](https://mujoco.readthedocs.io/en/stable/computation/index.html), [SciPy solve_ivp](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html), [SciPy least_squares](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html), and [Menagerie provenance](assets/PROVENANCE.md).
