# Implementation status

## Current V2 evidence

The current implementation and verification records are [DEMO_V2_STATUS.md](DEMO_V2_STATUS.md), [DEMO_V2_TEST_RESULTS.md](DEMO_V2_TEST_RESULTS.md), [DEMO_V2_TECHNICAL_ARCHITECTURE.md](DEMO_V2_TECHNICAL_ARCHITECTURE.md), and [DEMO_V2_LIMITATIONS.md](DEMO_V2_LIMITATIONS.md). The refined backend passed **84 tests**, zero failures/errors/skips, in **302.63 seconds**. These records supersede the earlier 57-test/six-browser baseline below; that earlier evidence remains historical.

V2 integrates real candidate screening, measured top-three exports and looping replay, 3D visualization of computed 2D scientific predictions, constrained deformable-cloth folding, and bounded static import previews. It does not implement Panda grasp/lift/place or imported robot execution. Public API hosting remains a temporary tunnel to this machine. Final browser and public-release evidence is recorded in the V2 test report.

Verified 2026-10-10 in `P:\VIVACITY\DEMO-`, Windows, Python 3.12. The complete React/TypeScript investor workspace is now integrated with the preserved FastAPI/MuJoCo/SciPy backend. This remains a trusted loopback demonstration, not a public multi-tenant production service.

## Latest complete-application verification

- **57 backend tests passed**, zero failed/errors/skipped, **52.33 s**, using `.venv\Scripts\python -m scripts.test_backend -q --junitxml=artifacts/fullstack-backend-tests.xml`. One upstream Starlette httpx TestClient deprecation warning remains.
- **6 Playwright tests passed**, zero failed/skipped/flaky, **166.58 s**, against the production build and a fresh backend automatically launched by the harness. Report: `artifacts/frontend-tests.json`.
- Browser coverage: genuine MuJoCo branches and failed/successful selection; rendered final end-effector and every body position/quaternion against recorded physics frames at 1e-9 tolerance; replay/pause/speed/scrub; commit/reset; obstacle replacement and stale invalidation; new clear/blocked computations; SciPy numerical curves/metrics/uncertainty; unnecessary-mass rejection; archived observation correctness; same-key recovery after a lost actual HTTP response with one history record; duplicate-click guard; WS sequence reconnect; refresh/history/repeated runs; sustained replay timing; responsive/keyboard/offline/reduced-motion checks.
- **0 axe violations** at 1440/768/375 widths for the tested WCAG tags; no horizontal overflow. Keyboard camera orbit/zoom/reset and form/timeline controls passed. Desktop robotics/science and mobile screenshots were actually inspected. This does not establish complete accessibility or a screen-reader usability audit.
- `npm ci` succeeded from the lock after stopping services: **137 packages**, audit **0 vulnerabilities**. Generated OpenAPI types, strict TypeScript and production Vite build passed. The lazy Three/R3F vendor chunk exceeds the 500 kB warning threshold (approximately 933 kB / 249 kB gzip).
- The six real CLI HTTP/WS experiments passed again in `artifacts/fullstack-live-demo.json`; fresh live-event verification passed. Geometry synchronization produced 67 meshes, 85 geom bindings, 14 body records and a 6,400,572-byte buffer. OpenAPI re-export, pip dependency check and Python compilation passed.
- Hidden local startup/readiness and owned-process shutdown were exercised. Windows venv redirector/child ownership is recorded; stop checks PID, normalized creation time, executable and command before stopping a process. Existing-service reuse was also tested.

The new frontend uses the actual Vivacity logo, Geist/Geist Mono and inspected brand colors; actual compiled Panda geometry and measured MuJoCo body poses; recorded trajectory/contact evidence; structured job status; obstacle controls; branch history/commit/reset; actual observed/predicted orbital curves and residuals; parameter/uncertainty inspection; scientific controls/refinement; and a shared technical/architecture inspector. No fixture trajectory, prerecorded animation, fabricated metric or fake LLM reasoning is substituted for API results. Scientific history plots that experiment's recorded observations, not the current regenerated dataset.

### Live Vercel smoke verification

`https://vivacity-investor-demo.vercel.app/` is deployed as a new Vercel project and was verified in Chrome against a real API tunnel: runtime connected, three MuJoCo branches completed with replay and a selected collision-free reach, immediate robotics → science switching remained mounted, and SciPy produced two fitted hypotheses with held-out RMSE/BIC and selected the additional-influence model. The API reference link resolves to the live tunnel. The backend is a temporary Cloudflare quick tunnel to the local process because the authenticated Railway account has no active plan; this is a working investor URL for the current session, not durable hosting.

