# Panda sampled trajectory binary v1

This is a Vivacity data file, not robot firmware, a Franka-native file, or a flashable/executable program. It records sampled simulated joint positions; it does not contain gripper commands. Simulation verification is not hardware validation. A separately implemented and validated controller adapter is required for any robot use.

All numbers are little-endian. The 12-byte header is ASCII `VIVAPND1` followed by an unsigned 32-bit sample count. Each 64-byte record contains eight IEEE 754 float64 values: simulation time in seconds, then joints 1 through 7 in radians, in Panda model joint order. Times are absolute simulator timestamps and are strictly increasing. Identical duplicate terminal samples are omitted. No resampling, timing adjustment or motion smoothing is performed.
