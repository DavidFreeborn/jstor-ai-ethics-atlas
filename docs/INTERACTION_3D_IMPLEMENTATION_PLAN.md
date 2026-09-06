# Atlas interaction and 3D revision

## Intended result

Both publishing targets use the same readable typography, interface dimensions, data and interaction code. The initial map frames the dense main group, while Fit all remains available. Paper groups remain selected by canonical ID across lenses and dimensions. Genuine 3D title-semantic geometry supports orbit, pan, zoom and selection without changing topic assignments.

## 1. Establish evidence

- Inspect the committed live release and unfinished local fixes; preserve unrelated work.
- Compare actual published HTML, fonts, computed styles, device scale and canvas geometry at identical desktop and narrow viewports. Do not infer browser zoom from a local-source comparison.
- Exercise the legacy implementation with synchronous pointer-move/pointer-up bursts to expose queued React updater races. Capture exceptions, console errors and stalled rendering.
- Review the reference atlas's 3D projection and navigation approach.

## 2. Stabilise interaction and rendering

- Remove pointer and camera movement from React's queued state updates. Native events update owned camera state synchronously and request at most one drawing frame.
- Snapshot drag origins, track pointer IDs, clean up cancellation/capture/blur/unmount, distinguish clicks from drags, and support wheel delta modes and two-pointer gestures.
- Clamp finite camera values; avoid canvas allocation during navigation; cap backing-store density and total pixels. Draw only on change and stop when unmounted.
- Cache visual encodings separately from geometry. Update picking only for the painted frame. Keep text decoding safe for malformed numeric entities.
- Make facet membership and colour allocation one atomic update. Abort superseded data requests. Retain a useful error boundary and proper console diagnostics rather than silently swallowing unexpected exceptions.

## 3. Shared presentation and opening view

- Bundle identical font files through the shared stylesheet for both targets; remove divergent Google Fonts/next-font pipelines.
- Use readable shared label sizes and matching panel/navigation/matrix dimensions; preserve user browser zoom.
- Derive the dense group's centre robustly from coordinate quantiles; open at approximately 1.25^5.5 of the former overview. Reset returns here; Fit all includes the outliers. Resize preserves the camera focus.

## 4. Persistent paper groups

- Store an explicit set of canonical paper IDs and a compact source label, independently of the lens, facet palette and selected paper details.
- Topic selection and facet value selection create groups. Provide a box-selection mode for arbitrary visible clusters and a clear-selection action.
- Recolour selected papers by each new lens; dim nonmembers with crisp opaque marks. Preserve membership when a target lens lacks data, representing those selected records distinctly.
- Keep metadata-neighbour selection explicit and preserve its IDs when switching lenses. Validate membership counts against released data, including overlapping keywords.

## 5. Scientific 3D geometry

- Reuse all 7,076 persisted 768-dimensional title SPECTER embeddings, checking canonical row IDs against the catalogue index.
- Fit a seeded 3-component UMAP using cosine distance, 30 neighbours and min_dist 0.08. Do not invent depth from 2D, topic IDs or random noise.
- Audit finite coordinates, IDs, trustworthiness and neighbour recall against embeddings; record seed sensitivity, parameters, package versions and source/output hashes.
- Ship compact coordinates separately and load once on first 3D use. Retain 2D if the 3D asset fails; allow retry.
- Use perspective projection with near-plane clipping, depth-aware drawing/picking, orbit/pan/zoom/reset/fit controls, and shared lens encodings/selection. No automatic motion.

## 6. Verification and iteration

- Unit tests: finite bounded camera operations, zoom anchor invariance, projection/clipping, focal view, malformed entities and stable ID membership.
- Browser regression: legacy crash reproducer; rapid mixed input bursts; pointer cancel/capture loss; lens/facet churn; selection preservation; 2D/3D toggling and box selection; resize and touch gestures.
- Observe idle frame activity, draw counts, backing-store reallocations and timing during sustained interaction. Verify no hidden loops, excessive redraws or console exceptions.
- Run both production builds, TypeScript, lint, existing data/palette/network/association checks and Worker smoke test. Compare both production targets at matching viewports and enlarged text.
- Inspect screenshots of default and selected states in both dimensions and matrices. Iterate only on demonstrated failures or usability problems.

## 7. Release

- Document measured results and any limitations in an audit record.
- Commit the exact tested source, push GitHub and Sites source repositories, publish both targets, wait for successful deployment, and verify live assets and key interactions.
- Return direct links and concise changes; distinguish measured fixes from unverified environmental causes.

## Plan review

The original partial fix still ran two animation-frame stages and reprojected in React. This revision gives one owned renderer all camera input and drawing, eliminating the cleared-reference race rather than depending on update timing. Selection is a data identity operation, not a colour-state copy. Three-dimensional coordinates are generated from embeddings and audited separately; dimensions never imply unchanged geometry. Both hosts share font binaries and computed-size checks instead of a host-specific CSS zoom workaround.