### Current performance and limits

`artifacts/frontend/performance.json` is a local Chromium **software rendering** measurement: navigation load **75.7 ms** (excludes asynchronous world/meshes), first contentful paint **248 ms**, world ready **771.9 ms**, canvas ready **944.4 ms**, mesh fetch/decode/normals **304.3 ms**. Panda job **4.797 s**, planning **3.236 s**, physics **0.600 s**, process CPU **4.359 s**, three candidates, **4,817** steps, replay **559,262 bytes**, zero adapter errors. Expected physical/planning branch failure rate: **66.7%**; hosted calls: **0**.

Sustained software playback measured **209.51 ms mean / 1,037.7 ms p95** across **37** intervals. This host did **not** achieve smooth high-frame-rate software rendering. Idle rendering is on demand; replay follows elapsed time and permits exact endpoint scrubbing. Raw measurements and their scope are retained in artifacts/API responses.

A separate native Chrome 154 check on the same Windows machine (Intel UHD / ANGLE Direct3D11) executed a fresh real three-candidate MuJoCo job and replayed its selected result: **16.66 ms mean / 18.10 ms p95** across the final **180** playback intervals (approximately **60 fps** in this sample). Navigation load **233.8 ms**, first contentful paint **732 ms**, world ready **4,194.3 ms**, scene ready **4,633.2 ms**, mesh load **205.7 ms**; job **7.348 s**, planning **5.240 s**, physics **0.937 s**, **4,817** steps and zero adapter errors. This is a local measurement, not a frame-rate guarantee; performance on the presentation machine remains unverified. Evidence: `artifacts/frontend/native-browser-performance.json`.

The latest six-experiment CLI wall times were **7.079 / 6.402 / 2.419 / 1.193 / 0.993 / 0.898 s** (original Panda / exact repeat / clear obstacle / blocked scene / perturbed science / no-influence control). Original planning **5.396 s**, physics **0.760 s**. These vary with shared machine load; they are not capacity guarantees.

### Problems found and fixed in this build

- Pytest initially collected an archived checkout inside ignored data and raised five duplicate-module collection errors. `pytest.ini` scopes discovery to the real tests. An initial repaired run passed 57 tests in 39.60 s.
- A full C: drive caused npm/browser installation failures and, later, temporary SQLite failures in a direct Pytest rerun (**4 failed / 25 passed / 28 errors**). Project-local cache/temp paths and the unique, workspace-checked backend test runner repaired this without deleting unrelated files. Failed report: `artifacts/backend-temp-space-failure.xml`; the final 57-test report passes.
- Initial TS6/openapi-typescript peer incompatibility was corrected with locked TS5.9.3. Vite 8 chunk configuration and WS extension typing were checked against the actual tools. Clean npm reinstall hit EPERM while Vite held a native module; stopping the owned preview released it and clean installation passed.
- Browser checks exposed continuous idle render cost, a mismatched success-status label, final-timestamp range rounding, stale asynchronous job replies, archived science/current-observation mixing, and time clipping on slow renderers. Corrected and retested. A history assertion now waits for the actual response. PowerShell ISO dates are normalized to UTC ticks for process ownership checks.
- The external hook repair remains verified. Both registrations used the same faulty POSIX/escaped-path wrapper; available logs cannot identify which emitted the original message. Both entrypoints returned exit 0 after repair. Backend execution never invokes the hook; see `docs/HOOK_DIAGNOSTICS.md` for exact diagnostics/backup. Passing entrypoints are not a full design audit.

Run and investor presentation: `README.md`, `DEMO_GUIDE.md`, `frontend/README.md`. Complete implemented/incomplete scope: `DEMO_LIMITATIONS.md`. Grasp/lift/place, hardware control, new-law discovery, cancellation, live hosted-provider verification, public auth/isolation, distributed workers, billing, retention and automatic interrupted-job resume remain absent. Cross-browser/touch/screen-reader usability and cross-platform bitwise equivalence remain unverified. Collision markers are involved body origins, not exact contact points. Rendering interpolation is not another physics solution.

The backend verification record below is retained from the earlier backend handoff; its timings are historical, distinct from the latest measurements above.

