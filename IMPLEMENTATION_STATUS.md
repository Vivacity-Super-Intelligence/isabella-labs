# Robotics template release verification (2026-10-13)

This release retires Scientific Discovery from the public UI, schemas and runtime.
The implemented catalog has five arm references, five physical workcell presets
and five task choices. Panda is the actuated arm. Eight rigid handling combinations
and one fixture-assisted textile fold run through existing MuJoCo adapters.
UR5e, KUKA iiwa, SCARA, dual-arm control, machine tending and assembly are gated
reference templates, not implemented controllers. See docs/ROBOTICS_TEMPLATES.md.

Executed locally: all 11 template tests passed in 169.57 s (one dependency warning).
The migrated runtime boundary run passed 61 tests and failed three in 606.67 s;
cloth failed-adapter replay labeling, an observation-envelope assertion and a
wait deadline were corrected. All three repaired checks passed in 98.60 s.
The current full Linux image run is 38318104071 on source 2bf89e7; its final
result and deployment/public-browser evidence will be recorded below at release.

TypeScript/Vite build passed, with the existing large Three.js chunk warning.
The live local HTTP/WebSocket demo passed repeated deterministic reaching,
measured collisions, obstacle change/staleness, all-path failure and real cloth
folding. A UI warehouse run completed five real feasible trials and a fresh
pickup execution; a downloaded measured branch has 6,055 integration steps,
53 frames and 1.0705 mm placement error. Actual worker pause/resume was exercised.

Known limits: simplified workcells rather than complete facility twins; Panda
only; pre-attached cloth fixture without autonomous grasp; synthetic semantic
ray sensing rather than real camera perception; bounded host compute, ephemeral
Free-host SQLite, no hardware actuation or production account/billing system.
No ROI, traction, global optimality or universal physical feasibility is claimed.

The following records are historical releases, not the current template scope.

# Implementation status — current Render handoff, 2026-10-13

## Current clean tabletop and adaptive pickup release

**Live and verified at https://demo.tryvivacity.com/**. The robotics viewport
has no visible text, target markers, paths, grid or sensor overlays; loading
and errors also appear outside it. Object dragging covers the whole physical
table, inset by object dimensions to keep it supported. Width/depth/height,
mass/weight and friction controls rebuild the actual MuJoCo geometry and
contacts. Search varies grasp yaw, seeded DLS IK retries and joint-space RRT
routes. Physical trial count is adaptive, with measured plateau and host
compute-budget stops disclosed.

Docker CI: **155 passed, zero failures/errors/skips**, one upstream warning,
353.54 s. The separate 512 MB check: **one passed**, 53.25 s. Reports:
`artifacts/adaptive-linux-tests/backend-linux.xml`, `host-memory.xml`.
Final Vercel TypeScript/Vite build passed; the large Three.js chunk warning
remains. Backend source `0353263` is live as Render `dep-db6lh3ff3r2c73crqm4g`;
frontend `dpl_EHwp139FoB9QFLYqEi9p5J6DpaaR` is ready on the custom domain.

The public run screened 256 commands and stopped at five integrated MuJoCo
trials, retaining two feasible outcomes and genuine failed grasps/drops.
Its fastest measured feasible candidate used 180° grasp yaw, 7,398 steps,
14.796 simulation seconds and 8.5498 mm placement error. A separate live
authoritative execution succeeded at 8.5 mm error and zero prohibited
contacts; total public wall time was 4:07.21. The object measured
44 × 56 × 52 mm, 100 g and friction 0.65. Public dragging reached the far
edge (ray estimate `[1.065,0.385]` m), invalidated the result, and did not
start a new job. Desktop and mobile were checked with empty viewport text,
no captured console errors, and no mobile horizontal overflow.

Limits: placement on the table does not guarantee that a fixed Panda can
reach or grasp that point. The planner currently searches top-down yaw
grasps; no base repositioning or arbitrary shape support exists. Carried
object collisions are validated by physical trials. This is best measured
feasibility under a budget, not a global optimum. Perception uses synthetic
MuJoCo semantic depth labels. Free hosting retains its earlier uptime and
ephemeral-persistence limitations. Details: `docs/ADAPTIVE_PICKUP.md` and
`docs/HOSTING_STATUS.md`. Sections below describe earlier releases.

## Bounded 3D pickup drag and 422 repair (2026-10-12)

