# Master demo status — 2026-10-11

Working public frontend: **https://demo.tryvivacity.com/**. The investor-demo alias points to the same release. Actual backend: MuJoCo 3.15.0 / SciPy 1.18.1, persisted SQLite state, temporary HTTPS/WSS tunnel to this computer. Durable independent hosting remains blocked; no production availability guarantee is made.

## Verified outcomes

- **101 backend tests passed in 290.66 s**, zero failures/errors/skips, one upstream Starlette TestClient warning. Report: `artifacts/master-release-backend.xml`.
- **20/20 actual fixed contact pickup/placement executions**, plus exact full-state forks/re-execution, real missed-grasp/drop/collision/timeout/controller failures, independently evaluated branches and geometry invalidation. Report: `artifacts/pick-place-benchmark.json`.
- **5/5 actual fixed constrained cloth folds**, with actuated Panda, flex dynamics, release/settling and measured alignment/coverage. Report: `artifacts/cloth-reliability.json`.
- The autonomous client uses fresh worlds, conditions, seeds, real 5,000-proposal screening, a bounded physics shortlist and a separate fresh selected execution. It does not loop a prerecorded trajectory. Three physical results represent actual feasible validations; science presents its two hypotheses. One inspector, valid evidence downloads and camera controls are implemented.
- Complete local browser journey passed with **441 measured states / 70 events**, zero captured page errors and zero axe violations in checked scope.
- Complete public HTTPS/WSS journey passed in **507.741 s**, with **666 measured states / 89 events**, zero captured page errors and zero axe violations in checked scope. Seven fresh jobs covered two pickup cycles, blocked geometry, stale results/replay, clear-route recovery, two numerical science/control fits and fresh actuated cloth execution; actual visual import and three parsed downloads also passed. Body poses, all 49 cloth vertices and planar solver geometry were checked against measured outputs. Screenshots were inspected.
- A subsequent narrow Discovery check found a real 19 px horizontal overflow: the visually hidden accessible SVG inherited `width:100%`. A scoped 1 px rule fixed it without changing simulation or visible chart data. The repaired production build was deployed separately; current-alias console/reload/offline checks are recorded in `artifacts/master-public-boundaries.json`. A harness initially targeted the mobile-hidden connection badge instead of the visible offline notice; that selector was corrected and rerun.
- Both current public aliases passed real fresh fitting, 375 px layout, direct reload reusing the same persisted session, deliberate network loss retaining evidence and successful reconnection, with **zero unexpected console/page errors**. Two expected simulated offline console errors are recorded separately, never mislabeled as a clean network throughout.

Primary evidence: `artifacts/master-public-verification.json`, `master-public-measurements.json`, `master-public-pickup-1.json` through `-3.json`, screenshots, and `master-deployment.json`. Full response/WS examples: `docs/master-frontend-examples.json`. No capabilities or generating truth are exported. The first full public journey precedes the isolated accessibility layout fix; physics/runtime code is identical and the fix has its own boundary verification.

## Phase disposition

| Phase | Current disposition |
| --- | --- |
| 1: Repair physics | Fixed contact pickup/placement verified; all-5,000-rejected history diagnosed honestly |
| 2: Autonomous loop | Bounded leased fresh cycles, state streaming, cancellation, capability isolation and fresh authoritative execution verified |
| 3: Clean UI | Existing brand preserved, live scene/top results/one inspector, video controls removed, browser checks passed |
| 4: Search | Genuine distinct hierarchical proposals and actual validation/ranking/counts verified; generalized pickup detours incomplete |
| 5: Science | Blinded SciPy fits, holdout/BIC/uncertainty, fresh control rejection and actual planar display verified |
| 6: Cloth | Experimental actuated pre-attached flex fixture verified; autonomous garment grasping incomplete |
| 7: Imports | Bounded data-only previews/staging verified; isolated native execution unavailable |
| 8: Release | Vercel/custom-domain and actual HTTPS/WSS journey verified; durable backend hosting blocked |

## Explicit limitations

New pickup uses staged DLS IK and actual kinematic/contact screening. The fixed unobstructed benchmark and supported changed positions are verified; broad randomized robustness and generalized obstacle-avoidance pickup detours are incomplete. Existing reaching retains RRT. The opening pickup explicitly disables the obstacle so the object is visible; enabling it changes real collision geometry. Blocking conditions fail honestly.

Cloth is a synthetic constrained fixture with a pre-attached bar, fixed hinge and disabled bar collisions, not general clothing or friction-only cloth grasp acquisition. Science is restricted synthetic 2D fixed-perturber model comparison with known initial conditions/location, not a new physical law. Imported descriptions are never natively executed; sandbox workers are missing. The opening source animation is unavailable; the retained short original brand transition honors reduced motion.

Session capabilities are not account authentication. Legacy standalone worlds/imports remain public demo data. Disk retention/upload quotas, authenticated deletion, backups, distributed jobs, load/soak tests, full screen-reader research and real-user performance measurements remain incomplete or unverified. Active work is bounded to two sessions/one physics worker/eight job reservations/finite cycles/leases; do not claim unlimited concurrency. Optional hosted LLM calls are not configured or claimed.

Railway provisioning was refused: **"Your trial has expired. Please select a plan to continue using Railway."** No unrelated service was changed. The temporary tunnel depends on this machine/network. Docker persistent-volume/context defaults are prepared but image execution is unverified because the daemon is unavailable.

## Handoff

Read `FRONTEND_HANDOFF.md` for exact endpoints, request/response examples, capability headers, WSS formats, robot coordinates, recorded evidence formats and Claude Code commands. Validation/report files: `ARCHITECTURE.md`, `ROBOTICS_VALIDATION.md`, `SCIENTIFIC_VALIDATION.md`, `CLOTH_VALIDATION.md`, `IMPORT_VALIDATION.md`, `PERFORMANCE_REPORT.md`, `DEPLOYMENT_GUIDE.md`, `IMPLEMENTATION_STATUS.md`. `DEMO_GUIDE.md` is the current fresh-computation presentation script; old V2 playback documents are historical.

## Manual-start release

The page now waits for Start experiments. Lab switches, reloads and Apply settings do not submit experiments; explicitly staged settings survive reload. Existing active sessions are cancelled on reload and completed evidence stays inspectable. Layout/styles and physics are unchanged. Local browser checks passed (14 checks); production checks passed (15 checks), including zero automatic session submissions, real SciPy control fits, 5,000 screened pickup commands / three validations / fresh successful execution, eventual safe cancellation and mobile layout. The first production harness incorrectly expected synchronous cancellation; it was corrected to wait for the actual stopped state. Source TypeScript/production builds passed (latest local Vite 12.57 s, remote 2.56 s). Proof: artifacts/manual-start-public.json and manual-start-deployment.json. Backend tests were not rerun for this frontend-only release.