## Working capabilities

- Menagerie Franka Panda loads with original collision meshes, inertial properties, joint limits and position actuators; scene contains table, ground, blue fixed cube, movable-by-configuration rectangular obstacle and a downward pre-grasp pose.
- Actual MuJoCo joint positions, velocities, controls, body transforms, contacts and simulation time are inspectable.
- Full `mjSTATE_INTEGRATION` snapshots, version/scene/mesh hash, configuration and seed; independent models and `MjData` for forks; exact continuation verified after nonzero controls and applied forces.
- Damped least-squares position/orientation IK; direct diagnostic trajectory and independently seeded joint-space RRT alternatives; collision-aware geometric checks and dynamic execution checks at every 2 ms step.
- Distinct planning, collision, limit, controller and timeout outcomes. No branch is forced to succeed. Direct collision and RRT success both occurred in the default executed fixture.
- Deterministic policy inspects structured state, lists valid actions through adapter schemas, invokes real tools, ranks measured outcomes, and performs one bounded additional RRT round when initial outcomes justify more search. Original failures remain inspectable.
- Explicit commit, reset, environment revisions, stale result invalidation, lineage, action history, evaluation records and measured replay.
- SciPy solve_ivp orbital generation and least_squares fits for central-only and central-plus-fixed-perturber models. Seeded measurement noise, training-only fitting, held-out temporal predictions, complexity penalty, parameter recovery and local uncertainty estimates.
- Generation-only mass and central parameter values are discarded before persistence/policy inspection. Policy-input and public-state leakage tests pass.
- All requested REST endpoints and WebSocket events, versioned Pydantic schemas, OpenAPI plus WebSocket schema extension, background jobs, bounded queue, SQLite persistence and explicit restart failure handling.
- Optional per-world `Idempotency-Key` experiment submissions are persisted transactionally. Concurrent requests/restarts reuse the original job; conflicting settings return 409; original results remain stale after a world revision changes.
- Unexpected adapter exceptions become persisted failed branches with phase/type diagnostics, unavailable trace/counters and nullable final snapshots. Other candidates continue. Completed evidence and lineage survive later job failures. All terminal events commit with job status, and WebSockets drain them before closing.
- Optional OpenAI Responses proposal adapter is isolated and rejects unapproved output fields. Missing-key behavior and request/response contracts are tested. Default operation needs no key.
- Setup documentation, scientific/evaluation/truth contracts, source provenance/license, input fixtures, executable demonstration, live evidence and JUnit test artifact are included.

## Actual verification results

Final command: `.\.venv\Scripts\python -m pytest -q --junitxml=artifacts/final-pytest.xml`

**57 passed, 0 failed, 0 errors, 0 skipped**, 33.88 seconds reported by Pytest. One upstream Starlette warning: its httpx TestClient transport is deprecated in favor of httpx2; tests currently execute successfully. The test suite includes MuJoCo loading, control, stepping, pose IK, environment/self contacts, fork isolation, full state restore, identical reexecution traces, stale geometry, all-paths-fail, limits, controller failure, timeouts, API validation, REST/WS journeys, parameter recovery, held-out leakage, unnecessary hypothesis rejection across three seeds, truth isolation, persistence/restart, concurrent edit safety, bounded queue, policy follow-up and hosted transport contracts. Twelve added reliability cases cover concurrent/restarted retries, queue-full retries, partial adapter failure, non-finite outputs, unavailable final snapshots, surviving lineage, the terminal-event race, header/CORS validation, worker-submission failure/503 behavior and releasing queue capacity before a future completes. Injected failure tests are labeled boundary tests; they are not demonstration simulation outcomes.

An earlier API run exposed response validation failures from a missing public branch `experiment_id` field. The schema was corrected; the repaired API suite and final full suite pass. No failed checks are being treated as success.

Additional executed checks:

