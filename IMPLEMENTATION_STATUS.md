# Implementation status

Verified 2026-10-10 in `P:\VIVACITY\DEMO-`, Windows, Python 3.12. The backend investor journey is functional and tested. React/Three.js is separate work as requested. This is a local demo implementation, not a publicly hardened multi-tenant service.

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
| Frontend and rendering | React/Three.js and backend mesh serving not implemented. Headless physics, body transforms, a compiled geometry manifest/binary mesh buffer, scene dimensions and real replay payloads are available for separate frontend development. Geometry arrays/transforms are numerically verified; browser rendering is unverified. |
| Motion planning | Finite-budget RRT can miss valid paths. Geometric checking samples edges; dynamic checks can reject them. Planning begins from persisted state, assumes a position-controlled arm and is not an industrial hardware controller. |
| Science physics | Restricted 2D test particle; fixed central body and stationary external mass; known initial state and perturber location. No recoil, moving planet inference, 3D astronomy or newly discovered law. |
| Science inference | Two predefined hypotheses, bounded nonlinear least squares and local covariance. Single optimization initialization; active bounds/misspecification weaken uncertainty interpretation. No Bayesian posterior or calibrated discovery probability. |
| Active science acquisition | New settings are investor-controlled. Agent does not autonomously acquire new hidden-world observations or invent new physical hypotheses. |
| Hosted LLM | Contract-tested only, no configured exact-model live request executed. Real provider availability, latency and billing/token telemetry unverified. |
| Operations | One trusted local process. No distributed worker leases, multi-tenant auth, experiment cancellation, automatic interrupted-job resume or storage-retention/key-expiry policy. Safe experiment retries require `Idempotency-Key`; requests without a key intentionally create a new job. |
| Reproduction scope | Exact restore/reexecution verified on the pinned Windows/Python 3.12 environment. Cross-platform/engine-version bitwise equivalence unverified; snapshots reject version/model mismatches. |
| UI accessibility | No product UI built in this backend task; frontend keyboard, screen-reader, responsive and visual acceptance remains separate. |

## Hook and frontend handoff

`FRONTEND_HANDOFF.md` documents exact REST/WS operations, complete captured response examples, rendering/replay formats, bounds, retry/stale semantics and React connection instructions. Root `openapi.json` is exported. The backend implementation was preserved; changes in this verification pass are exports, verification scripts and documentation. No frontend files were created or overwritten. The project root initially had no Git repository; a repository was initialized to satisfy the requested commit. The sparse source clone Git metadata was preserved in ignored `data/menagerie-source.git` so Panda files can be committed as regular vendored assets rather than an unusable nested repository.

The external Codex hook configuration was backed up and repaired, with no backend execution impact. The desktop session may cache that configuration; a new session can reload it. Hook configuration itself is outside this repository and is not committed.

## Remaining risks

Keep the service on loopback until authentication and deployment isolation exist. Treat the vendored model assets as immutable; version/hash checks protect snapshots but hot-editing cached assets is unsupported. Worlds/events/evaluations grow over time; reset retains history. RRT budgets and position-control tolerances need broader scenario coverage before a public demo allows unrestricted configurations. Do not reinterpret simulation success as physical robot safety, or local numerical model support as proof of unseen real-world mass.

Start with the exact documented fixtures and demonstration script. The smallest useful follow-up is to connect the separate React/Three.js frontend to these measured state/replay APIs and verify its complete investor journey.
