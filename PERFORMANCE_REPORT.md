# Executed performance

2026-10-11 fixed physical pickup benchmark: 20 executions, 20 successes, total 86.5164 s; physics per execution 3.50–5.45 s; seed planning 0.028825 s. Conditions, per-run durations and step counts are in `artifacts/pick-place-benchmark.json`. No playback is substituted for integration.

Existing backend compatibility baseline: 86 tests, 352.52 s. New pickup/search checks: 10 tests, 47.95 s. Concurrent verification workloads affected wall time; these are observations, not service-level guarantees.

## Actual autonomous browser jobs

Extracted persisted measurements: `artifacts/master-measurements.json`; reproducible exporter: `python -m scripts.export_master_measurements`. These executions ran concurrently with headless SwiftShader rendering on the same Windows machine; software GPU contention substantially increases physics wall time. No latency or frame-rate service-level guarantee is established.

| Lab / cycle | Job wall s | Planning s | Physics / fitting wall s | Process CPU s | Integration steps / calls | Evidence bytes |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Pickup / 1 | 110.475 | 4.635 | 102.313 | 37.906 | 24,667 steps | 3,459,595 |
| Pickup / 2 | 112.733 | 4.826 | 103.057 | 38.516 | 25,688 steps | 3,804,430 |
| Science / 1 | 1.746 | 0 | 1.067 | 0.563 | 30 solve_ivp calls | 40,519 |
| Science / 2 | 0.947 | 0 | 0.717 | 0.859 | 51 solve_ivp calls | 40,694 |
| Constrained cloth / 1 | 122.782 | 4.355 | 113.135 | 54.563 | 11,032 steps | 2,914,786 |

All five jobs had zero adapter errors and zero measured branch failure rate. These are selected supported scenes, not a general reliability estimate. World initialization timings and per-branch CPU-relevant measurements are also exported. Process CPU includes concurrent requests; selected physical execution wall time includes pacing when enabled.

## Genuine search and resource boundaries

Each pickup cycle generated **5,000 distinct timed commands**, with eight height/IK/contact templates reused where geometry is identical. Every command receives timing/horizon validation; signature uniqueness and catalog digest are measured. Three shortlisted commands were actually integrated and all three validated successfully in these cases. The chosen command then ran again as a **fourth independent authoritative execution**. `result.search.fully_simulated` counts validation branches; `performance.candidate_count` and total steps include that fresh execution. These fields must never be relabeled as 5,000 full physics episodes.

The cloth cycle generated/screened 5,000 proposals: **2,984 rejected, 2,016 screening passes, three actual validation rollouts and three verified feasible folds**, plus fresh selected execution. Proxy screening does not establish dynamic success. Top-three ordering is computed from actual branch evaluations; exports carry those exact actions, states, frames, metrics, engine/configuration hashes and seeds. An unavailable seed path in legacy reaching now terminates bulk variation honestly rather than presenting thousands of unusable paths as useful work.

One physics worker, an eight-job reservation bound, two active session slots, at most eight cycles (two for cloth), a 180 s heartbeat lease, step-boundary physical cancellation and 32 latest-frame entries limit active compute. A job still stores complete branch evidence in SQLite; lifetime database/upload quotas, retention, distributed worker scheduling and comprehensive abuse controls are **not implemented**. Multi-visitor capacity remains intentionally small.

The complete local browser journey took **392.73 s**, received **441 live states / 70 persisted progress messages**, and checked 1440/768/375 px layouts, exact measured transforms and numerical geometry, downloads, keyboard camera, zero captured page errors and zero axe violations. This is journey verification, not a complete screen-reader or real-user performance study.
