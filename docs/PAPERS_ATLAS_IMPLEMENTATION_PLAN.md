# Papers atlas revision: implementation plan

## Objective

Produce a single, uncluttered paper atlas for the complete 7,076-record catalogue. One fixed semantic geometry must support abstract topic models, publication metadata, controlled keywords and authorship relations without implying that every field covers every record.

## Evidence decisions

1. **Common geometry.** Embed the title of every record with the same cached SPECTER model, then project all 7,076 embeddings together with a seeded UMAP. Titles are the only semantic text field available for every record, so this is preferable to mixing abstract, full-text and title representations. The interface will describe the result as title-based and interpret only local proximity.
2. **Fixed positions.** Every lens uses the common title geometry. Topic-model records therefore stay in the same position as publication and relationship records.
3. **Explicit applicability.** Unavailable values remain null. A lens dims non-applicable records and reports its numerator and denominator; it never imputes a journal, topic, author or keyword.
4. **Paper-level metadata.** Publisher, creator and keyphrase fields come directly from the 7,076-record catalogue export. Journal comes from the LDA export; 2,015 of its 2,052 rows contain a journal string and are therefore subset-scoped.
5. **Controlled keywords.** Paper keyphrases are normalized by whitespace and case, then intersected with the frozen 534-node keyword vocabulary. This keeps the map consistent with the validated keyword network while retaining exact paper membership.
6. **Neighbourhood agreement.** Replace the ambiguous cross-tab concentration score with a local partition-comparison measure: for each jointly assigned non-outlier abstract, take its 30 nearest neighbours in the original abstract SPECTER space and calculate the Jaccard overlap between neighbours sharing its BERTopic assignment and neighbours sharing its LDA assignment. Null is used when the comparison is ineligible or the union is empty. Map colour uses the empirical score rank to avoid compressing most observations into one dark interval; paper details retain the raw value.
7. **Relationships.** Publisher, journal and keyword edges express exact shared metadata. Coauthorship edges express at least one exact shared creator string. Edges appear only after a paper is selected. To protect legibility, all related points are highlighted but no more than the 120 semantically nearest relations are drawn; the interface reports both totals.

## Interface specification

### Shell

- Render only the Papers workspace. Keep the other workspace components and data artifacts in the repository, but remove their tabs, mobile selector and route activation.
- Retain the atlas title, search and a compact methodology control.
- Use a dark neutral map field with high-chroma marks, a light control rail and a restrained details panel.

### Lenses

1. **All papers** — all 7,076 records in a neutral high-contrast mark.
2. **BERTopic — 26 topics** — abstract-model subset; categorical topic colours and topic filtering.
3. **BERTopic — 9 topics** — fixed topic-reduction ladder endpoint; categorical topic colours and filtering.
4. **LDA — 37 topics** — dominant topic only for map navigation; no dominance-proportion lens or detail.
5. **Neighbourhood agreement** — strong multi-stop sequential colour ramp over the eligible abstract comparison subset.
6. **Publisher** — searchable categorical value selection, ten most frequent publishers selected initially, up to thirty active values.
7. **Journal** — searchable categorical value selection, ten most frequent observed journals selected initially, up to thirty active values.
8. **Keywords** — searchable selection across all 534 controlled keywords, ten most frequent catalogue keywords initially, up to thirty active values. Single matches use the keyword colour; multiple matches use equal coloured sectors. At overview scale the same mark also reads ordinally through increased radius.
9. **Coauthorship** — a sequential overview of direct shared-author reach. Selection reveals the exact shared-author neighbours.

### Categorical selection

- Publisher, journal and keyword controls share one compact pattern: search, selected count, clear/default actions, selected values first and frequency-aligned counts.
- Values not selected are dimmed, not recoloured as an artificial residual category.
- Publisher and journal papers have one categorical value. Keyword papers can have several; sector marks preserve multi-membership without blending colours into an uninterpretable new colour.
- Stable colours are assigned from one audited 30-colour palette by selection slot. Removing a value does not recolour remaining values during the session.