**Deployed and verified:** the blue cube can be dragged on the rendered table
within X 0.35–0.65 m and Y -0.30–0.30 m. Release rebuilds the MuJoCo world
through the existing environment API and invalidates earlier results. The
preview is labelled as uncommitted; keyboard users can change the same
coordinates through the existing sliders. Exact 0.10 m pickup/placement
separation is accepted by the backend, while closer points are blocked in the
editor with a short alert. A rejected server edit keeps the editor open and
shows a concise error. The drag moves the object between experiments; it is
not itself a robot manipulation simulation.

Backend commit `8cfa7fcd60e5acd01f1075d59eec5de2e2a03212`, Render deploy
`dep-db6fie2jnfac73djg6ag`: Docker CI **139 passed, one warning in 352.77 s**;
the separate 512 MB lab check **1 passed in 55.83 s**. Vercel deployment
`dpl_E7CdpcAXC29sJyiMBNAg5E5wdnzD` serves both public aliases with the same
built JavaScript asset. The production TypeScript/Vite build passed. Local
desktop and mobile browser drags, bounded clamping, invalid-drop feedback,
and stale-result indication were exercised. The public browser accepted a
drag and the screenshot's previously failing 60 mm scene; live `/health`
reported eight physics trials. The subsequent public experiment ran **8/8
actual physics trials**, then a fresh authoritative execution succeeded with
**1.7 mm** placement error and **zero prohibited contacts**. Dragging again
visibly marked those results stale. Exact run outcomes: `docs/HOSTING_STATUS.md`.
The same deployed site completed four SciPy Discovery cycles and displayed
computed model predictions, held-out errors and a complexity-aware final
central-only selection; the measured values are in the hosting report.

Remaining limitation: Render Free can sleep and uses ephemeral SQLite; the
interactive host remains capped at eight physics trials. A separate hosted
5,000-trial audit exists, but visitors cannot request 5,000 on this host.

## Configurable pickup release (2026-10-12)

**Deployed and tested:** the public robotics page lets a visitor set the cube pickup
position, placement position and side length from 40 to 60 mm. Applying conditions
rebuilds the actual MuJoCo geometry without starting an experiment; Start submits
independent physics trials. The frontend asks `/health` for the host capacity and
displays the actual completed trial count and backend event log. On the current
Render Free service, that capacity is **8**, not 5,000. The requested 5,000
visitor-configured trials remain **incomplete** on this 0.1 CPU / 512 MB host.
The separate completed cloud 5,000-trial audit is reproducible evidence of the
backend on a larger runner, not a live per-visitor feature.

- Backend source: `e4d6d2c4f0ad23c4d34c32bd0751a19d3af1c704`; Render deploy
  `dep-db60ej0473hc73clmuo0` succeeded. The public OpenAPI exposes
  `cube_half_size` bounded to 0.02–0.03 m; `/health` reports a limit of 8.
- Frontend: Vercel deployment `dpl_w1tHiBqKWM4bzNmso4iWnjtVXETQ` is ready and
  aliased to `https://demo.tryvivacity.com/` and
  `https://vivacity-investor-demo.vercel.app/`; both returned HTTP 200 with the
  same built JavaScript asset. Its requested budget is 5,000,
  clamped to the live host limit before each session. The production TypeScript
  and Vite build passed (5,125 modules, 6.21 s); the existing large Three.js
  vendor-chunk warning remains.
- Public browser verification: a visitor set the cube to **60 mm**, applied the
  new physical scene, then started explicitly. **8/8 real backend physics
  trials** completed and were feasible. A separate fresh authoritative
  execution reported **1.7 mm** goal error, **zero prohibited contacts**, and
  persisted successfully. The result appeared after about **4:03** of event
  time; reopening Change conditions still showed 60 mm. Captured browser
  console errors: **zero**. This is one measured scene, not a reliability
  guarantee across arbitrary positions or object sizes.
- Local full backend suite: **136 passed, 1 Linux-only skipped**, 439.86 s;
  the added legacy-snapshot check passed separately. The pushed Docker image
  passed **138 tests** in 225.85 s plus the 512 MB lab check (**1 passed** in
  41.74 s). The upstream Starlette deprecation warning remains.

In the earlier configurable-pickup release, repositioning used settings
sliders only. The current release adds direct pointer dragging as described
above. The arm performs physical pickup and placement after Start. Render Free
still sleeps and uses ephemeral storage.

**Current deployment truth:** the UI uses Render Free at `https://vivacity-runtime.onrender.com`
and `https://demo.tryvivacity.com`. This free service sleeps after inactivity and
loses SQLite data on restart. Its true pickup limit is eight physics trials. Latest
release and actual test results: `docs/HOSTING_STATUS.md`. The completed 5,000-trial
hosted backend-image audit is documented in `docs/PHYSICS_5000_VARIED_AUDIT.md`;
it does not measure the current free Render instance. Earlier test/browser tables
below are historical local/prior-release results. A measured slow-CPU pickup execution
timeout is addressed with a tested 300-second host wall deadline. The public
pickup journey was verified on release 2f61389; current Orbital verification
and release evidence is recorded in docs/FINAL_VERIFICATION.md.

