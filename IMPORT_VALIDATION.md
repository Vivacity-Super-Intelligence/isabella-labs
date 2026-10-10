# Bounded world-import verification

Existing importer boundaries were preserved. Supported inputs are GLB, embedded glTF, bounded manifest ZIP bundles, and MJCF/URDF description inspection. JSON mesh buffers and scene transforms are decoded into validated static triangles; MuJoCo/native plugins are never invoked on uploaded content. ZIP files are inspected in memory, not extracted into the server filesystem.

Executed checks in the final **101-test** full regression include actual triangle decoding/transform/persistence, relative bundles and robot-description staging, malformed inputs, forbidden paths/external references, cyclic graphs, expansion limits, HTTP upload/preview errors and restart persistence. The complete local browser journey also uploaded `fixtures/imports/triangle.glb`, displayed exactly three decoded vertices, and retained one inspector. Evidence: `artifacts/master-release-backend.xml`, `artifacts/master-live-verification.json`.

Limits: 16 MiB upload, 32 MiB expanded bundle, 64 entries, 100,000 vertices, bounded accessors and non-finite geometry rejection. Absolute paths, traversal, symbolic links, encrypted entries, external resources and native-plugin execution are rejected. ZIP manifest is exactly `{"entrypoint":"assets/scene.gltf"}`; resources must be present within the bounded bundle or supported embedded data.

All imports return `physics_ready:false`, with `visual_only` or `configuration_required`. Native robot/world simulation is **incomplete and unavailable**: there is no isolated worker sandbox or accepted imported-robot control schema. No misleading Run button is offered. Static preview does not promise materials, animation, skins, arbitrary textures or every glTF extension. Import records are currently public demo data and have no lifetime upload quota or authenticated deletion endpoint; do not upload confidential assets.

API: POST `/v1/imports?filename=scene.glb` with raw bytes and `Content-Type: application/octet-stream`; GET `/v1/imports/{id}` metadata; GET `/v1/imports/{id}/preview` validated geometry. Samples and licenses are in `fixtures/imports` and the existing asset provenance files.

Current public browser journey passed a real GLB upload and three-vertex preview at the deployed URL (`artifacts/master-public-verification.json`). This verifies visual import, not native simulator execution.
