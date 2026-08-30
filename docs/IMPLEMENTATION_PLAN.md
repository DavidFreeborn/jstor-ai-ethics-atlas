# JSTOR AI Ethics Atlas — implementation plan

Status: implementation baseline, 30 August 2026

## 1. Product definition

Build a standalone, publication-quality research atlas for exploring the structure of a 7,076-record JSTOR corpus about AI ethics. The product is a working analytical surface, not a narrative microsite. Its primary task is to let a reader inspect papers and compare multiple defensible representations of the corpus without implying that any one method is the ground truth.

The finished atlas has four coordinated workspaces:

1. **Papers** — a fixed two-dimensional semantic terrain with switchable analytical lenses.
2. **Methods** — direct, cohort-controlled comparison of BERTopic, LDA and paired abstract/full-text results.
3. **Concepts** — the keyword co-occurrence network and its hierarchical Louvain communities.
4. **Publishing** — journal–keyword structure and the available publisher/community summaries.

The atlas must make sense without knowledge of the research team, previous prototypes, or internal project history. Documentation should be short and located where it is needed: a compact methodology drawer, restrained inline definitions and a standalone reproducibility note.

## 2. Non-negotiable scientific principles

- **Fixed geometry across paper lenses.** Lens changes alter colour, opacity, size and annotations; they never move papers.
- **Geometry is not clustering.** The 2D projection is chosen and validated as a semantic navigation surface independently of the clustering model used for a colour lens.
- **Visible denominators.** Every comparison reports the eligible, included and excluded paper counts.
- **No silent cohort substitution.** The complete catalogue, abstract model, full-text model, paired cohort and non-outlier subsets are distinct named cohorts.
- **Mixed membership remains mixed.** LDA is not presented only as a hard partition. Topic strength and dominance are encoded continuously where the available export permits it.
- **Outlier provenance is preserved.** BERTopic distinguishes core assignments, assignments created by outlier reduction and remaining outliers. The pre-reduction probability is never labelled final-topic confidence.
- **Metrics stay in scope.** UMAP-space separation is not presented as evidence of separation in the source embedding space. NPMI values from abstract and full-text reference corpora are not compared as equivalent.
- **Versioned evidence.** Public data files carry source fingerprints, cohort definitions, construction parameters and checksums.
- **No invented joins.** Publisher-to-paper and keyword-to-paper interactions are enabled only when a source export supports them. Aggregate publisher evidence is labelled aggregate.
- **Interpretive labels remain evidence-linked.** Topic labels are paired with their source terms and representative papers.

## 3. Source freeze and data contract

### 3.1 Canonical cohorts

| Cohort | Meaning | Current size |
| --- | --- | ---: |
| Catalogue | All harvested JSTOR records | 7,076 |
| Abstract model | Papers in the final abstract embedding index | 2,057 |
| Abstract LDA | Papers retained by the final LDA preprocessing | 2,052 |
| Full-text model | Papers in the final full-text BERTopic output | 1,789 |
| Paired eligible | Papers with both model-ready abstract and full text | 423 |
| Paired full-text assigned | Paired papers not left as full-text BERTopic outliers | 389 |

The apparent 423/389 discrepancy is represented as eligibility versus post-model assignment, not as competing counts.

### 3.2 Required paper record

Each map record is keyed by canonical `doc_id` and contains:

- immutable row index from the persisted embedding index;
- fixed normalized `x`, `y` map coordinates;
- title, journal and abstract preview where supplied;
- BERTopic topic, display label, assignment provenance and pre-reduction probability;
- LDA dominant topic, dominance and exported secondary memberships above the reporting floor;
- explicit flags for missing LDA metadata and remaining BERTopic outliers;
- search-normalized text generated at build time, never at runtime from untrusted markup.

### 3.3 Network and publishing records

- Keyword graph: 534 nodes and 4,474 weighted edges from the frozen public graph export.
- Keyword–journal bipartite graph: 534 keywords, 1,201 journals and 9,330 weighted edges.
- Community hierarchy: six top-level communities and 21 published subcommunities in the current graph snapshot.
- Publisher summaries: top publishers within each of the six top-level communities. These are aggregate percentages and are not used to imply paper-level publisher joins.

### 3.4 Reproducibility manifest

The build pipeline emits:

- SHA-256 for every raw and derived input;
- source URL or local archival source;
- construction timestamp and software versions;
- projection parameters and random seed;
- projection-quality metrics;
- row-count, uniqueness and join-coverage assertions;
- a list of scientifically material limitations.

## 4. Projection selection and validation

