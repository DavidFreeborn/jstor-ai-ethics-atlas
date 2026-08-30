# JSTOR AI Ethics Atlas: reliability and interface revision

## 1. Objective

Revise the atlas into a quieter, more explicit scientific instrument while preserving its evidence boundaries. The release must:

- remain understandable without project-specific background;
- eliminate decorative or explanatory copy that duplicates an explicit title or control;
- prevent repeated point selection from destabilising the page;
- use high-contrast, distinguishable visual encodings;
- reproduce every analytical interaction available in the reference keyword-network application;
- retain the atlas's additional paper, method-comparison, LDA and publisher views;
- remain responsive, keyboard-operable and reproducible.

## 2. Evidence contract

### 2.1 Paper-map cohort

The catalogue contains 7,076 bibliographic records. The persisted semantic-model release contains 2,057 unique records with usable model inputs and a matching SPECTER embedding row, BERTopic assignment and document index. The map must not imply that the remaining 5,019 records were embedded.

An earlier report describes 2,053 rows. The later persisted release is authoritative for the atlas because its document index, assignment table and three embedding matrices agree at 2,057 rows. This is a release-version difference, not a hidden four-record imputation.

The catalogue denominator is methodological documentation, not a map control or status ornament. The working map should show its own `n` only where a denominator is analytically necessary.

### 2.2 Other cohorts

- LDA assignments: 2,052 abstracts; 2,051 join to the mapped-paper cohort.
- BERTopic-LDA comparison: 1,810 records with both assignments and no unresolved BERTopic outlier.
- Paired text-source cohort: 423 records with both abstract and full text; 383 are non-outliers in both selected BERTopic fits.
- Keyword network: 534 keywords and 4,474 retained co-occurrence edges.
- Keyword-journal network: 534 keywords, 1,201 journals and 9,330 associations; the interactive comparison displays the 50 highest-degree nodes of each type, matching the reference view.
- Publisher profiles: aggregate community summaries only; they must remain visually and verbally distinct from paper-level or journal-level joins.

## 3. Failure analysis and reliability design

### 3.1 Observed behavior

Repeated paper selection was reported to produce a page-level load failure. The failure did not reproduce locally after repeated selection, and all 2,057 detail records passed structural checks. No malformed LDA membership arrays, missing identifiers or duplicate membership keys were found.

### 3.2 Plausible stress path

The existing map recomputes the projection of every paper during every pointer-move nearest-neighbour query. It can therefore perform thousands of coordinate calculations and React hover updates per second, while redrawing the complete canvas after selection. This is unnecessary work and is a credible instability source in a constrained embedded browser even without a deterministic data exception.

### 3.3 Corrective controls

1. Precompute screen coordinates only when geometry, viewport or transform changes.
2. Build a fixed-size spatial index over those screen coordinates; pointer hit-testing inspects only nearby bins.
3. Update hover state only when the hovered paper identity changes.
4. Separate the static point layer from the selected-point overlay where practical, avoiding full work on selection-only changes.
5. Store selection by stable paper identifier and derive the record from the frozen dataset.
6. Guard optional detail fields and normalise external JSTOR links to HTTPS.
7. Add an application error boundary with an in-place recovery action, so a component exception cannot become an unexplained page-level failure.
8. Add an automated repeated-selection stress test and inspect browser errors on both local and hosted builds.

## 4. Information architecture and nomenclature

### 4.1 Global navigation

| Current | Revised |
| --- | --- |
| Papers | Papers |
| Methods | Method comparison |
| Concepts | Keyword network |
| Publishing | Publication networks |
| Method | Methodology |

Remove the masthead phrase `Research release`.

### 4.2 Paper lenses

The section heading becomes `Lens`. Each control must be self-contained; lens subtitles are removed.