- `python -m compileall -q vivacity scripts`: passed.
- `python -m pip check`: no broken requirements.
- `python -m scripts.export_openapi`: exported root `openapi.json` and an identical `docs/openapi.json`.
- `python -m scripts.demo --output artifacts/final-demo.json`: **passed** against actual Uvicorn at `http://127.0.0.1:8000`, including all six HTTP/WS experiments, exact MuJoCo repeatability, failed/successful reaching, obstacle change/replan, stale commit rejection, commit/reset, complete reach failure, real SciPy comparison and zero-mass rejection.
- `python -m scripts.verify_live_events`: **passed** for progress delivery during work, disconnect/reconnect by sequence without duplication and concurrent health responses.
- `python -m scripts.verify_live_retries`: **passed** through real HTTP: initial/retry both 202 with one experiment ID, conflicting settings 409, one history entry, unchanged original ID after reset with `stale: true`, and real SciPy fitting completed.
- Live `/docs`: 200; live OpenAPI matches both exported copies including the optional retry header and nullable branch snapshot.
- `python -m scripts.export_robot_geometry`: exported actual compiled vertices/indices for 67 meshes (6,400,572 bytes), body/geometry bindings and poses. No additional rendering dependency was installed.
- `python -m scripts.verify_handoff`: **passed** for all 85 compiled geom transforms (maximum positional difference 1.93e-16 m), all binary mesh arrays, exact replay/trace equality, four independently reintegrated SciPy prediction arrays, recalculated training/held-out RMSE/BIC, live CORS preflight, allowed-origin WebSocket and rejected-origin 403, stale commit rejection, and live scientific commit. Captured 15 complete HTTP examples plus WebSocket events.
- Packaging check: exported all staged files to an isolated directory/database and ran the complete six-experiment HTTP/WS journey on port 8001. **Passed**; vendored asset bytes, model hash, candidate actions, final snapshots and evaluations matched the original execution. The first request preceded server readiness and returned connection refused; waiting for startup resolved that probe without a backend change. Evidence: `artifacts/package-verification.json` (full local trace at ignored `artifacts/package-demo.json`).
- Impeccable UI hooks: original Windows command failures reproduced; both PostToolUse and Stop registrations repaired. Four post-repair executions (two event types x two Windows shells) returned exit 0. Historical event identity is not retained; the two registrations shared the faulty command. See `docs/HOOK_DIAGNOSTICS.md`.

Evidence: `artifacts/final-pytest.xml`, `artifacts/final-demo.json`, `artifacts/live-events.json`, `artifacts/live-retries.json`, `artifacts/handoff-verification.json`, `artifacts/hook-verification.json`. The live-demo artifact contains actual input/final states, actions, predictions, contacts, evaluation metrics and replay frames; it is approximately 14.3 MB of pretty-printed evidence. Fixtures contain inputs only.

## Measured outcomes

Default Panda fixture, seed 7: direct candidate collided with the obstacle after 2.608 simulation seconds; first RRT search returned no feasible path; second RRT candidate completed collision-free. Final goal error **0.00882683 m**, orientation error **0.0154579 rad**, simulated execution duration **7.026 s**. Repeating the uncommitted parent produced identical actions, final integration vectors and measured frames. Repositioning the obstacle allowed successful reexecution. A deliberately blocked scene returned `selected_branch_id: null`, retaining the collision/planning failures.

Science fixture with hidden generating mass 0.12: the executed fit estimated central mu **0.99997845** and perturbing mass **0.11987185**. Central-only held-out RMSE **0.30751206**; additional-mass held-out RMSE **0.00102039**. Training BIC and held-out criteria supported the extra mass. A new zero-mass experiment retained the baseline; its held-out RMSE was **0.00176509**. These values are nondimensional coordinates under the declared simplified model.

## Performance measurements

From the final `artifacts/final-demo.json` run; machine-local measurements, not capacity guarantees. Initialization: Panda **0.1207 s**, SciPy **0.0090 s**. These initializations used an already running process with warmed asset caches. The first Panda experiment overlapped verification/tooling activity and took 19.139 s; its repeat took 5.618 s. CPU figures include concurrent API activity; no isolated throughput benchmark is claimed.

| Experiment | Job wall s | Planning s | Physics/integration s | CPU s | Candidates | MuJoCo steps | SciPy integration calls | Replay bytes | Branch failure rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Default Panda | 19.139 | 17.101 | 0.702 | 9.672 | 3 | 4817 | 0 | 559262 | 66.7% |
| Identical Panda repeat | 5.618 | 3.712 | 0.616 | 5.219 | 3 | 4817 | 0 | 559262 | 66.7% |
| Repositioned obstacle | 5.420 | 0.071 | 1.876 | 2.625 | 3 | 10452 | 0 | 1188814 | 0.0% |
| Blocked scene | 0.686 | 0.019 | 0.010 | 0.422 | 3 | 0 | 0 | 63873 | 100.0% |
| Perturbed orbital model | 0.519 | 0.000 | 0.208 | 0.281 | 2 | 0 | 30 | 40519 | 0.0% |
| Zero-mass comparison | 0.622 | 0.000 | 0.334 | 0.391 | 2 | 0 | 53 | 35120 | 0.0% |