The latest Render deployment image passed **135 tests**, plus a separate 512 MB lab test. Windows with bounded numerical threads passed **134 tests with one Linux-only skip**; unrestricted Windows deadline failures remain preserved. Fixed pickup benchmark: **20/20**. Final public adapted Orbital journey passed **12 checks**, including blocked-reactor invalidation and real failed alternatives, with **30,757 actual physics steps** and **1.717717 mm** measured successful placement error. Both public aliases passed real SciPy fits, reload, mobile layout and offline recovery. Current UI uses Start/Stop without video controls; native Pause/Resume remains a tested API capability. A separate hosted backend-image audit completed 5,000 full MuJoCo trials: 4,000 measured successes, 1,000 collision failures, 29,625,840 validation steps, with live cloud logs and persisted records. Exact current evidence, limitations and reproduce commands: `docs/FINAL_VERIFICATION.md`, `docs/HOSTING_STATUS.md`, `docs/PHYSICS_5000_VARIED_AUDIT.md`. API/frontend contracts: `FRONTEND_HANDOFF.md`, `docs/ORBITAL_HANDOFF.md`, `openapi.json` and `docs/openapi.json`.

**Render Free is provisioned:** `https://vivacity-runtime.onrender.com`, with both public frontend aliases connected. Paid activation remains blocked by the payment method requirement despite the existing credits. Free hosting sleeps after 15 idle minutes; SQLite data is ephemeral. Public pickup uses eight real physics trials and rejects oversized jobs. Always-on availability and durable persistence are **not** implemented by this free fallback. The completed 5,000-trial cloud run used the same backend Docker image on a separate hosted runner with 2 GB memory; it did not execute on Render Free. `docs/HOSTING_STATUS.md` records the deployed configuration and executed evidence.

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
- Current Render Free hosting works within a finite eight-trial budget but is neither always-on nor durable. Paid activation is blocked by the payment-method prerequisite. Linux Docker execution is verified by the 125-test workflow and 512 MB smoke. No unrelated service was changed or paid plan purchased.
- Full screen-reader/user research, every mobile/device combination, field Core Web Vitals, long-duration soak/load testing and cross-platform bitwise determinism remain unverified. Axe/layout checks cover only their executed scope.

## Hook investigation

The historical "Hook failed: hook exited with code 1" came from a Windows-incompatible POSIX/escaped-path wrapper around the Impeccable hook, registered for both PostToolUse and Stop. Available logs cannot identify which registration emitted that specific occurrence. Both wrappers were repaired and four entrypoint invocations returned exit 0; current frontend edits also receive hook feedback. The Python backend never invokes it. Exact diagnostics, backup and limits: `docs/HOOK_DIAGNOSTICS.md` and `artifacts/hook-verification.json`.

## Reproduction

Use the commands in `README.md` and `FRONTEND_HANDOFF.md`. The live browser demonstration script creates new real jobs, not expected-winner fixtures. For exact numerical extraction from its persistent DB, use `scripts.export_master_measurements` and `scripts.export_frontend_examples` with their `--database`/`--proof`/`--output` arguments. Exported capabilities and generating truth are forbidden by the example exporter.

## Manual-start release

The page now waits for Start experiments. Lab switches, reloads and Apply settings do not submit experiments; explicitly staged settings survive reload. Existing active sessions are cancelled on reload and completed evidence stays inspectable. Layout/styles and physics are unchanged. Local browser checks passed (14 checks); production checks passed (15 checks), including zero automatic session submissions, real SciPy control fits, 5,000 screened pickup commands / three validations / fresh successful execution, eventual safe cancellation and mobile layout. The first production harness incorrectly expected synchronous cancellation; it was corrected to wait for the actual stopped state. Source TypeScript/production builds passed (latest local Vite 12.57 s, remote 2.56 s). Proof: artifacts/manual-start-public.json and manual-start-deployment.json. Backend tests were not rerun for this frontend-only release.

## Earlier pause, local 5,000-trial audit and paid Render preparation — 2026-10-11 (historical)

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
**At this earlier checkpoint, Render was not deployed:** dashboard and GitHub are connected; $100 credits are
verified. Render requires card registration before paid activation. Render TLS/WSS, restart/disk persistence and remote
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
