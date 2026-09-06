# Interaction, presentation and 3D audit

Date: 6 September 2026. Baseline: `c9bb7f3`.

## Confirmed failure and correction

The published GitHub Pages and Sites releases both reproduced `TypeError: Cannot read properties of null (reading 'tx')`. A real pointer-down followed by same-task pointer-move events and pointer-up caused a queued React camera updater to read a drag reference after pointer-up had cleared it. Both entered the workspace error boundary. This was a client interaction exception, not a Worker HTTP failure; the available recent Worker error query was empty.

Camera state now belongs to a renderer with synchronous native input handlers. One pending animation frame coalesces input. No camera updater reads a later-mutated drag reference, and React does not reproject the map on camera movement. Pointer identity, capture loss, cancellation, blur, multiple touches and unmount are handled explicitly. Facet membership and colour allocation update atomically. Invalid numeric HTML entities cannot throw during detail rendering. Optional 3D loading is abortable and recoverable.

The canvas backing store changes only for viewport size or pixel density, with a maximum of 2× density and eight million pixels. Encodings are cached independently of camera geometry. Offscreen marks are culled; 3D marks are depth-sorted and picked in paint order. Dimmed marks are opaque, without blur or alpha accumulation. The renderer stops when idle.

## Presentation and selection

At the same 1440 × 900 viewport, the old hosts had identical header, sidebar and canvas dimensions, but separate font pipelines and different heading widths (195.61 versus 203.75 CSS pixels). That evidence does **not** establish the browser zoom in a reported user session. Both targets now import the same font binaries and stylesheet. Tabs and lens labels are 14 px, metadata is 12 px, the header is 68 px and the desktop lens panel is 296 px. No host-specific CSS zoom is applied.

The opening 2D camera uses coordinate medians and 1.25^5.5 zoom. At the desktop test viewport it shows 5,481 of 7,076 points; Fit all shows all 7,076. Display scaling is isotropic. Resizing preserves the camera's semantic focus. The opening 3D camera frames the central 75% radial extent; Fit all frames the complete projection.

Groups store canonical IDs independently of lens colours, camera and paper details. Topic, keyword/publication value, selected-value union, shared metadata and rectangular spatial selections persist across lenses and dimensions. A selected record missing the destination lens is hollow, not silently dropped. Rectangular selection includes projected points in its screen rectangle, including points behind other points in 3D; it is not a volumetric selection.

## Scientific geometry

The original 7,076 × 768 SPECTER title embeddings and canonical row index generate a separate three-component UMAP: cosine metric, 30 neighbours, minimum distance 0.08, seed 42, single-threaded seeded fitting. Coordinates are not invented from 2D positions or topic labels. The original 2D data and all model assignments are unchanged.

The [machine-readable audit](PROJECTION_3D_AUDIT.json) records source, index and output SHA-256 hashes, package versions and three seeds. Seed-42 trustworthiness at 15 neighbours is 0.91418; exact neighbour recall is 0.24815. Across seeds 43/44, trustworthiness is 0.91489/0.91526 and 15-neighbour layout overlap with seed 42 is 0.48015/0.52802. These are distinct diagnostics: high trustworthiness does not mean all original neighbours survive. The layouts are exploratory, have seed sensitivity and do not establish exact semantic distances or inferential cluster boundaries.

## Verification

- Unit/property checks: 40,000 camera updates, zoom anchor invariance, finite bounds, wheel units, near-plane rejection, Fit all, backing-store limits, canonical memberships and malformed text entities.
- Chromium and Firefox production-browser runs: the exact legacy crash sequence; 40 bursts comprising 3,200 pointer moves and 800 mixed-unit wheel events; 120 real pointer selections and detail renders; 3D orbit, pan, cancellation, pinch and zoom; lens/palette changes; exact ID fingerprints across lenses/dimensions; box selection; optional-asset failure and retry; 20 workspace remounts; desktop and narrow layouts.
- Chromium additionally exercises native two-finger touch at 3× device density and compares retained heap after explicit garbage collection. No growth beyond the regression threshold, no navigation-triggered canvas reallocations and no idle redraw loop were observed.
- Populated-view sustained interaction is included in timing samples, not only extreme zoom or empty views. Local Chromium median/p95 drawing times were approximately 2–2.5/4–5.4 ms; Firefox approximately 11/13 ms. These are renderer CPU durations on the test machine, not guarantees of end-to-end frame rate on every device. Final paired Chromium runs retained 14.06 → 14.91 MB (Pages) and 14.67 → 15.00 MB (Worker) of JS heap after the remount test.
- Both production builds, TypeScript, lint, Worker HTTP smoke test, release hashes/coverage, palette, network and association tests pass. The browser suite runs in the GitHub Pages deployment workflow before publishing.
- Visual inspection includes the opening map, 3D publisher lens, persistent topic selection, detailed/overview matrices, methodology and narrow/mobile layouts. The 3D starting camera was tightened after the first visual review.

Test scripts and structured per-run evidence are reproducible through the README commands; local screenshots and browser reports are stored in the ignored `work/audit` directory. Runtime diagnostics are emitted only when a test explicitly enables `data-audit` on the canvas. Browser/OS-specific faults cannot be ruled out universally; this audit verifies the reproduced failure and the listed stress cases.