| Internal result | Revised control label |
| --- | --- |
| Selected BERTopic fit | BERTopic: 26 topics |
| Fixed BERTopic reduction | BERTopic: 9 topics |
| Core/reassigned/outlier provenance | BERTopic assignment status |
| Dominant LDA membership | LDA: 37 topics |
| Dominant-membership strength | LDA dominant-topic proportion |
| Local cross-model alignment | BERTopic-LDA neighbourhood agreement |

Remove:

- the model-ready-abstract footer;
- the fixed-position reminder;
- the map-corner `mapped / catalogue` count;
- the floating projection subtitle.

The selected-paper panel may retain concise variable names, values and the mixed-membership composition because these are observations rather than interface explanation.

### 4.3 Method comparison

Use the title `Topic-assignment overlap matrices`. The three controls become:

- `BERTopic x LDA`;
- `Abstract x full text`;
- `LDA topic diagnostics`.

Remove the editorial heading, explanatory paragraph, interaction instruction, largest-intersections list and repeated cohort caveat. Retain a compact scientific metric line and an accessible row/column selector.

The selected matrix cell is presented as a small observation table:

- row variable and topic;
- column variable and topic;
- `n`.

Do not use an arrow, infographic-scale numeral or conversational caption.

### 4.4 Keyword network

Use the explicit title `Keyword co-occurrence network` with the graph dimensions in the same compact heading line.

Replace `broad/refined` with:

- `6-community partition`;
- `21-community partition`.

Replace ambiguous interaction modes with:

- `One neighbourhood`;
- `Two neighbourhoods`;
- `Shortest path`.

Layout controls become:

- `Observed network`;
- `Communities separated`.

Label controls become `Automatic`, `All labels`, and `No labels`. Colour controls become `Community colours` and `Monochrome`.

Remove instructions about clicking, scrolling, zooming, dragging or resetting. Standard controls and pointer affordances provide these actions. When no keyword is selected, the details area is empty except for its explicit heading.

### 4.5 Publication networks

Use the explicit title `Keyword-journal network and aggregate publisher profiles`.

The two views become:

- `Keyword-journal network`;
- `Publisher profiles`.

Remove the editorial kicker, `Where concepts are published`, and the explanatory paragraph. Keep the publisher evidence-scope note only inside Methodology, where it is needed to prevent invalid inference.

## 5. Visual encoding

### 5.1 Plotting surfaces

- Paper and keyword maps use a neutral near-black plotting field.
- Surrounding navigation, tables and controls remain neutral off-white.
- Publication bipartite diagrams may use the same near-black plotting field for visual consistency.
- Method matrices remain light because they are tabular quantitative figures and benefit from print-like reading.

### 5.2 Colour system

- Replace muted topic and community colours with a deterministic, high-separation categorical palette designed for the dark plotting field.
- Require a minimum non-text contrast ratio against the plotting field and audit minimum pairwise OKLab distance.
- Give selected points a white outline and enlarged radius.
- Give neighbours/path endpoints an additional size or stroke encoding, so no interaction depends on colour alone.
- Use neutral light grey for unresolved or unavailable assignments.
- Continuous LDA proportion and cross-method agreement lenses use perceptually ordered dark-background ramps with explicit low/high endpoints.

There are more categories than can be perfectly distinguished for every form of colour-vision deficiency. Accessibility is therefore provided through topic filtering, labels, search, selection outlines and textual details in addition to colour.

## 6. Reference-functionality parity

