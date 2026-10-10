# Deployment

The frontend is Vite/React on Vercel. Current custom-domain release: https://demo.tryvivacity.com/. The investor-demo domain is an older frontend revision. Deployment information here describes the preceding release; it must be reverified after the master changes.

The existing API uses a persistent local Python worker and SQLite WAL, exposed through a temporary Cloudflare tunnel. `scripts/start-public-demo.ps1`, `restart-public-api.ps1` and identity-checked stop scripts own its processes. This depends on the computer, network and tunnel. It is not durable independent cloud hosting. Previous Railway provisioning was blocked by an expired trial.

Production needs a provisioned persistent Python host/volume, access controls, backups, bounded workers, known-origin CORS and HTTPS/WSS. MuJoCo workers do not run in the static Vercel frontend. No paid infrastructure has been purchased. Do not commit credentials or `.env.local`.
