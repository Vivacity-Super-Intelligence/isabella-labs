# Vivacity experiment workspace

React 19 + TypeScript + Vite 8, Tailwind 4, React Three Fiber 9 and Three.js. This is a client of the existing versioned FastAPI runtime, with no simulated-results fallback.

From this directory:

```powershell
npm ci
npm run generate:api
npm run build
npm run preview
```

Open http://127.0.0.1:5173. Run the backend from the repository root on port 8000. `npm run dev` runs the editable client. Node 25.9.0 is verified; Vite requires a compatible modern Node runtime (22.12+ recommended). This project's `.npmrc` keeps npm's cache on the project drive. It does not alter global npm configuration.

On Windows, stop the running Vite service before `npm ci`: its native modules can hold installation files open. For services launched by the root startup script, use `..\scripts\stop-demo.ps1`, reinstall/build, then `..\scripts\start-demo.ps1`.

Optional `.env.local`: `VITE_API_BASE_URL=http://127.0.0.1:8000`. Keys must never be added to frontend environment variables. If serving a different origin, configure the backend's explicit `VIVACITY_CORS_ORIGINS` allowlist for both HTTP and WebSocket connections. Bind both local servers to loopback.

## Tests

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH=(Resolve-Path ../data).Path + '/playwright'
$env:TEMP=(Resolve-Path ../data).Path + '/browser-temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force
npx playwright install chromium
npm run test:e2e
```

The test runner uses project-local browser/temp paths, starts backend and production preview if absent, and executes real jobs. Build before running. It reuses an existing backend at 8000; tests create fresh worlds and preserve their history. Eight V2 browser journeys cover measured robot search/transforms/exports/commit/replan, scientific comparison/control/history, lost-response recovery, duplicate submissions/reconnect, automatic replay/performance, responsive/keyboard/offline/axe, real flex cloth and import validation. Evidence goes to `../artifacts/v2-browser/`, with the report at `../artifacts/v2-final-browser-tests.json`. Set `VIVACITY_TEST_REPORT` to retain a separate rerun report. The original six-test suite is retained in `e2e-baseline/`; its labels describe the previous UI. See the root V2 test report for actual results, including repaired intermediate failures. These tests require WebGL2; software rendering is supported but measurably slower than GPU rendering.

## Physical rendering contract

`public/vivacity/robot-geometry.json` and `robot-meshes.bin` are exports of the actual compiled MuJoCo model. From the root, `python -m scripts.sync_frontend_assets` regenerates both. Preserve the Panda license. The brand logo and self-hosted fonts have separate provenance/licenses in the same asset folder.

All coordinates are meters. Robot, cloth and science are Z-up; uploaded glTF previews use Y-up. MuJoCo quaternions are WXYZ; Three.js uses XYZW. Robot bodies are flat groups at their measured **world** poses. Geometry uses compiled **local** poses and compiled centered/rotated mesh vertices. Applying raw XML mesh transforms again would double-transform the mesh. Render groups 0 (scene) and 2 (visual meshes); collision geometry remains in the backend. Cube/obstacle body poses come from measurements; obstacle half-size comes from the replay configuration. End-effector and target markers use the API positions. Red failure markers identify involved **body origins**, since the API does not return contact point coordinates.

Replay linearly interpolates measured positions and slerps measured body quaternions; it does not reintegrate physics or claim collision safety between samples. Physics checks occur every 2 ms in the backend; visual replay is sampled approximately every 50 ms. Camera/grid/light operations never alter simulator state. The canvas renders on demand while idle and continuously during playback or camera motion.

## Client organization

- `src/generated/api.d.ts`: generated REST types from root OpenAPI.
- `src/domain.ts`: adapter-specific trace types and documented WS envelope (WS is an OpenAPI extension, not a REST component).
- `src/api.ts`: API boundary and errors; no fixture imports.
- `src/useRuntime.ts`: world/job persistence, idempotent submission retry, sequence reconnect, polling fallback, environment/commit/reset/history.
- `src/usePlayback.ts`: presentation time only.
- `src/RobotView.tsx`: compiled geometry + measured transforms.
- `src/ScienceView.tsx`: observed positions, executed predictions and residuals.
- `src/App.tsx`: shared workspace and evidence/control/inspector flows.

Local storage contains world IDs, experiment IDs, last event sequence and chosen lab. It never stores fabricated results. Refresh refetches authoritative records from SQLite through the API. HTTP 404 permits replacing a deleted world; other errors remain visible. Mutations have an immediate in-memory guard. Submission retries reuse one UUID key; deliberate new runs use new keys. Late responses are checked against the current experiment ID. Geometry edits/reset/commit advance revision; old replays retain their original configuration and cannot be committed. Scientific history uses the observed positions recorded with that experiment, not the current world's regenerated dataset.
