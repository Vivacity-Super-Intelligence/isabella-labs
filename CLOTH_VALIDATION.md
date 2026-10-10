# Cloth validation

Existing experimental benchmark: actuated Panda carries a pre-attached folding bar through a 7 × 7 MuJoCo flex sheet, releases its seven ideal edge constraints and allows settling. Actual integrated vertex/body states supply alignment RMSE, vertex coverage, constraint error and contact/limit/controller failure checks. The fixed hinge, pre-attached fixture and disabled bar collision mask are explicit limitations. There is no autonomous frictional cloth-grasp acquisition or general garment folding.

The current original-code baseline executed the existing cloth tests within 86/86 passes. Prior current-model evidence is in `ROBOT_CLOTH_RELEASE.md` and its referenced artifacts. A separate new repeated cloth reliability benchmark and live autonomous cloth browser check are pending; no new success rate is asserted.
