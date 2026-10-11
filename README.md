# Vivacity — Viva Physics

Latest verified release: [docs/FINAL_VERIFICATION.md](docs/FINAL_VERIFICATION.md).
Linux deployment-image suite: **135 passed**; Windows with numerical thread
limits: **134 passed, one Linux-only skip**. Orbital import workflow and precise
geometry/API contract: [docs/ORBITAL_HANDOFF.md](docs/ORBITAL_HANDOFF.md).

The investor workspace executes real MuJoCo robot/cloth dynamics and SciPy orbital model comparisons through one persisted simulation runtime. The React frontend runs bounded autonomous sessions, validates independent alternatives, and streams a **fresh selected physical execution**. It does not substitute prerecorded playback, scripted mesh attachment or canned numerical results.

Current public frontend: [demo.tryvivacity.com](https://demo.tryvivacity.com/). [vivacity-investor-demo.vercel.app](https://vivacity-investor-demo.vercel.app/) aliases the same release. Backend: [vivacity-runtime.onrender.com](https://vivacity-runtime.onrender.com/docs). Render Free is the fallback after the required card was declined; it sleeps after 15 idle minutes and its SQLite storage is ephemeral. The public pickup budget is eight real physics trials; local/default paid configuration retains 5,000. Current release, executed verification and hosting limits: [docs/HOSTING_STATUS.md](docs/HOSTING_STATUS.md).

## Verified scope

- Contact-driven Panda cube grasp, lift, retention, transport, release and table placement; a fixed benchmark completed **20/20 real executions**. Full integration-state branching, measured failures and deterministic re-execution are tested.
- Local Object Pickup can request 5,000 independent real MuJoCo trials; the free public host supports eight. Measured ranking retains the best full traces and fresh authoritative execution. Screening and physics counts are separate. UI uses explicit Start/Stop, without video controls. Tested native Pause/Resume remains an API capability; its earlier UI proof is historical.
- Leased autonomous sessions with fresh worlds/seeds/conditions, independent validation and fresh authoritative execution, REST/WSS state streaming, capability isolation, cancellation and bounded workers.
- Restricted 2D invisible-planet inference: `solve_ivp`, training `least_squares`, chronological holdout, complexity penalty, local uncertainty and hidden truth isolation. Perturbed and no-influence control cases select different models from actual fits.
- Experimental actuated Panda/flex folding fixture, pre-attached bar and fixed hinge; separate fixed benchmark **5/5**, with actual release and settling. No general cloth grasp acquisition is claimed.
- Bounded visual GLB/glTF imports, explicitly requested isolated native MJCF/URDF capability probes, and executable adapted Orbital Salvage task. Generic imported manipulation is not automatic. Orbital replaces the original inadequate robot and preserves source/adaptation provenance.

Earlier full regression: **119 passed**, **410.15 s** on Windows. Latest deployment-image results and failed Windows deadline checks are recorded in [docs/HOSTING_STATUS.md](docs/HOSTING_STATUS.md). Historical feature verification: [DEMO_STATUS.md](DEMO_STATUS.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [ROBOTICS_VALIDATION.md](ROBOTICS_VALIDATION.md), [SCIENTIFIC_VALIDATION.md](SCIENTIFIC_VALIDATION.md), [CLOTH_VALIDATION.md](CLOTH_VALIDATION.md), [IMPORT_VALIDATION.md](IMPORT_VALIDATION.md), [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).

## Setup — Windows PowerShell

Python 3.12 and Node 25.9 were verified. Python 3.11+ is declared; other platform combinations are not established by this Windows run. Dependencies are pinned in Python requirements and the frontend lockfile.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-lock.txt
npm ci --prefix frontend
.\.venv\Scripts\python -m scripts.export_openapi
npm run generate:api --prefix frontend
npm run build --prefix frontend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-demo.ps1 -NoBrowser -Dev
```

Open **http://127.0.0.1:5173/**. First visit stays idle until you press Start experiments. Choose Robotics → Object Pickup / Cloth Folding, Discovery, or Import World. Start/Stop controls real computation; camera controls only change the view. Apply conditions stops work safely and stages changed physical geometry; press Start experiments to compute new alternatives. Result-card selection only inspects evidence. Downloads contain real measured traces/states/evaluations. One Technical Inspector retains useful actual messages. Native Pause/Resume is available through the API, without player controls in the UI.

`scripts/stop-demo.ps1` stops only identity-matching owned local processes. Stop an old owned server before starting a changed backend; readiness alone does not reload Python. If Windows holds an old output font open, use a fresh directory: `npm run build --prefix frontend -- --outDir ../data/master-build`.

Separate terminals are supported: `.\.venv\Scripts\python -m uvicorn vivacity.api:app --host 127.0.0.1 --port 8000` at the root and `npm run dev --prefix frontend`. Frontend `VITE_API_BASE_URL` defaults to `http://127.0.0.1:8000`; backend `VIVACITY_CORS_ORIGINS` must allow the exact frontend origin. Keep one Uvicorn worker. Set `VIVACITY_DATABASE` to an isolated path when needed; default is `data/vivacity.sqlite3`. Never place API keys in `VITE_` variables.

## Reproduce checks and real experiments

```powershell
.\.venv\Scripts\python -m scripts.test_backend -q --junitxml=artifacts/verification.xml
.\.venv\Scripts\python -m scripts.benchmark_pick_place --runs 20
.\.venv\Scripts\python -m scripts.benchmark_cloth --runs 5
# With the current local backend and UI running:
$env:UI_URL='http://127.0.0.1:5173/'
$env:API_URL='http://127.0.0.1:8000'
$env:CHECK_CONDITIONS='1'
$env:PROOF_PREFIX='verification-live'
npm run test:e2e --prefix frontend
```

Browser verification creates real jobs and may take several minutes with software graphics. It tests fresh physical executions, numerical predictions, exact displayed body/vertex states, actual downloads, obstacle failure/recovery when requested, layouts, camera, axe and imports. It requires installed Chromium under `data/playwright`; see [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md). Old V2 playback tests and old release documents are historical, not current acceptance checks.

## APIs and architecture

OpenAPI: [openapi.json](openapi.json), Swagger `/docs`, health `/health`. [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) contains exact endpoints, headers, requests, response/message examples, geometry conventions, replay/export formats and Claude Code commands. [ARCHITECTURE.md](ARCHITECTURE.md) describes adapters and state ownership.

Shared operations are `create_world`, `observe`, `snapshot`, `fork`, `apply_action`, `simulate`, `evaluate`, `commit`, `replay`. Each backend owns its state representation. MuJoCo stores full `mjSTATE_INTEGRATION` plus scene/version/asset metadata; each branch owns independent model/data. SQLite WAL retains lineage, events, measured outcomes and idempotent submissions. SciPy fits see sanitized noisy observations, not hidden generating parameters. Deterministic planning is explicitly labeled; no hosted LLM call is required or claimed.

## Boundaries

Fixed reproducibility does not establish general robot robustness. New pickup uses staged DLS IK and actual kinematic/contact screening; generalized obstacle-detour pickup remains incomplete. Legacy reaching retains RRT. Cloth is a constrained experimental single fold. Science uses simplified synthetic 2D physics, not new-law discovery. Imports are data-only because isolated native workers are unavailable.

Two active session slots, one physics worker, bounded job reservations/cycles/leases and latest-only streaming constrain active compute. Legacy standalone worlds/imports remain public demo data; there is no full account authentication, comprehensive rate limiting, database/upload retention quota or distributed scheduler. Durable cloud provision and Docker image execution are not verified in this environment. Consult the status and deployment reports before presenting production availability.

Model attribution/licenses: `assets/PROVENANCE.md`, vendored Menagerie Panda Apache 2.0 license, and frontend asset provenance. The repaired external design-hook wrapper is documented in `docs/HOOK_DIAGNOSTICS.md`; it is not part of backend execution.
