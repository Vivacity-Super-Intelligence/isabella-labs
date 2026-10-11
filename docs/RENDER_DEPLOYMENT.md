# Render deployment handoff — 2026-10-11

Status: prepared, **not provisioned on Render**. The dashboard is signed out and
no Render API key/CLI account is configured. A paid service has not been created.
The Vercel frontend remains at https://demo.tryvivacity.com/.

Private deployment repository: https://github.com/Tanish-Anand1/vivacity-runtime.
It contains only backend source, Panda assets/licensing, pinned dependencies,
tests and deployment configuration. Frontend work, credentials, imports and
experiment databases were excluded. SOURCE_MANIFEST.json hashes the exported
source. The original workspace and its Git history are preserved.

## Exact proposed service

Import `render.yaml` as a Render Blueprint from that repository:

- Docker web service `vivacity-runtime`, Singapore region.
- Paid `1c-2g` compute: one CPU, 2 GB RAM. One instance, one Uvicorn process.
- 5 GB persistent disk mounted at `/data`; SQLite WAL and staged imports reside
  beneath it through `VIVACITY_DATABASE=/data/vivacity.sqlite3`.
- `healthCheckPath: /health`, 60-second graceful shutdown limit.
- Platform-provided `PORT`; HTTPS and WebSockets use the same web service.
- Exact CORS/WS origins: `https://demo.tryvivacity.com` and
  `https://vivacity-investor-demo.vercel.app`.
- Numerical thread pools limited to one; deterministic agent requires no key.
- Automatic redeployment disabled to avoid interrupting investor sessions.

Published pricing inspected on 2026-10-11: $25/month compute plus $1.25/month
disk, **$26.25/month before tax and usage overages**, on a Hobby workspace with
no additional workspace subscription. Review the account's actual recurring
price before activation; approval has been requested.
Persistent disks are published at $0.25/GB/month: the proposed disk contributes
$1.25/month, before compute, taxes and usage overages. No financial commitment
has been made. Do not select the free service as an “always-on” substitute:
it sleeps after 15 minutes idle and cannot attach this disk.

Official sources checked: [Blueprint fields](https://render.com/docs/blueprint-spec),
[free-service limits](https://render.com/docs/free),
[persistent disks](https://render.com/docs/disks),
[WebSockets](https://render.com/docs/websocket),
[health recovery](https://render.com/docs/health-checks),
[pricing](https://render.com/pricing).

## Verification before switching frontend

The exact Linux Dockerfile built successfully and all 119 tests passed inside
the image in 148.34 s. Executed proof: `artifacts/render-linux/backend-linux.xml`;
[actual run](https://github.com/Tanish-Anand1/vivacity-runtime/actions/runs/38139662443).
Final source-preserving revision `11c1f83` also passed the manifest check,
Docker build and all **119 tests in 269.17 s**:
[final run](https://github.com/Tanish-Anand1/vivacity-runtime/actions/runs/38140064902),
`artifacts/render-linux-final/backend-linux.xml`. The exported source bytes and
the deployment checkout now match, including Panda assets.

After Render reports a successful deployment, use its **actual** HTTPS URL:

```powershell
$env:API_URL='https://ACTUAL-SERVICE.onrender.com'
Invoke-RestMethod ($env:API_URL+'/health')
Invoke-RestMethod ($env:API_URL+'/openapi.json') | Out-Null
vercel deploy --cwd frontend --prod --yes --scope tanishs-projects-66633ee2 --build-env "VITE_API_BASE_URL=$env:API_URL"
# Use the immutable URL returned by that deploy:
vercel alias set NEW_IMMUTABLE_URL vivacity-investor-demo.vercel.app --scope tanishs-projects-66633ee2
$env:UI_URL='https://demo.tryvivacity.com/'
$env:PROOF_PREFIX='render-public'
node scripts/check-pause-live.mjs
$env:UI_URL=$null
$env:BOUNDARY_PROOF_PREFIX='render-public'
node scripts/check-public-boundaries.mjs
```

These create real independent pickup/cloth/scientific experiments, verify
measured REST/WSS output and control semantics, and check reload/mobile/offline
recovery. The public physics smoke completes eight trials; the separate
`scripts/verify-physics-iterations.py` audit completes all 5,000.

Verify disk persistence separately: record a completed world/experiment,
restart the Render service during an idle window, then fetch the same evidence
using the same capability. Interrupted jobs must become failed records, never
manufactured successes. Existing browser sessions pointing at the tunnel do
not migrate automatically; the new backend starts with its own database unless
a consistent SQLite online backup and imports are intentionally migrated.

## Availability and remaining limits

Paid compute avoids free-tier idle suspension. Render's HTTP health checks can
restart an unhealthy process. This single SQLite/disk instance is **not** a
100% uptime or zero-downtime guarantee: disk-backed redeploys/restarts interrupt
active work and WebSockets; clients must reconnect. `/health` reports process
readiness and loaded backend versions, not a full numerical experiment probe.

No Render service, remote restart/persistence, cloud performance, monitoring
alert destination or end-to-end Render URL is verified until actual deployment.
Daily provider disk snapshots are not a tested application restore procedure.
Long-term disk/upload quotas, retention and full account authentication remain
missing; two active sessions and one simulation worker limit visitor capacity.
No automatic ping loop or uptime claim substitutes for provisioned paid compute.

Backend export command, if source changes before deployment:

```powershell
.venv/Scripts/python.exe scripts/export-render-source.py
```

It creates a new ignored `data/render-source-TIMESTAMP` directory and never
overwrites an existing export or copies secrets. Publish reviewed source changes
to the dedicated private repository; deploy only a Linux-verified revision.