### Selection and connections

- Clicking or searching selects one paper, opens its details and makes the active lens relational when applicable.
- Unrelated papers dim; the selected paper receives a white double outline; related papers retain colour and receive a subtle outline.
- Temporary edges appear only for Publisher, Journal, Keywords and Coauthorship.
- Keyword edges are weighted by the number of selected controlled keywords shared with the focal paper. Details list the exact shared terms.
- A selected paper can be cleared without resetting zoom, lens or value filters.

### Paper details

Show title, year, document type, stable JSTOR link, journal, publisher, creators and controlled keywords. Show only the active analytical value where useful. Remove BERTopic status, BERTopic pre-reduction probability, LDA dominant-topic proportion and the LDA composition chart.

### Methodology skeleton

Use four short statements only: common title geometry; lens-specific coverage; topic/keyword provenance; exact relationships and the edge-display cap. Do not refer to contributors or other projects.

## Data pipeline

1. Stream the compressed catalogue export without loading full text into memory.
2. Export a compact local catalogue metadata artifact containing ID, title, year, document type, publisher, creators, controlled keywords and full-text availability.
3. Encode titles in deterministic batches with `allenai/specter`; persist the 7,076 × 768 float32 matrix and an ID index.
4. Fit seeded UMAP on the common matrix. Audit finite values, trustworthiness at 15 and 30 neighbours, neighbour recall, distance-rank correlation and seed sensitivity, then persist the audited coordinates as the frozen geometry.
5. Join abstract BERTopic, reduction-ladder and LDA records by canonical JSTOR ID.
6. Compute local neighbourhood agreement from persisted abstract SPECTER embeddings.
7. Compute per-value frequencies and direct shared-author reach. Do not ship global relationship edge lists; derive focal relations in the browser from compact inverted indices.
8. Write compact `map.json`, update the manifest, and retain legacy suppressed-workspace artifacts unchanged.

## Performance and accessibility

- Use one DPR-capped canvas and a spatial pick grid; 7,076 points must remain interactive during pan and zoom.
- Precompute browser-side inverted indices once with memoization.
- Draw connection edges before points and cap visible edges at 120.
- Increase mark radius progressively with zoom; retain a generous hit radius independent of visual radius.
- Search title, journal, publisher, creator, keyword and record ID.
- Preserve keyboard-operable controls, labelled inputs, focus states, text equivalents for colours and a live relationship summary.
- Test desktop, tablet and narrow mobile layouts; controls become a sheet on narrow screens.

## Verification gates

1. **Source integrity:** 7,076 unique IDs; all titles and publishers present; exact documented coverage for journal, creator and controlled keywords.
2. **Projection:** finite coordinates, deterministic ID order, declared parameters, trustworthiness ≥ 0.85 and seed-neighbour overlap recorded.
3. **Joins:** 2,057 BERTopic records, 2,057 reduction records, 2,052 LDA joins and 2,015 non-empty journal values, with no duplicated IDs or inferred missing metadata.
4. **Metric:** neighbourhood-agreement values are bounded [0,1], reproduce from source assignments and exclude ineligible records.
5. **Relationships:** sampled publisher, journal, keyword and author neighbour sets reproduce direct metadata equality exactly.
6. **Rendering:** selected values, multi-keyword sectors, relation dimming, edge cap, reset, pan, zoom, search and details behave correctly.
7. **Quality:** lint, TypeScript, production build, release validation, palette audit, browser console, responsive screenshots and production smoke test all pass.

## Iteration criteria

The release is ready only when the full catalogue is visible in the default lens; topic lenses visibly suppress their non-applicable records; the agreement ramp has perceptible low/mid/high separation; no ordinary interaction produces an error; details expose the requested metadata; and the interface remains visually quiet with no explanatory prose outside the compact methodology dialog.
