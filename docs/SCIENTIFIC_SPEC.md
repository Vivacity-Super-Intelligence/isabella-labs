# Execution contract and scientific scope

Vivacity evaluates measured alternative futures, not predetermined outcomes. Robotics uses the Menagerie Panda with MuJoCo dynamics, a fixed blue cube, collision geometry, a position-actuated arm and a pre-grasp pose. Reaching is the milestone; gripping is not implemented. A collision-free geometric path is only planning feasibility; actual contacts, joint limits, finite state and goal error decide execution success.

The Invisible Planet uses nondimensional 2D Newtonian gravity. The central body and a stationary external perturbing mass are fixed; the observed body is a test particle. This restricted model ignores recoil and perturber motion. Observations have seeded independent Gaussian noise. Central gravitational parameter and optionally external mass are fitted to the training prefix; the temporal suffix is held out. Initial position/velocity and perturbing location are known experimental assumptions. Mass strength is hidden. No new law is discovered.

Success must be demonstrated by executed tests and artifacts. Every failed candidate remains a failed candidate. Model comparison reports held-out RMSE and training BIC, with local linearized uncertainty rather than a fabricated posterior.
