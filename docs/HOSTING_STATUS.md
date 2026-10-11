# Render hosting verification — 2026-10-12

## Current configurable pickup release

Render deployment `dep-db60ej0473hc73clmuo0` runs backend commit
`e4d6d2c4f0ad23c4d34c32bd0751a19d3af1c704`. Its Docker CI passed
**138 tests** (225.85 s) and the constrained-memory lab check **1 test**
(41.74 s). Vercel `dpl_w1tHiBqKWM4bzNmso4iWnjtVXETQ` built successfully
and aliases both `https://demo.tryvivacity.com/` and
`https://vivacity-investor-demo.vercel.app/` (same built asset, HTTP 200).
Public `/health` reports
`max_physics_trials: 8`; public OpenAPI confirms `cube_half_size` 0.02–0.03 m.

An actual public-browser run set a 60 mm cube, applied the physical scene,
submitted eight backend trials, observed **8/8 feasible**, and watched the
independent authoritative execution finish with **1.7 mm** placement error,
**zero prohibited contacts**, and a persisted result. The page showed backend
trial events and no captured console errors. The frontend requests up to 5,000
trials in its build, then limits each session to `/health` capacity. Thus the
current public host runs eight, not 5,000, per visitor. The prior hosted 5,000
audit was a separate backend Docker run with 2 GB of memory. Free hosting
remains non-durable and can sleep; no paid plan was activated.

The rest of this document records earlier deployments and historical evidence.

## Current verified native-import release

Backend source `69013a8f6b538398a042a4f862638aac50865f20`, Render deployment
`dep-db5s8hks728c738sccf0`, live 22:46 IST. Linux Docker **135 passed**, zero
failed/skipped, **351.494 s**; 512 MB smoke **one passed, 56.313 s**. Vercel
`dpl_9kYzmrxJgMi2mLFmB8fAX8a1bBEX` serves both public aliases with explicit
Render API and eight-trial build settings. No paid service or disk was activated.

Public Orbital import/probe/configure/native-three-trials/fresh-execution/export/
geometry/mobile/reload journey passed ten checks: 426 actual live frames, ten
events, no page errors or axe violations in the tested scope. Cargo delivery
error **1.717717 mm**, **30,757 steps**, wall **169.474161 s**, CPU **25.381585 s**.
Record: `artifacts/orbital-public.json`. Fixed local workcell benchmark **20/20**.
Windows bounded-thread suite: **134 passed, one Linux-only skip, 408.16 s**;
unrestricted Windows deadline failures remain recorded. Full current handoff:
`docs/FINAL_VERIFICATION.md`, `docs/ORBITAL_HANDOFF.md`.

Final camera-only frontend follow-up passed **12 public checks**, including
native blocked-reactor recomputation and invalidation without auto-start.
`artifacts/orbital-public-final.json`: 428 frames, 17 events, successful job wall
179.380164 s, CPU 26.848431 s, unchanged 1.717717 mm delivery error. The blocked
job produced **three actual collision failures, 128 steps each**, no selected
branch, 5.440279 s wall. No successful result was fabricated.

The remaining sections retain prior-release detail where their source differs.

Public UI: https://demo.tryvivacity.com/ and https://vivacity-investor-demo.vercel.app/.
Backend: https://vivacity-runtime.onrender.com/. API: https://vivacity-runtime.onrender.com/docs.

Render service `srv-db5p7pjbc2fs739lnl6g`: Oregon, Docker Free, 0.1 CPU / 512 MB.
No paid compute, disk or workspace upgrade was activated; the unrelated suspended
`vivacity-api` service was untouched. The $100 credits did not waive Render's
payment prerequisite: the normal upgrade returned `Plan requires payment information on file`.
The user reported a declined debit card; its issuer's reason is unknown. No card
information was collected and no payment gate was bypassed.

