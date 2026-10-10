# Vivacity master implementation

Existing FastAPI/SQLite adapters and React/Three.js client are retained. MuJoCo 3.15.0 supplies dynamics; SciPy 1.18.1 supplies numerical integration/fitting. Pinned dependencies remain in `requirements.txt` and frontend lockfile.

Runtime operations remain create/observe/snapshot/fork/apply/simulate/evaluate/commit/replay. `RobotAdapter` dispatches persisted robotics configurations between legacy reaching and new contact-driven pickup. Both use full `mjSTATE_INTEGRATION`, independent `MjData` and reconstructed scene/version/mesh hashes. SQLite preserves branch lineage, actions, measured traces, evaluations and idempotent jobs. A bounded one-worker executor runs simulations outside HTTP handlers.

Source audit: `vivacity/{runtime,robotics,pick_place,cloth,science,search,storage,schemas,api,agent,imports}.py`; frontend runtime, scenes, playback and result/inspector/import components; existing API/physics/science/search/reliability tests; architecture/API/handoff/status/release documentation. Git checkpoint: `codex/master-build-checkpoint` at `4a1d405`. Unrelated untracked partial verification artifacts were preserved.

New phase-1 code is isolated in `vivacity/pick_place.py`; old scene reconstruction is preserved. See `ROBOTICS_VALIDATION.md` for executed evidence. Autonomous supervisor, live streaming and playback removal are the next phase, not current verified capabilities.