| Reference capability | Atlas location | Acceptance condition |
| --- | --- | --- |
| Observed keyword layout | Keyword network | Reproduces stored coordinates and retained edges |
| Community-separated layout | Keyword network | Separates the active six- or 21-community partition while preserving within-community geometry |
| Community filtering | Keyword network | Filters by the active partition and reports exact node counts |
| One-hop selection | Keyword network | One selected node and its direct neighbours remain prominent |
| Two one-hop neighbourhoods | Keyword network | Two selected nodes and the union of their direct neighbours remain prominent |
| Shortest path | Keyword network | Uses unweighted shortest path with highest-degree tie-breaking, matching the reference algorithm |
| Node frequency and degree | Keyword details | Exact values shown for selected nodes |
| Strongest links | Keyword details | Edge-weight-ranked neighbours shown and selectable |
| Automatic/all/off labels | Both network figures | Label state cycles or is directly selectable |
| Community/monochrome colours | Keyword network | Both modes available; selected state remains distinguishable |
| Pan and wheel zoom | Both network figures | Pointer-centered zoom and drag pan work without page scrolling |
| Reset | Both network figures | Resets selection, filters and viewport |
| Export current view | Both network figures | Downloads a self-contained SVG with background, visible nodes, edges and labels |
| Collapsible controls | Both network workspaces | Plot can occupy the full viewport; controls remain keyboard-recoverable |
| Keyword-journal network | Publication networks | Displays the 50 highest-degree keywords and journals with retained edges |
| Ring layout | Publication networks | Keywords form the inner ring and journals the outer ring |
| Column layout | Publication networks | Keywords and journals form labelled opposing columns |
| Bipartite node selection | Publication networks | Direct associations and weights are highlighted; unrelated nodes and edges are muted |
| Network overview | Publication details | Exact total counts and highest-degree journals are shown compactly |

The atlas additionally retains paper search, six paper-analysis lenses, overlap matrices, LDA diagnostics and publisher profiles.

## 7. Implementation sequence

1. Add explicit error containment and optimise paper-map hit-testing.
2. Apply the revised global navigation and paper-lens nomenclature.
3. Remove every identified clutter element and audit the remaining visible prose.
4. Generate and audit the high-contrast categorical/ramp palette; rebuild release data deterministically.
5. Rebuild the keyword network around explicit layout, partition, mode, label, colour, reset and export state.
6. Replace the journal radial explorer with the top-50 keyword-journal network, retaining publisher profiles as a separate evidence view.
7. Simplify the overlap-matrix workspace and selected-cell presentation.
8. Update the concise standalone Methodology note and project documentation.
9. Run all automated and browser validation gates.
10. Commit, publish privately, and repeat the stress and parity checks against production.

## 8. Validation gates

### 8.1 Data and scientific integrity

- deterministic release builder succeeds;
- all existing 31 release assertions pass;
- new palette audit passes;
- map, LDA, paired, keyword, journal and publisher denominators remain unchanged;
- reference shortest-path tie-breaking is covered by unit tests;
- exported SVG contains exactly the currently visible graph subset and correct metadata.

### 8.2 Reliability and performance

- at least 200 rapid paper selections without an exception, navigation or page failure;
- pointer-move hit-testing does not scan/reproject all 2,057 papers;
- keyword and journal layout switching remains responsive;
- no browser console errors after stress selection, zoom, pan, filtering or tab changes;
- hosted data endpoints return successfully and worker logs contain no errors.

### 8.3 Interaction and accessibility

- every non-canvas action is keyboard reachable;
- canvas-only selection has equivalent search/list or selector access;
- selected, neighbour, path and filtered states are not conveyed by colour alone;
- buttons have explicit accessible names;
- focus remains visible on light and dark surfaces;
- reduced-motion preferences disable layout animation.

### 8.4 Responsive and visual QA

Test at minimum:

- 1440 x 900 desktop;
- 1024 x 768 tablet;
- 390 x 844 phone.

At each width, verify all four workspaces, open/closed controls, selected details, long labels, no horizontal page overflow and no plot obstruction. Inspect both dark network figures and the light quantitative matrix for contrast, density and legibility.

## 9. Release acceptance

The revision is complete only when:

- every requested deletion and rename is verified against the rendered interface;
- every reference capability in section 6 is present and tested;
- the repeated-selection failure is either reproduced and fixed or mitigated by an evidence-backed optimisation plus successful stress tests locally and in production;
- all scientific denominators and caveats remain accurate but are placed in Methodology rather than repeated as interface clutter;
- the exact validated source is the exact deployed private release.
