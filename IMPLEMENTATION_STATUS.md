# Implementation status — 2026-10-11 master runtime

Current code includes real Pause/Resume and a completed 5,000-trial MuJoCo audit. **119 tests passed on Windows and in the Linux deployment container.** Exact current evidence and limitations appear in the current release section below. Earlier release artifacts remain evidence of those revisions. Architecture/API handoff: `ARCHITECTURE.md`, `FRONTEND_HANDOFF.md`, `openapi.json` and `docs/openapi.json`.

**Render hosting is not provisioned:** account sign-in and paid activation are pending. The public tunnel is currently unavailable; local API is healthy. `docs/RENDER_DEPLOYMENT.md` records the prepared configuration and remaining live verification gates.

## Working and actually tested

- Shared create/observe/snapshot/fork/apply/simulate/evaluate/commit/replay operations with backend-owned state, unique worlds, reproducibility metadata, independent branches, revision invalidation, persistent lineage/evaluations/history and exports.
- Vendored Menagerie Panda under MuJoCo 3.15.0. Legacy collision-free reaching retains DLS IK and joint-space RRT. New pickup is a free dynamic 50 mm cube grasped by real bilateral finger forces; lift/retention/transport/release/table support/placement are measured. There is no object weld, mocap attachment, kinematic teleport or frontend hand parenting.
- Fixed pickup benchmark: **20 successes / 0 failures**, total **86.5164 s**, physics **3.50–5.45 s/run**; measured final position error **0.0016989113 m**. Actual full-state identical re-execution and independent fork tests pass. Grasp miss/drop/timeout/collision/controller/limit/planning failures remain honest.
- Actual 5,000 distinct timing proposals with cached identical kinematic templates, explicit rejection counts, real shortlisted MuJoCo validation, measured ranking/top-three exports. A chosen successful command executes again in independent authoritative state; only a freshly verified physical final state is committed.
- Bounded leased autonomous sessions create fresh world IDs, seeds and conditions. One physics worker, eight reserved jobs, two active supervision slots, finite cycles, 180 s lease, 30 min session bound and step-boundary cancellation. Expired sessions are stopped, not falsely completed. Restart marks interrupted work failed.
- Session capabilities cover their REST records and both WebSockets; only token hashes are stored. Latest-only measured state is retained for at most 32 experiments; persistent progress supports sequence recovery. No prerecorded main-scene loop/video controls remain.
- SciPy 1.18.1 `solve_ivp`/`least_squares`, blinded synthetic observations, competing fits, chronological holdout, BIC complexity penalty, local Jacobian uncertainty, parameter recovery/control rejection and real displayed `[x,y,0]` predictions. Fresh perturbed/control cycles select different models from executed metrics.
- Actuated Panda carrying a pre-attached bar through a real 7×7 MuJoCo flex fixture, constrained fold, release/settling and measured quality. Separate fixed benchmark **5 successes / 0 failures**, **26.6677 s**, alignment **0.0003588456 m** and coverage **1.0**. Disabled actuators cannot pass.
- Bounded GLB/glTF/ZIP static preview and MJCF/URDF description staging; actual uploads, decoded triangles, transform/persistence/error/unsafe-input checks. Every import reports `physics_ready:false`.
- Real FastAPI requests, sequenced WS progress, live physics WS, bounded queue errors, retries/idempotency, cancellation, persistence/restart, hidden-truth isolation and stale replay/commit behavior.
- Existing React/Three.js brand/workspace preserved: dominant live scene, actual result cards/downloads, one inspector, camera keyboard path, tested 1440/768/375 layouts, measured geometry and numerical paths. Capability-owned sessions replace public frontend jobs.

## Tests executed and actual results

