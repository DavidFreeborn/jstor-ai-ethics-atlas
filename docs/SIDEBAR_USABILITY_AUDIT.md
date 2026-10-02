# Sidebar and keyword interaction audit

2 October 2026

## Position-source verification

The abstract/full-text union is not a filtered title map. `build_union_embeddings.py` encodes title plus abstract text for 2,057 records and title plus sampled full-text passages for another 1,668, using the pinned SPECTER encoder. `build_union_positions.py` fits independent 2D and 3D UMAP projections from those vectors. The browser loads `positions-union.json`, validates its release hash and uses its coordinates. The title map uses title-only vectors. Sharing an encoder does not make the inputs, vectors or layouts identical.

The union remains under Positions; the availability filter remains independent. No positions, text-availability IDs, topic assignments or other research artifacts changed in this revision.

## Findings and changes

- The fixed controls consumed most of the available height, leaving a nested keyword scroll area with little or no usable space. The page also imposed a 560-pixel minimum height. The atlas now fits the viewport and the complete sidebar has one native scrolling region. Its mobile sheet uses the same controls.
- Nine lens buttons consumed vertical space before the keyword list. A compact Lens dropdown retains every lens and displays the active lens's coverage beside its heading. Filters now has its own heading.
- The facet list silently stopped at 120 matches. All entries are now available, including through search. Names wrap, paper counts stay intact, and row order does not jump when a checkbox changes.
- Checkbox and keyword-name clicks previously performed different actions. The keyword name now labels its checkbox: either toggles colour only. A separate Highlight button adds the corresponding papers and changes to Remove while active. Highlight ticked keywords adds the union of ticked memberships. Multiple keywords, topics, publishers and journals can be combined, including across lenses. Each contribution keeps its original canonical IDs: removing one preserves overlaps with remaining contributions, even after position or availability changes. Palette changes do not replace highlights. Deselect clears all contributions.
- The legend distinguishes papers with none of the ticked keywords from papers without keyword data in the released vocabulary. Publisher and journal controls use the same interaction pattern and distinguish other categories from missing metadata.

## Verification

`scripts/audit_sidebar.mjs`, called by the production browser suite, checks:

- all 534 keywords are present, including search and scroll access to the final entry;
- clicking label text and pressing Space toggle colour without selecting papers;
- individual Highlight/Remove actions, exact ticked-keyword union IDs, multiple topics and keywords, overlap-safe removal, bulk addition and selection persistence across lenses;
- last-entry reachability and no unintended horizontal or document overflow at 1920×1080, 1366×768, 1280×600, 1024×600, 800×450, 640×360, 390×844, 320×568 and 320×320;
- 200% root-text enlargement at 960×540, with a rem-sized sidebar and wrapped labels;
- desktop and mobile screenshots, with menu transitions settled before measurement.

The existing browser suite also covers position/filter combinations, 2D/3D camera persistence, rapid drag/zoom, paper picking, workspace remounts and data-loading failures. Selection unit tests additionally cover overlapping contributions, repeated bulk additions, topic IDs scoped by model, spatial selections and removal after cohort changes. Data integrity checks remain unchanged. These checks cover representative viewport and text-size combinations, not every possible device configuration.

Chromium and Firefox passed the interaction suite and the focused nine-size/text-enlargement audit without page errors. Type checking, map unit tests, released-data validation, both production builds and the Worker HTTP smoke test passed. Screenshots were reviewed for desktop, short-screen, mobile and enlarged-text layouts. No dependencies were added.
