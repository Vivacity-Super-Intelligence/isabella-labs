# Vivacity: a three-minute investor demonstration

This walkthrough runs live MuJoCo and SciPy calculations. It requires the local backend and frontend; there is no offline results substitution. Performance varies with machine load. Use a WebGL2-capable Chromium browser and allow the Panda asset download to finish before presenting.

## Start

Install/build with the root README commands. From `P:\VIVACITY\DEMO-`:

```powershell
.\scripts\start-demo.ps1
```

The script starts hidden local services or reuses existing Vivacity services, checks readiness and opens http://127.0.0.1:5173. API docs: http://127.0.0.1:8000/docs. `-NoBrowser` checks/starts services without opening a tab; `-Dev` chooses Vite development mode. Logs live in `data/run/`. `scripts/stop-demo.ps1` stops only recorded, matching processes launched by the start script; externally started processes remain running.

Browser refresh restores world/experiment IDs and refetches evidence. Prior history is retained. For the original robotics problem, use **Change obstacle → Original → Apply & run new experiment** if a previous demo changed the geometry. This computes a fresh experiment; it does not choose a stored result.

## 0:00–0:35 — give the planner a world

Say: “An agent needs an executable world, not just a description. Here is a Franka Panda arm with a target and an obstacle.”

Open **Robotics Lab**. The robot uses Menagerie meshes and actual MuJoCo body transforms. Drag to orbit, scroll to zoom, or focus the workcell and use arrow keys / plus / minus. Reset camera is separate from resetting physics.

Click **Run experiment**. Point to **Propose → Simulate → Evaluate → Decide**. The deterministic planner inspects a persisted state, uses damped pose IK and bounded joint-space RRT, forks independent simulator states, and measures each execution. Progress comes from real events and status requests. No paid LLM is required or claimed.

## 0:35–1:15 — compare consequences

Wait for the backend's decision. In the verified original fixture, the direct route collided, one bounded planning search failed, and another candidate executed a collision-free reach. These are observed fixture outcomes, not rules that force those branch numbers to win. Other worlds may fail completely.

Select the collision branch. Scrub to the end; inspect the contact pair and measured goal error. Red markers identify involved body origins, not precise contact points. Select the successful branch, press play, pause, scrub and change playback speed. The viewport interpolates saved measured samples. It never creates a new physics state.

Say: “We kept the failure. Success means reaching a pre-grasp pose within the measured tolerances. This demo does not grasp or lift.”

Optional: **Commit selected state** advances the persistent world. **Current state** reads the world; **Show replay** shows a branch's recorded future. Commit/reset advance the revision and make older branch commits stale.

## 1:15–1:50 — intervene and replan

Click **Change obstacle → Clear route → Apply & run new experiment**. Alternatively adjust X/Y/Z with sliders. Draft slider changes do not alter physics until applied. The API rebuilds the world, advances its revision, invalidates older results and computes new alternatives.

Say: “This is a new initial condition and a new simulation. The previous experiment remains inspectable, but cannot be committed into this revision.”

For a failure demonstration after the main pitch, apply **Blocked scene**. The verified fixture produced no selected branch. The app retains the failure; it does not invent a successful route. Return to **Original** to restart the usual scenario.

## 1:50–2:35 — switch domains, keep the runtime

Open **Discovery Lab** and click **Run experiment**. Explain “The Invisible Planet”: noisy synthetic positions are fit under two restricted 2D hypotheses, a central body alone and an additional fixed influence at a declared location.

Show filled training points, hollow held-out points, the two executed numerical prediction curves, residuals, and held-out RMSE. Select either branch for its measured metrics. Expand **Fitted parameters & uncertainty** for estimates and local standard errors. The selected model comes from held-out error, training complexity penalty and identifiability checks. Both fits can compute successfully while only one hypothesis is supported.

The optional **Show fitted influence** marker uses the fitted mass and the declared location. It does not reveal hidden generating parameters to the policy. The scientific timeline follows the calculated prediction samples.

## 2:35–3:00 — show the common abstraction

Open **How Vivacity works**: planner → state/action runtime → MuJoCo or SciPy → measured outcomes → next decision. Both adapters implement create, observe, snapshot, fork, apply action, simulate, evaluate, commit and replay while retaining different serialized states.

Say: “We are demonstrating a runtime for reproducible experiments and evidence-based decisions. These are real calculations inside deliberately simplified environments.”

After the pitch, open **Observation settings**, alter noise/count/horizon and apply a new experiment. The **No-influence control** tests whether an unnecessary mass is rejected; the verified control selected the baseline. **Refine observations** proposes an explicit new perturbed synthetic experiment with more samples and less noise; it does not silently change the current experiment or autonomously gather real astronomical data.

## Technical questions and recovery

- **Technical inspector** exposes measured world state, candidate action, evaluation/uncertainty, seed/revision/model hash, job timings, integration counts, replay size and persistent history.
- **Connection lost**: the app preserves evidence, disables new runs and attempts event reconnection with polling fallback. Click Reconnect when the backend is restored. Disconnecting does not cancel a server job.
- **Lost submission response**: Retry submission uses the same idempotency key, recovering the original job. A deliberate new run uses a fresh key.
- **Stale result**: inspect/replay its original configuration; create a fresh experiment before committing.
- **No result / simulator error**: inspect recorded outcomes. Adjust a supported condition or rerun. Never narrate a failure as a success.
- **After server restart**: SQLite records persist; interrupted jobs are failed honestly and are not automatically resumed.

For reproducible CLI evidence: `python -m scripts.demo --output artifacts/fullstack-live-demo.json`. For UI evidence, build then run `npm run test:e2e` from `frontend`. See `IMPLEMENTATION_STATUS.md` for actual executed results and measurements, and `DEMO_LIMITATIONS.md` for scope.