| Check | Actual outcome | Evidence |
| --- | --- | --- |
| Original-code full baseline | 86 passed, 352.52 s | `artifacts/master-baseline.xml` |
| Focused pickup/search | 10 passed, 47.95 s | `artifacts/master-pick-place-tests.xml` |
| API/runtime/supervisor regression | 41 passed, 70.12 s | `artifacts/master-supervisor-tests.xml` |
| Fresh-cycle supervisor checks | 5 passed, 92.93 s | `artifacts/master-autonomy-tests.xml` |
| Full new implementation before final boundary fixes | 98 passed, 256.84 s | `artifacts/master-final-backend.xml` |
| Cube-only collision and expired-session boundaries | 3 passed, 1.96 s | `artifacts/master-boundary-tests.xml` |
| Final full backend suite | **101 passed, 290.66 s; zero failed/errors/skips** | `artifacts/master-release-backend.xml` |
| Fixed real pickup / cloth repetitions | **20/20 / 5/5** | `artifacts/pick-place-benchmark.json`, `artifacts/cloth-reliability.json` |
| Complete local browser journey | Passed; 441 actual state messages, 70 progress messages, zero page errors and zero axe violations in checked scope | `artifacts/master-live-verification.json` |
| Complete public HTTPS/WSS journey | Passed; seven fresh jobs, 666 states / 89 events, zero captured page errors / axe violations | `artifacts/master-public-verification.json` |
| Current aliases after mobile fix | Passed; real fresh fits, no narrow overflow, direct reload, preserved evidence on network loss and recovery, zero unexpected console/page errors | `artifacts/master-public-boundaries.json` |
| Owned local services refreshed | Passed; current runtime on 8000/UI on 5173, real fits/reload/mobile/offline recovery | `artifacts/master-local-boundaries.json` |
| Strict TypeScript / Vite build | Passed; scoped Windows output build 26.98 s, remote Vercel build 3.19 s | CLI execution, deployment record |
| OpenAPI/type generation, Python compilation, pip check | Passed; no broken Python requirements | Root/docs specs and generated TS types |

The backend suite retains one upstream Starlette/httpx TestClient deprecation warning. Failed intermediate checks were repaired and rerun: initial pickup test requested 60 s beyond the API's 40 s bound; a request-only global dependency broke WS injection, fixed with HTTPConnection; the initial axe harness required a proper browser context. A subsequent mobile Discovery check measured 19 px overflow because an accessible hidden SVG inherited full width; a scoped 1 px rule fixed it and both current public aliases passed. The offline harness initially selected a mobile-hidden badge, corrected to the visible notice. These failed attempts are not included as passing verification. Scoped local output avoids a locked historical Windows dist font. Current public-browser results and the isolated post-journey layout correction are recorded in `DEMO_STATUS.md` and `DEPLOYMENT_GUIDE.md`.

## Performance measurements

`PERFORMANCE_REPORT.md` and `artifacts/master-measurements.json` expose actual initialization, planning, physics/fitting, total wall, process CPU, queue wait, steps/integrations, candidate counts, replay bytes and error rates. Under concurrent headless software rendering, two local pickup jobs took **110.475 / 112.733 s**, and the cloth job took **122.782 s**; both include three validations plus fresh execution. Scientific jobs took **1.746 / 0.947 s**, performing **30 / 51** integrations. Recorded payloads were roughly **3.46 / 3.80 / 2.91 MB** for physical jobs and **40.5 / 40.7 kB** for science. No universal latency/frame-rate SLA or randomized success guarantee is asserted.

## Known limitations and remaining risks

- New staged pickup does not yet implement generalized obstacle-detour planning. Enabling blocking geometry may make every candidate fail honestly. Generalized grasp strategy, perception, arbitrary payloads and broad randomized robustness are not established by identical fixed repetitions and two supported condition cycles.
- Cloth is an experimental pre-attached folding-bar/fixed-hinge fixture, not autonomous frictional garment grasping, dual-arm or arbitrary clothing folding. Material parameters are synthetic and uncalibrated.
- Science is restricted synthetic 2D fixed-perturber model comparison with known initial state/location and local Gaussian uncertainty, not interacting moving planets, posterior inference or discovery of a new physical law.
- Imports cannot execute native uploaded robots/worlds; isolated untrusted worker execution is missing. Static mesh previews do not promise every glTF feature. Never treat them as physics-ready.
- Session capabilities are not full account authentication. Legacy public worlds/imports remain public. Per-account/IP quotas, retention/deletion/backups, global disk bounds, deployment tenancy controls and distributed scheduling are incomplete.
- Deterministic policy requires no LLM key. Optional hosted proposal adapter is separated; no configured real hosted call or model-cost telemetry is claimed for this release.
- Independent durable cloud backend hosting is **blocked**: Railway refused provisioning because the trial expired. The public API is a temporary local tunnel. Docker persistent-volume defaults and context exclusions are prepared, but Docker image execution is **unverified** because the daemon is unavailable. No unrelated Railway service was changed or paid plan purchased.
- Full screen-reader/user research, every mobile/device combination, field Core Web Vitals, long-duration soak/load testing and cross-platform bitwise determinism remain unverified. Axe/layout checks cover only their executed scope.

## Hook investigation

