# Executed performance

2026-10-11 fixed physical pickup benchmark: 20 executions, 20 successes, total 86.5164 s; physics per execution 3.50–5.45 s; seed planning 0.028825 s. Conditions, per-run durations and step counts are in `artifacts/pick-place-benchmark.json`. No playback is substituted for integration.

Existing backend compatibility baseline: 86 tests, 352.52 s. New pickup/search checks: 10 tests, 47.95 s. Concurrent verification workloads affected wall time; these are observations, not service-level guarantees.

Cloth's preceding public eight-rollout experiment took 460.49 s under contention (`ROBOT_CLOTH_RELEASE.md`). No new cloth reliability claim is made here. Hardware rendering performance and autonomous-session resource bounds require their own current measurements.
