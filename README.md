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