Evaluate the three persisted abstract embedding representations: SPECTER, SPECTER2 and S-SciBERT.

For each candidate:

1. verify shape, finite values, row order and norm distribution;
2. fit a two-dimensional cosine UMAP with fixed seed;
3. measure trustworthiness at neighbourhood sizes 15 and 30;
4. measure high-dimensional nearest-neighbour recall in 2D at 15 and 30;
5. measure rank correlation on a deterministic sample of pairwise distances;
6. repeat the selected parameter setting across seeds and align with orthogonal Procrustes to assess positional stability;
7. select the reference geometry based on semantic suitability and the complete quality profile, not topic-model scores.

The UI states that local proximity is meaningful and global axis direction, orientation and blank space are not substantive.

## 5. Interaction architecture

### 5.1 Global shell

- Slim masthead with title, cohort readout, search and methodology access.
- Four workspace tabs; no marketing hero and no permanent explanatory sidebar.
- Large central analytical surface.
- One restrained left control rail on wide screens; it becomes a drawer on small screens.
- A contextual detail panel appears only after selection.
- URL state encodes workspace, lens, topic/community, search and selected item.

### 5.2 Papers workspace

Default view: BERTopic on the fixed semantic terrain.

Core interactions:

- wheel/pinch zoom, drag pan, double-click reset;
- click/tap to select a paper; keyboard-accessible result list as an equivalent selection path;
- search by title, journal, stable ID and preview text;
- topic filter, outlier/provenance filter and LDA-dominance threshold;
- hover or focus tooltip with title and active-lens value;
- compact legend sorted by prevalence; long legends use a scroll region rather than floating bubbles;
- selected-paper panel showing identifiers, source preview, assignments and caveats.

Paper lenses:

- BERTopic 26-topic solution;
- BERTopic reduced 9-topic solution when the assignment export is present;
- BERTopic assignment provenance;
- LDA dominant topic;
- LDA topic intensity for a selected topic, using the exported membership floor transparently;
- LDA dominance/uncertainty;
- BERTopic–LDA agreement pattern;
- journal highlight;
- corpus coverage state when the complete manifest becomes available.

### 5.3 Methods workspace

- A cohort-aware BERTopic × LDA contingency matrix.
- Agreement metrics with plain-language interpretation and exact inclusion count.
- Click a matrix cell to show the corresponding papers on the fixed terrain.
- Paired abstract/full-text topic-flow matrix for the exact 423-paper cohort.
- Explicit controls for including/excluding outliers.
- Parameter and metric summary presented as a compact audit table, not a wall of prose.

### 5.4 Concepts workspace

- Fixed published keyword coordinates to preserve the source graph layout.
- Canvas rendering for nodes and edges; SVG/HTML only for active labels and accessible controls.
- Search, community filter, top-level/hierarchical switch, edge-strength control and reset.
- Selection highlights a one-hop neighbourhood; a two-node selection can show shortest path.
- Default edge threshold suppresses low-information visual clutter while the count readout states what is hidden.
- Community summary shows size, defining keywords and available publisher profile.

### 5.5 Publishing workspace

- Keyword–journal bipartite view defaults to the strongest edges and top entities; it never attempts to draw all 9,330 edges simultaneously.
- Journal search and selection reveal associated keywords and community composition.
- Publisher/community view presents the six aggregate profiles as small multiples with identical scales within each panel and clear percentage labels.
- The interface does not claim paper-level publisher filtering until a canonical mapping export is available.

## 6. Visual system

Direction: restrained scientific cartography.

- Warm off-white canvas, near-black text, cool slate structure lines and a limited chromatic research palette.
- Typography: compact sans-serif interface paired with a restrained serif for the atlas title and selected-paper titles.
- Thin borders, minimal shadows, small radii and no ornamental gradients.
- Colour is reserved for data. Controls remain neutral.
- Topic palettes are colour-blind-aware and repeat consistently across workspaces.
- Outliers and missing values use neutral grey, never an alarming red.
- Motion is limited to short opacity/transform transitions and disabled by `prefers-reduced-motion`.
- No floating explanatory bubbles, oversized pills, decorative cards or permanently expanded help text.

## 7. Technical architecture

- Vinext/React/TypeScript Sites application.
- Static, versioned JSON assets; no database is required for the frozen research release.
- Canvas 2D rendering for the 2,057-paper terrain and network views. At this scale it is simpler and fully performant; a WebGL layer would add maintenance cost without analytical benefit.
- A single shared selection/filter reducer coordinates workspaces.
- Responsive controls use installed accessible interface primitives.
- Derived data is generated by one deterministic Python build script.
- No client dependency is added unless it replaces substantial bespoke logic.