This is a limited demo deployment, **not always-on production hosting**.
[Render Free](https://render.com/docs/free) sleeps after 15 idle minutes and can
need 50 seconds or more to wake. Local SQLite data disappears on restart, redeploy
or sleep. Download experiment exports while running. No keep-alive loop is installed.
Cold-start reconnection, sustained reliability and concurrent public load are not guaranteed.

## Release

- Backend revision: `2f6138927442906e989e105b9539f00f190d8ee7` in https://github.com/Tanish-Anand1/vivacity-runtime.
- Render deployment: `dep-db5r3v0473hc73c4cen0`, verified Live.
- Frontend: `dpl_7YERMyaXLpNcZQb614HXCsUnuY8F`, https://vivacity-demo-1gy0o4jjw-tanishs-projects-66633ee2.vercel.app/.
- Both public aliases use that frontend compiled against Render. Layout/styles/scene were preserved.
- Exact CORS origins are the two public frontend origins. One Uvicorn process, one simulation worker, numerical thread pools set to one.
- `VIVACITY_IMMUTABLE_MODEL_FORKS=1`, `VIVACITY_MAX_PHYSICS_TRIALS=8`,
  `VIVACITY_MAX_PICKUP_WALL_SECONDS=300`; frontend `VITE_PHYSICS_TRIALS=8`.
  Real-time execution remains enabled. The host deadline changes wall time only,
  not simulator stepping, physical limits, contacts or the chosen command.

Each public pickup runs eight real independent physics trials and then executes the
selected successful command again in a fresh state. Oversized requests return
422 before allocating worlds/jobs; no silent replacement of a requested 5,000.
Live guard proof: `artifacts/render-host-guard.json`. Local/default paid budgets
remain 5,000; cloth screens 5,000 proposals and validates three in physics; science
fits two hypotheses. No hardcoded winners or prerecorded simulation outputs.

## Memory correction

Render confirmed the original instance exceeded 512 MB at 19:27 IST and restarted.
Repeated later jobs returned 502 and lost records. Fork compilation duplicated
large Panda meshes; repeated world compilation also accumulated allocator pages.
The opt-in constrained profile shares read-only compiled geometry while each branch
owns independent `MjData`, controls, full integration state, action and configuration.
At most two pristine compiled layouts are retained **without MjData**. Repeated world
creation restores pristine initial state instead of recompiling meshes or returning
advanced state. A new layout clears old cache entries before compilation; active
worlds retain their model references. Garbage collection and Linux allocator trimming
release unused allocations. Weak references retain no active worlds. Instrumented
native models do not replace ordinary models in the active-world registry.

Geometry changes compile new models. The default profile keeps separate model
objects; direct model mutation is unsupported under the opt-in immutable profile,
so use the environment API. MJCF, hashes, controllers, solver and state formats
were preserved. This follows MuJoCo's [read-only model / independent data pattern](https://mujoco.readthedocs.io/en/stable/programming/simulation.html#multi-threading).

## Executed tests

Latest [Linux workflow](https://github.com/Tanish-Anand1/vivacity-runtime/actions/runs/38152910776):
**125 passed**, zero failures/errors/skips, JUnit **314.099 s** in the actual Docker
image. Separate `--memory=512m --memory-swap=512m` run: **1 passed, 56.502 s**,
with two consecutive eight-trial pickups plus fresh execution, three cloth
validations plus fresh execution, and two SciPy fits with nonzero integration calls.
Reports: `artifacts/render-deadline-linux/backend-linux.xml`, `host-memory.xml`.
This proves the tested sequential memory-limited journey, not Render throughput
or unrestricted traffic. One upstream Starlette TestClient deprecation remains.

Windows pristine-cache fork regression: **3 passed, 3.233 s**, exact restore,
independent data, seed and pristine repeated creation (`render-cached-forks.xml`).
API host-limit regression: **2 passed, 0.89 s**. Strict TypeScript and Vercel build passed.

Failed checks are retained: first shared-model revision failed two existing default
model-object-isolation assertions; opt-in sharing preserves those tests. Earlier
Windows run: 114 passed / 5 failed; scoped run: 22 passed / 1 timeout. Later full
Windows run: **120 passed / 3 failed**, JUnit 1058.127 s, worker-completion deadlines
for host smoke, 16-trial paused completion and two-cycle pickup. Cause was not
isolated; latest full suite was verified on Linux, not successfully rerun on Windows.
Reports: `render-memory-backend.xml`, `render-memory-regression.xml`, `render-final-backend.xml`.

The earlier 5,000-trial audit is **local fixed-scene evidence** in
`artifacts/physics-5000.json`. A later, separate 5,000-trial varied audit
completed in the backend Docker image on a GitHub-hosted 2 GB runner, with
measured live logs and a persisted artifact; see
`docs/PHYSICS_5000_VARIED_AUDIT.md`. The 512 MB Render Free service still
supports only eight trials per public request. General cloth grasp acquisition, generalized
pickup detours, native execution of imported robots and distributed durable workers
remain incomplete. Cloth uses an actuated Panda, pre-attached bar and hinge; it is
not arbitrary garment grasping. Deterministic planning is labelled correctly.

## Public verification

Actual page: connected, initialized Panda, Ready to start, no experiment on load.
Health: MuJoCo 3.15.0, cloth MuJoCo 3.15.0, SciPy 1.18.1, maximum eight full trials.
OpenAPI snapshot: `artifacts/render-final-openapi.json`.

Older partial attempts remain failures: first reaching run measured collision
failure, planning failure and success at 0.008826829741 m (`render-free-live-api-retry.json`).
Later jobs exhausted memory. `render-bounded-public-pause.json` passed six checks,
299 measured WS frames / 10 events (real Pause/Resume/Stop, frozen state, camera),
then failed 502 during the second run. No partial run is labelled a full pass.

After geometry caching, an actual public UI run passed manual start, actual native
pause/freeze/resume/stop and all eight pickup rollouts (60,475 physics steps), but
the separate selected physical pickup hit the 120-second wall timeout while
holding the cube during transport. This is retained in
`artifacts/render-cached-public-verified.json` as a failed run. The 0.1 CPU service
was unable to finish the selected motion within its 120-second wall budget.
The deployed host setting raises that deadline to 300 seconds, while preserving
real-time execution, full integration stepping, measured contacts and UI controls.
The final live test verified the complete fresh physical result: pickup succeeded
with 0.001749392576 m placement error, grasp/lift/retention/release/table support
all measured, no prohibited contacts, eight full trials (60,475 trial steps),
67,488 total steps and 269.270334 s job wall time / 40.317765 s process CPU.
The selected export contains 61 recorded frames, 416,463 bytes. Public proof:
`artifacts/render-final-public.json`, `render-final-public-branch.json`.

The interrupted first 2f61389 browser run did not persist its final report and
is not counted as a pass. The repeated run passed nine checks including successful fresh pickup, exports
and settings remaining idle, with 851 live frames and 22 events; the composite
run then failed its 30-second click timeout during cloth world initialization.
That report remains **failed**, not a full-suite pass. The separate cloth/science
partition passed eight checks in `render-final-labs-long.json`, with 113 measured
frames, 27 events, zero page errors and zero axe violations in the checked scope.
The earlier six-minute cloth report remains failed. Its successful rerun used
a 15-minute overall client allowance and actual bounded simulator execution.

## Reproduce

```powershell
$env:API_URL='https://vivacity-runtime.onrender.com'
$env:UI_URL='https://demo.tryvivacity.com/'
$env:EXPECTED_PHYSICS_TRIALS='8'
$env:PROOF_PREFIX='render-final-public'
node scripts/check-pause-live.mjs
.venv/Scripts/python.exe -u scripts/demo.py --base-url $env:API_URL --timeout-seconds 600 --output artifacts/render-live-demo.json
$env:UI_URL=$null
$env:BOUNDARY_PROOF_PREFIX='render-final-public'
node scripts/check-public-boundaries.mjs
```

Frontend build: set `VITE_API_BASE_URL=https://vivacity-runtime.onrender.com` and
`VITE_PHYSICS_TRIALS=8` before `npm run build --prefix frontend`.
The paid 1 CPU / 2 GB plus 5 GB disk proposal remains $26.25/month before tax/overages,
in `render.yaml`. It requires a working payment method. Even paid single-instance
hosting has restart/deployment interruptions; no 100% availability guarantee.