The blocked scene has zero integration steps because actual initial contacts already prohibit execution. All six jobs completed evaluation with **0 infrastructure errors**; unsuccessful candidates are expected physical/planning outcomes. Hosted model usage in these runs: **0 calls**. API/job metrics expose initialization, queue wait, planning, physics, CPU, candidate count, integration steps/calls, replay size and failure rates.

Latest live progress test: experiment POST returned in **0.4822 s** while the job continued in the worker. **66** concurrent health requests succeeded; maximum measured latency **0.0556 s**. Local latency varies with shared-process and machine load. One CPU worker and at most eight active/queued jobs limit local compute pressure; no strict latency guarantee exists. Adapter-error metrics expose missing measurement coverage; failed branches use null counts rather than pretending to have executed zero steps. Queue capacity is released before a worker future completes, allowing immediate reuse after waiting for completion.

## Known limitations and incomplete functionality

| Area | Status / limitation |
| --- | --- |
| Grasp, lift, place | Not implemented. End-effector reach is never labeled grasp success. Cube/obstacle are fixed bodies, repositioned by configuration. |
| Frontend and rendering | React/Three.js client and static compiled geometry serving implemented and browser-tested. Measured body pose playback/branches/interventions/science charts are functional; software-rendering speed and untested browser/hardware coverage remain risks. |
| Motion planning | Finite-budget RRT can miss valid paths. Geometric checking samples edges; dynamic checks can reject them. Planning begins from persisted state, assumes a position-controlled arm and is not an industrial hardware controller. |
| Science physics | Restricted 2D test particle; fixed central body and stationary external mass; known initial state and perturber location. No recoil, moving planet inference, 3D astronomy or newly discovered law. |
| Science inference | Two predefined hypotheses, bounded nonlinear least squares and local covariance. Single optimization initialization; active bounds/misspecification weaken uncertainty interpretation. No Bayesian posterior or calibrated discovery probability. |
| Active science acquisition | New settings are investor-controlled. Agent does not autonomously acquire new hidden-world observations or invent new physical hypotheses. |
| Hosted LLM | Contract-tested only, no configured exact-model live request executed. Real provider availability, latency and billing/token telemetry unverified. |
| Operations | One trusted local process. No distributed worker leases, multi-tenant auth, experiment cancellation, automatic interrupted-job resume or storage-retention/key-expiry policy. Safe experiment retries require `Idempotency-Key`; requests without a key intentionally create a new job. |
| Reproduction scope | Exact restore/reexecution verified on the pinned Windows/Python 3.12 environment. Cross-platform/engine-version bitwise equivalence unverified; snapshots reject version/model mismatches. |
| UI accessibility | Keyboard controls, responsive layouts, reduced motion, offline recovery and automated axe scans passed. Real screen-reader/touch-device usability and complete conformance remain unverified. |

## Hook and frontend handoff

`FRONTEND_HANDOFF.md` documents exact REST/WS operations, captured response examples, rendering/replay formats and retry/stale semantics. Root `openapi.json` is exported and now drives the implemented client types. The backend implementation was preserved; frontend files were created in the previously absent `frontend` directory. No unrelated frontend work was overwritten. The earlier backend pass initialized Git and preserved sparse source metadata in ignored `data/menagerie-source.git`, allowing Panda assets to be regular vendored files.

The external Codex hook configuration was backed up and repaired, with no backend execution impact. The desktop session may cache that configuration; a new session can reload it. Hook configuration itself is outside this repository and is not committed.

## Remaining risks

Keep the service on loopback until authentication and deployment isolation exist. Treat the vendored model assets as immutable; version/hash checks protect snapshots but hot-editing cached assets is unsupported. Worlds/events/evaluations grow over time; reset retains history. RRT budgets and position-control tolerances need broader scenario coverage before a public demo allows unrestricted configurations. Do not reinterpret simulation success as physical robot safety, or local numerical model support as proof of unseen real-world mass.

Start with the documented guide, fixtures and scripts. The next useful validation is GPU playback and assistive-technology testing on presentation hardware, followed by authentication/deployment isolation before any public release.