## 8. Implementation sequence and gates

### Phase A — evidence and plan freeze

- [x] Inventory authoritative and superseded source artifacts.
- [x] Reconcile final abstract/full-text/paired results.
- [x] Define cohort and probability semantics.
- [x] Identify publisher and keyword evidence boundaries.
- [ ] Generate source manifest and projection audit.

Gate: every public claim maps to an input field or documented aggregate result.

### Phase B — first coherent product slice

- [ ] Apply the final visual tokens.
- [ ] Render the real 2,057-paper semantic terrain.
- [ ] Add BERTopic lens, search, pan/zoom and selection.
- [ ] Add minimal masthead, lens rail and paper detail panel.
- [ ] Hand off the first meaningful preview.

Gate: a reader can recognize the atlas, find a paper, change a lens and inspect a real record.

### Phase C — complete analytical workspaces

- [ ] Add full LDA lens family.
- [ ] Add methods matrix and paired comparison.
- [ ] Add keyword network and hierarchy controls.
- [ ] Add journal bipartite and publisher/community views.
- [ ] Add shareable URL state, downloads and methodology drawer.

Gate: every enabled lens has real data, a clear denominator and an accessible legend.

### Phase D — verification and refinement

- [ ] Unit-test joins, counts, search, filters, colour mapping and comparison metrics.
- [ ] Cross-check selected-paper values against source CSVs.
- [ ] Test keyboard, pointer and touch interaction paths.
- [ ] Test desktop, tablet and mobile layouts.
- [ ] Audit contrast, focus visibility, reduced motion and screen-reader names.
- [ ] Profile load, interaction latency, canvas frame time and asset sizes.
- [ ] Perform visual review at multiple viewports and iterate on density and hierarchy.
- [ ] Run production build and verify all routes and metadata.

Gate: no known data-integrity error, blocking accessibility defect, console error or material layout failure.

### Phase E — release

- [ ] Freeze checksums and release notes.
- [ ] Publish the validated private release.
- [ ] Verify the deployed experience and retain one canonical URL.

## 9. Test matrix

### Data integrity

- embedding rows equal index rows;
- canonical IDs are unique;
- BERTopic assignments cover all embedding rows;
- LDA join count is exactly reported and unmatched IDs are enumerated;
- topic counts and outlier counts reproduce source summaries;
- paired abstract and full-text IDs are identical before outlier exclusion;
- 423 eligible minus 34 full-text outliers reproduces 389 assigned;
- network node and edge counts reproduce the source manifest;
- all derived numerical values are finite and within documented ranges.

### Interaction

- lens switching preserves coordinates and selection;
- filters compose deterministically and reset cleanly;
- search handles punctuation, case, diacritics and stable JSTOR URLs;
- zoom remains centred under pointer and constrained to safe bounds;
- keyboard navigation reaches tabs, controls, search results and details;
- URL restoration recreates the same analytical state.

### Visual and responsive

- 1440×900, 1280×800, 1024×768, 768×1024, 390×844;
- no text overlap in legends, tooltips, matrices or publisher labels;
- no clipped controls at 200% browser zoom;
- selected, focused and filtered states remain distinguishable without colour alone;
- data canvas remains the visual focus in the first viewport.

### Performance targets

- compressed initial static payload under 2 MB excluding optional deferred network data;
- first useful render under 2.5 seconds on a typical broadband laptop;
- lens/filter response under 100 ms after data load;
- pan/zoom at or near 60 fps on a current laptop and usable on a mid-range phone;
- deferred workspaces load only on first use.

## 10. Plan review and incorporated revisions

The initial concept was deliberately narrowed after scientific and UX review:

- A single “everything map” was rejected because publisher, journal and keyword networks contain different entity types and geometries.
- A union abstract/full-text terrain was deferred because source length and availability would confound its geometry without a preregistered weighting study.
- The LDA lens was revised from categorical colour alone to dominance and topic-intensity modes.
- The probability encoding was revised to assignment provenance after confirming the stored probability predates outlier reduction.
- A live paper-level publisher filter was removed from the first release because the available publisher evidence is aggregate; the interface will not fabricate the missing join.
- Three-dimensional projection was omitted because no demonstrated gain justifies its interaction and interpretive cost.
- WebGL was replaced by Canvas 2D for this corpus size, reducing complexity while comfortably meeting performance targets.
- Permanent explanatory cards were replaced with terse contextual notes and an on-demand methodology drawer.

These revisions are requirements, not optional polish.

