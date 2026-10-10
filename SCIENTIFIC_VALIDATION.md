# Scientific validation

Existing restricted 2D test-particle gravity uses `solve_ivp`, training `least_squares`, held-out trajectories, training BIC and local linearized uncertainty. A fixed external perturber and known initial conditions are explicit model assumptions. Hidden generating mass is removed from the fitting world. Either hypothesis can win. It is model comparison, not discovery of a new physical law.

The compatibility baseline executed scientific tests within 86/86 passes (`artifacts/master-baseline.xml`). The new five-test supervisor run passed, including two fresh science cycles with different observations, settings, seeds and selected hypotheses. The complete local browser journey additionally verified actual solver predictions, positive integration calls, no generating parameters in fitting observations, and exact `[x,y,0]` geometry (`artifacts/master-live-verification.json`).

## Actual new autonomous experiments

Values below are extracted from persisted jobs by `python -m scripts.export_master_measurements`, not prescribed expected answers. Full residuals, parameter uncertainties, comparisons and performance are in `artifacts/master-measurements.json`.

| Fresh case | Model | Training RMSE | Held-out RMSE | Training BIC |
| --- | --- | ---: | ---: | ---: |
| Seed 7 perturbed | Central only | 0.0512894163 | 0.3075120590 | 257803.7991 |
| Seed 7 perturbed | Extra fixed mass | 0.0008577006 | 0.0010203881 | 81.2637 |
| Seed 8 no-influence control | Central only | 0.0009670468 | 0.0008035318 | 119.1834 |
| Seed 8 no-influence control | Extra fixed mass | 0.0009650406 | 0.0009408331 | 123.2934 |

The first fit inferred mass **0.1198718483 ± 0.0002328785** (local linearized standard error), central parameter **0.9999784517**, with full-rank Jacobian. The second extra-mass fit inferred **0.0000996270 ± 0.0001445536** and made worse held-out predictions; the central-only model was selected. Selection requires BIC improvement >6, held-out RMSE improvement >5%, and full-rank Jacobian; a failed fit leaves comparison incomplete. The first job performed 30 numerical integrations; the second performed 51. Actual whole-job times were 1.746 s and 0.947 s on the shared Windows machine.

The supervisor alternates a perturbed generator and a no-influence control while changing seed/noise/horizon. That experimental schedule is a deterministic policy, not LLM reasoning. Hidden generating parameters live only in generation/private supervisor configuration; the fitting state and public exports omit them. The investor can explicitly request either generating scenario; that is an observation-generation control, not information given to the fitter.

Limits: known initial state, known fixed perturber location, restricted test-particle model, synthetic data, chronological holdout and Gaussian local covariance. No interacting moving planets, posterior sampling, novel-law discovery, autonomous new hypothesis language, or unconfigured LLM call is claimed. Public verification is recorded separately after deployment.
