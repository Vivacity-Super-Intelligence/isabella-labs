# Vivacity V2 implementation record

## P0 preservation audit (2026-10-10)

Baseline source: commit `1c5a83b`, branch `codex/investor-workspace`. No unrelated uncommitted frontend work was present. Existing React 19 / TypeScript / Vite / Three.js client, FastAPI / SQLite worker, MuJoCo 3.15.0 Panda adapter and SciPy 1.18.1 orbital adapter are retained.

Both public websites were opened and inspected through browser DOM and screenshots. Evidence: `artifacts/v2-baseline-sites.json`, `artifacts/v2-baseline-brand.png`, `artifacts/v2-baseline-deployed.png`. Company brand: Geist, native fork mark, dark neutral background, light engineering field and restrained blue. The company opening uses named intro animations, including logo motion and word reveal. Repeated labels, two inspector sections and unnecessary world identifiers are the main UI clutter.

Baseline backend: **57 tests, 0 failures, 0 errors, 121.242 seconds**, executed in this audit (`artifacts/v2-baseline-backend.xml`). Strict TypeScript and production build passed. Original browser suite: **4 passed, 2 failed, 477.724 seconds** (`artifacts/v2-baseline-browser-tests.json`). The first journey exceeded its 180-second test limit while a concurrent CLI demonstration occupied the one-worker queue; the software-rendering measurement obtained fewer than its required 30 frame samples. Neither failed check is treated as a pass. The independent real HTTP/WebSocket demonstration passed all six experiments, including exact repeat, geometry changes, blocked scene and zero-mass control (`artifacts/v2-baseline-verification.json`). Final checks will isolate workloads and report frame measurements without assuming a hardware speed guarantee.

Working core: independent full-integration snapshots, actual IK/RRT planning and physics, contact/limit/controller/timeout classification, measured replay, environment revision invalidation, persistent history, idempotent submissions, held-out numerical hypothesis comparison and hidden-truth isolation. Reach only: grasp/lift/place is absent. No existing cloth or import backend.

Deployment audit: Vercel frontend loads, but its previous temporary Cloudflare API tunnel is offline. It is **not currently an end-to-end working public deployment**. Python must run outside ordinary frontend hosting, with persistent SQLite storage and background workers. Existing Railway provisioning was blocked by an expired trial. No new paid infrastructure is authorized or purchased by this audit.

## Milestone order

P1 minimal branded workspace; P2 one bounded event inspector; P3 genuine hierarchical candidate search; P4 verified result cards, versioned exports and automatic recorded replay; P5 reaching hardening and honest pickup boundary; P6 solver-derived 3D discovery; P7 physically credible constrained cloth benchmark; P8 bounded validated world imports; P9 short brand opening; P10 integration, visual and deployment verification. Each stage receives relevant executed checks and a commit. Advanced gaps remain explicit rather than being simulated visually.

P1 completed: one problem statement, right-aligned minimal navigation, no visible world IDs or repeated simulator labels, faithful existing robot geometry and settings. Strict TypeScript passed. Actual browser layout checks passed at 1440, 768 and 375 px with no page exceptions or horizontal overflow; desktop and mobile screenshots were viewed (`artifacts/v2-layout*`). Cloth and import initially show explicit unavailable states until their implementation milestones.
