# Uploaded robot placement and reach physics

The `/import` workcell compiles a **copy** of the submitted robot together with
the selected test cell. The uploaded source is retained unchanged. New task
configurations use `base_mode: "free"`; records created before this field was
introduced load as `"legacy_source"` so their previous mount semantics do not
change. A `"bolted"` configuration fixes the robot root to the world and adds
a visible support post. The post has collision disabled because the root's
fixed joint is the physical constraint; its geometry explains that constraint
in the view. If a root cannot be adapted safely, compilation fails with an
explicit reason.

## Execution boundaries

- A free root receives a MuJoCo free joint and moves under gravity. Contact
  forces and signed distances in frames come from MuJoCo's contact solver.
- Reach and pick targets inside the table, pallet, or floor are rejected before
  the reach controller runs. A short gravity-only trace may still be recorded
  for an invalid target, showing what an unsupported robot actually does.
- Reach planning uses independent MuJoCo data, damped least-squares inverse
  kinematics, collision checks with a 4 mm planning margin, and a bounded
  joint-space waypoint search. The selected joint path is commanded through
  the submitted actuators and checked for contacts at every physics step.
- `invalid_target`, `unreachable`, `no_collision_free_path`, `collision`,
  `actuator_limit`, and measured goal failure are distinct outcomes. A collision
  result includes the contacting geom and body IDs, timestamp, normal force,
  and signed contact distance. MuJoCo contacts are compliant; a negative
  distance is penetration, not proof of a broken component.
- The scene manifest declares `base_mode` and `task_target_position_m` so the
  viewer renders the support and target from the same compiled model as the
  body transforms. Amber highlights the moving geometry in a measured
  prohibited contact frame. Red still means a declared joint or actuator
  limit warning, not physical damage.

## Verified operating example

The included `fixtures/imports/vivacity_sample_arm.xml` is a three-joint
fixture, not a general-purpose arm or a claim of hardware capability. In a
tabletop cell, `base_mode="bolted"`, `task="reach"`, and target
`[0.45, -0.15, 0.45]` m is a reachable example. An unsupported free base
raised by `[0.01, 0.06, 0.11]` m with a target at Z = 0.08 m illustrates
gravity and target validation. The tabletop top surface is Z = 0.375 m.

Local reproduction:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests/test_import_physics.py tests/test_imports.py
cd frontend
npm run build
npx playwright test e2e/import-task-cell.spec.ts --config playwright.config.ts
```

The tests assert that the raised free base falls and contacts the table. The
recorded sample contact penetrates less than 10 mm during that drop; the
controlled collision fixture records less than 5 mm at detection. Those are
case-specific observed tolerances, not a universal guarantee for uploaded
models. A target outside the supported inverse-kinematics or collision-free
envelope fails honestly. Arbitrary uploads may lack valid actuators, grippers,
collision shapes, or a usable end effector; this workcell does not infer or
repair such missing mechanical definitions.