The historical "Hook failed: hook exited with code 1" came from a Windows-incompatible POSIX/escaped-path wrapper around the Impeccable hook, registered for both PostToolUse and Stop. Available logs cannot identify which registration emitted that specific occurrence. Both wrappers were repaired and four entrypoint invocations returned exit 0; current frontend edits also receive hook feedback. The Python backend never invokes it. Exact diagnostics, backup and limits: `docs/HOOK_DIAGNOSTICS.md` and `artifacts/hook-verification.json`.

## Reproduction

Use the commands in `README.md` and `FRONTEND_HANDOFF.md`. The live browser demonstration script creates new real jobs, not expected-winner fixtures. For exact numerical extraction from its persistent DB, use `scripts.export_master_measurements` and `scripts.export_frontend_examples` with their `--database`/`--proof`/`--output` arguments. Exported capabilities and generating truth are forbidden by the example exporter.

## Manual-start release

The page now waits for Start experiments. Lab switches, reloads and Apply settings do not submit experiments; explicitly staged settings survive reload. Existing active sessions are cancelled on reload and completed evidence stays inspectable. Layout/styles and physics are unchanged. Local browser checks passed (14 checks); production checks passed (15 checks), including zero automatic session submissions, real SciPy control fits, 5,000 screened pickup commands / three validations / fresh successful execution, eventual safe cancellation and mobile layout. The first production harness incorrectly expected synchronous cancellation; it was corrected to wait for the actual stopped state. Source TypeScript/production builds passed (latest local Vite 12.57 s, remote 2.56 s). Proof: artifacts/manual-start-public.json and manual-start-deployment.json. Backend tests were not rerun for this frontend-only release.

## Current pause, real 5,000-trial audit and Render preparation — 2026-10-11

The page waits for Start experiments; settings, lab switches and reload do not
start new work. Pause/Resume controls the actual worker and retains the same
world/experiment and simulator state; Stop cancels running or paused work.
Original layout/styles and measured Three.js geometry remain unchanged.

Full stable-source Windows regression: **119 passed, 410.15 s**, zero failed,
errors or skips. Linux Docker build and the same full suite: **119 passed,
148.34 s**, zero failures, one upstream Starlette warning. Evidence:
`artifacts/pause-final-backend.xml`, `artifacts/render-linux/backend-linux.xml`.
Linux verification used the dedicated private backend repository; no unrelated
frontend code or data was uploaded.

The exhaustive audit actually completed **5,000 independent distinct MuJoCo
pickup trials**, **36,520,171 trial physics steps**, and a fresh selected physical
execution. All 5,000 succeeded in this fixed clear scene; selected placement
error was 0.00165828179949 m. Exact same-engine repeat and immutable parent
checks passed. This is not evidence of arbitrary-scene or cloth robustness.
Proof and performance: `artifacts/physics-5000.json`, `PAUSE_TRIALS_VALIDATION.md`.

Local live UI passed 17 checks, 610 measured frames / 57 progress messages,
zero page errors and zero axe violations in checked scope. First public pause
journey passed pickup/cloth controls and measured exports, then timed out waiting
for an already-completed SciPy fit to pause; it is recorded as failed, not called
complete. The harness now pauses fast science directly after real REST creation
before delivering its creation response to the browser. Public verification
must be rerun after the hosting endpoint is available.

`render.yaml` proposes one paid 1 CPU / 2 GB instance, a persistent 5 GB `/data`
disk, Singapore, exact CORS/WS origins, health checks and manual deployments.
**Render is not deployed:** dashboard is signed out and no Render credential is
configured. Paid activation, Render TLS/WSS, restart/disk persistence and remote
performance remain unverified. No paid service has been purchased. The current
temporary tunnel stopped resolving and its renewal failed once; this illustrates
why it cannot provide independently durable availability. Instructions and exact
remaining gates: `docs/RENDER_DEPLOYMENT.md`.

Full traces are kept for the best candidates and fresh execution; other trials
keep actions, complete final integration states, metrics and evaluations in a
paged catalog. Cloth remains three real validations plus fresh constrained fold;
science remains two numerical hypotheses. Sessions have one worker/two slots,
a 180 s heartbeat lease, finite cycles and a two-hour bound for exhaustive pickup.
Active jobs do not resume after a server restart. Account auth, lifetime disk
quotas, automated retention/backup restore, load/soak tests and a zero-downtime
architecture remain incomplete. A paid always-running instance is not a 100%
uptime guarantee.
