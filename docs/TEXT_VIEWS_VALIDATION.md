# Text availability and full-text positions

## Design

Separate three independent controls: **Positions** chooses a text representation and its geometry; **Text** restricts eligible paper IDs; **Lens** chooses colour. Do not infer new positions, refit on filtering, or treat an intersection as an embedding model. Preserve all existing layouts, topic assignments, analytical cohorts and palette semantics.

Implementation sequence:

1. Reconcile canonical paper IDs against the frozen abstract release and audited full-text input; distinguish raw availability from model eligibility.
2. Construct the full-text vectors from 1,668 full-text-only documents and 423 paired full-text vectors. Reject mismatched IDs, nonfinite vectors and invalid dimensions.
3. Fit independent seeded 2D and 3D UMAP layouts; audit neighbouring-paper retention and three-seed sensitivity. Release coordinates and provenance, not source text.
4. Add a compact availability button beneath Positions, with explicit inclusive/exclusive options and current-cohort counts.
5. Apply an ID visibility mask in the existing renderer. Keep its geometry, row indices, cameras and backing buffers stable; exclude hidden papers from rendering, picking and box selection.
6. Recompute filtered lens counts, facets, search, paper relations and coauthorship reach. Preserve group IDs and temporarily hidden paper selections. Keep agreement colour ranks tied to the underlying position cohort.
7. Test exact cohorts, empty states, data-loading failures, selection persistence, desktop/mobile layout and high-frequency interaction in Chromium and Firefox.
8. Validate both production builds, publish the same revision to both hosts and confirm deployment completion.

## Coverage contract

| Positions | All | Has abstract | Has full text | Has both (∩) | Abstract only | Full text only |
|---|---:|---:|---:|---:|---:|---:|
| Titles | 7,076 | 2,100 | 2,091 | 423 | 1,677 | 1,668 |
| Abstracts | 2,057 | 2,057 | 423 | 423 | 1,634 | 0 |
| Abstracts ∪ full text | 3,725 | 2,057 | 2,091 | 423 | 1,634 | 1,668 |
| Full text | 2,091 | 423 | 2,091 | 423 | 0 | 1,668 |

The 43 additional nonempty abstracts lack frozen model coordinates and do not have eligible full text. There are 3,308 catalogue records with neither source. “Has” includes paired records; “only” excludes them. Filtering operates within a position cohort and does not expand it. Matrices remain independent of map filters.

## Full-text provenance and limitations

The full-text view uses the pinned SPECTER encoder and audited passage vectors from the union pipeline. Every record uses sampled full text, including the 423 with abstracts. No abstract vector enters this projection. Full texts contribute at most eight stratified 256-word passages; body-token-weighted subchunks are averaged within passages and passage means are averaged equally, then normalised. This is an exploratory extension of an abstract-trained encoder, not exhaustive full-document encoding.

UMAP uses cosine distance, 30 neighbours, `min_dist=0.08` and seed 42, separately in 2D and 3D. Seeds 43 and 44 assess sensitivity; no topic labels or manual cluster separation are used. The encoder, fitted cohort and source differ from the frozen abstract view, so visual changes cannot be attributed solely to text length. The intersection filter is useful for inspection, not a controlled paired-source experiment.

| Released layout | Trustworthiness, k=15 | Neighbour recall, k=15 | Neighbour recall, k=30 |
|---|---:|---:|---:|
| 2D | 0.928579 | 0.344939 | 0.369185 |
| 3D | 0.952455 | 0.394803 | 0.409868 |

Across seeds, trustworthiness ranges from 0.928579–0.931580 in 2D and 0.952455–0.952916 in 3D. Alternative-seed 15-neighbour overlap with the released layout is 0.680–0.700 and 0.795 respectively. These are projection diagnostics, not evidence that apparent gaps or clusters are scientifically definitive. Exact hashes and all runs are in [FULLTEXT_POSITIONS_AUDIT.json](FULLTEXT_POSITIONS_AUDIT.json).

## Validation

The automated release and map tests check all 24 source/filter combinations, exact canonical ID sets, coordinate/index preservation, nonmutation of the source map, facet totals and brute-force shared-author reach. The browser suite checks camera and selection persistence, empty-result recovery, masked point picking and box selection, full-text provenance and corrupt-asset recovery alongside the existing rapid-interaction regressions. Screenshots cover the filter menu, full-text 2D/3D and the mobile control panel.

The existing scientific release, palette, network and association checks remain in place. Type checking, lint, both production builds and the Worker runtime smoke test are required before publication. No dependencies were added; full-text coordinates load on demand and availability IDs share a lossless canonical prefix to avoid redundant download bytes. Filtering does not reallocate the canvas backing buffer.

### Results — 13 September 2026

- Scientific release, source-protocol, projection, selection, network, association and palette checks: passed.
- TypeScript and lint: passed. Both production builds completed; the production Worker returned HTTP 200.
- Chromium and Firefox: all functional and stress-test groups passed with no page or error-console events. The additional native touch/pinch suite passed in Chromium; it is not run in Firefox.
- Browser regressions include 3,200 rapid pointer moves, 800 mixed wheel events, 120 point-detail selections and 20 workspace remounts, alongside all four position views and six availability filters. The map unit tests exercise 40,000 finite camera updates.
- Visual review: desktop filter popover, full-text 2D, filtered full-text 3D and mobile controls. Capture waits for popover transitions to finish; the area-selection fixture uses integer CSS-pixel bounds consistently across browser event protocols.
- Original catalogue, abstract and union coordinate releases and topic data are unchanged. Byte-hashed JSON is preserved byte-for-byte across Windows and Linux, with automatic line-ending conversion disabled. No source texts or private embeddings are included in the release.

The full-text coordinate download is 185,230 bytes and loads only on demand. The static application's main bundle is approximately 497 kB (164 kB gzip). Performance observations are local test results, not guarantees for every browser or device.
