# Varied 5,000-trial MuJoCo audit

This is a fresh local execution of the current backend, separate from the
historical fixed-scene `artifacts/physics-5000.json` report and from the public
Render host's eight-trial budget. The website and deployed physics are unchanged.

## Scope

The requested run is 50 reproducible physical configurations, each receiving
100 distinct timed commands: **5,000 full native MuJoCo trials** in total.
Each command starts from an independently restored full `mjSTATE_INTEGRATION`
snapshot and owns independent `MjData`. Results come from measured per-step
collision/contact sensors, actual dynamics, joint limits and goal evaluations.

The seeded configuration distribution varies cube pickup and placement positions,
mass (0.03–0.12 kg), and Coulomb friction (0.4–1.3). It includes clear scenes,
enabled obstacles outside the route, and intentionally blocked controls. The
blocked controls physically intersect the pickup region; their results must be
reported honestly, with no successful candidate fabricated.

Within each configuration, the existing planner uses eight lift/IK templates
and varies movement speed and grasp/release dwell. **5,000 distinct commands
does not mean 5,000 unrelated path topologies or 5,000 different environments.**
The audit checks uniqueness of actual control hashes as well as configuration
plus intervention hashes. All trials must have positive integration steps and
persisted full final simulator state. Selected candidates run again through the
existing authoritative execution path; those additional steps are counted
separately from the 5,000 validation trials.

This is bounded synthetic testing, not calibrated hardware validation or a
general reliability claim. It does not test 5,000 cloth or SciPy experiments.
No LLM calls, recorded videos or fabricated physics outputs are used.

## Evidence and progress

- `artifacts/varied-physics-5000.json`: atomic progress and final aggregate report.
  `status: running` is not completion. Only the finished audit records `passed`.
- `artifacts/varied-physics-5000-trials.jsonl`: one measured catalog entry per
  trial, with configuration/control/state fingerprints, metrics and evaluation.
- `data/run/varied-physics-5000.sqlite3`: persisted worlds, all full trial actions
  and final integration states, events and retained full replay branches.
- `artifacts/varied-physics-5000-top-{1,2,3}.json`: best measured successful
  branches, exported only after completion. They retain full replay frames.
  Every trial has a final state; full replay frames are retained for the best
  branches rather than every one of the 5,000 trials.

Exact native repetition is verified for a measured success and failure when
available. The parent initial-state fingerprint is checked for every scenario.
Failure counts are separate from whether the audit itself completed correctly.

The initial ten-trial smoke executed five scenarios covering the three layout
classes: eight successes, two collisions, with exact repeated states and
evaluations. Its first report mistakenly included `execution_success` in the
failure-status dictionary; the catalog and success/failure counts were correct.
The reporting filter was corrected before starting the full run. The original
smoke evidence is retained without rewriting its output.

## Reproduce

From `P:\VIVACITY\DEMO-` in PowerShell:

```powershell
$env:OMP_NUM_THREADS='1'
$env:OPENBLAS_NUM_THREADS='1'
$env:MKL_NUM_THREADS='1'
$env:VIVACITY_IMMUTABLE_MODEL_FORKS='1'
$env:VIVACITY_MAX_PHYSICS_TRIALS='5000'
.venv/Scripts/python.exe scripts/audit-varied-physics.py --trials 5000 --scenarios 50 --seed 20261011 --output artifacts/varied-physics-5000.json --database data/run/varied-physics-5000.sqlite3
```

For another run, provide new output and database paths. The script refuses to
overwrite previous evidence. It prints real progress while executing and saves
failure information if an invariant or simulator job fails. This audit does not
increase the resource budget of the free Render service.
