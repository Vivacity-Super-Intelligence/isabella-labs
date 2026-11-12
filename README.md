# Vivacity simulation backend
Private deployment snapshot of the real FastAPI, MuJoCo robotics and SciPy
scientific experiment runtime.
SOURCE_MANIFEST.json identifies the exact source content exported from the
development workspace. Credentials, frontend work and experiment databases
are excluded.

Render: import render.yaml as a Blueprint. It proposes paid 1 CPU / 2 GB compute
and a 5 GB disk at /data. Review actual account pricing before creating it.
Keep one instance and one Uvicorn process. /health is the HTTP readiness path.
Only the two deployed Vivacity frontend origins are allowed. No LLM key is
required. The main workspace contains the complete API/frontend handoff.

The GitHub Actions workflow builds this exact Dockerfile and executes the full
backend test suite inside the Linux image. A workflow/configuration is not proof
of a successful build: inspect the actual run and uploaded JUnit evidence.

## Uploaded robot qualification

`POST /v1/imports` accepts one bounded native robot description at a time:

- MJCF (`.xml` or `.mjcf`)
- URDF (`.urdf`)
- a `.zip` bundle whose `manifest.json` contains
  `{"entrypoint":"path/to/robot.xml"}` and whose referenced mesh assets stay
  inside the bundle

`POST /v1/imports/{id}/qualification` explicitly starts an isolated MuJoCo
job. Poll `GET /v1/imports/{id}` while its status is `physics_verifying`.
The resulting `vivacity.robot-qualification/1.0` report contains measured
gravity-settle and actuator frames, declared-limit checks, a terminal-body
Jacobian rank, test outcomes, and an honest failure class. GLB, GLTF, OBJ and
STL are accepted only for visual inspection because those formats do not
provide a trustworthy executable mechanism by themselves.

Qualification is deliberately bounded and is not hardware certification. It
does not infer missing actuators, controllers, fatigue properties, tolerances,
or task success. Native execution is disabled on unsupported development hosts
and runs in the Linux syscall, CPU, memory, file and model-size sandbox in
production.
