# JSTOR AI Ethics Atlas

An interactive research atlas for exploring the complete AI ethics literature catalogue through semantic, topic, publication, keyword and authorship lenses.

**Live atlas:** [GitHub Pages](https://davidfreeborn.github.io/jstor-ai-ethics-atlas/) · [Sites release](https://jstor-ai-ethics-atlas.dafidius.chatgpt.site)

The public interface has a paper atlas and a correlation-matrix workspace. **Positions** offers titles (7,076 records), frozen abstracts (2,057), and **Abstracts ∪ full text** (union, 3,725). Each has independently fitted 2D and 3D UMAP projections. Positions remain fixed across lenses within each representation and dimension:

- **Topic models** — 26-topic BERTopic, the fixed 9-topic reduction, and 37-topic LDA.
- **Neighbourhood agreement** — local BERTopic–LDA agreement within abstract-semantic neighbourhoods.
- **Publication metadata** — selectable publishers and journals.
- **Controlled keywords** — up to 30 terms, with segmented marks for multi-membership.
- **Coauthorship** — direct shared-author reach and on-selection connections.
- **Correlation matrices** — pairwise lens association and detailed hot–cold residual matrices.

The method-comparison and aggregate network workspaces remain in the source tree and their frozen data artifacts remain available, but their navigation is intentionally suppressed in this focused release.

## Evidence contract

Every lens carries its own denominator. The catalogue has 7,076 records; BERTopic covers 2,057 abstracts; the released 37-topic LDA covers 2,052 abstracts; journal metadata covers 3,784 records; the controlled keyword vocabulary covers 6,023; creator metadata covers 5,265. Missing values are never imputed.

Publisher, creator and keyphrase fields are direct paper-level catalogue metadata. Of the journal values, 2,015 are direct canonical-ID joins and 1,769 are propagated through an unambiguous exact JSTOR journal identifier; two ambiguous identifiers are excluded. Shared-author links use exact names, not disambiguated people. Relation edges are not drawn.

## Exploring the map

The opening view centres on the main body of papers. Reset returns there; Fit all includes every outlier. In 3D, drag to rotate and Shift-drag (or two fingers) to pan. The wheel and +/− controls zoom. Keyboard: arrows navigate, Shift-arrows pan in 3D, Home resets, Shift-Home fits all.

Changing Positions retains selections and restores each map's camera. Papers without abstract embeddings are omitted from the abstract map, not assigned estimated positions. Lens counts, facet frequencies, search and shared-author reach use the active map; selections spanning both cohorts show how many selected papers are mapped. Correlation matrices retain their independently defined catalogue-based denominators.

Select a topic, click a keyword/publication name, or use Select area. The same paper IDs remain highlighted when changing lenses or dimensions. Use **× Deselect** in the bottom-left toolbar, the × beside the selection, or Escape on the map to clear the selection and paper details without changing the lens, palette or camera. Facet checkboxes control the palette; “Select papers in coloured values” selects their union. Clicking a paper under a publication, keyword or authorship lens selects its metadata neighbours. Hollow selected marks lack the current lens data.

The 3D projection uses the original 768-dimensional title embeddings, not artificial depth. Its source hashes, parameters and three-seed quality audit are recorded in [`docs/PROJECTION_3D_AUDIT.json`](docs/PROJECTION_3D_AUDIT.json). Projection distances and apparent boundaries are approximate; 2D and 3D are distinct exploratory layouts, not additional model assignments.

Abstract positions use the frozen S-SciBERT embeddings supplied to BERTopic, not the shortened preview text. Regenerate with `scripts/build_abstract_positions.py`; source hashes and three-seed 2D/3D audits are in [`docs/ABSTRACT_POSITIONS_AUDIT.json`](docs/ABSTRACT_POSITIONS_AUDIT.json). No topic labels enter the projection. Switching positions changes the text source, encoder and cohort; it is not an isolated experiment on text length. Upstream encoder token limits still apply.

Combined-text positions use the released 2,057 original abstracts plus 1,668 additional full-text records, including 578 books and 827 reports. The 423 records with both sources use their abstract only. All are newly encoded with the same pinned SPECTER model; this is not a splice of existing maps. Full-text records must carry an English language tag and pass minimum text checks. That metadata does not guarantee the language of every passage. The 43 raw abstracts outside the frozen release remain excluded rather than silently changing its eligibility rules.

Long full texts contribute up to eight evenly spaced 256-word windows. Each window is encoded as title + passage; normalised window embeddings are averaged into one normalised document vector. Sampled passages and original abstracts are split into token windows rather than silently clipped; subchunks are weighted by body-token count within each passage. This bounded full-text extension of [an abstract-trained encoder](https://github.com/allenai/specter) is exploratory, not exhaustive book encoding or a new topic model. The [union audit](docs/UNION_POSITIONS_AUDIT.json) records coverage, source hashes, encoder revision, three-seed projection quality, four/eight-window sensitivity and the 423-record paired-source check. No licensed source texts are shipped to either site.

Pairwise association is reported as bias-corrected Cramér's V. Detailed cells are Pearson residuals computed from full contingency-table margins. Keyword memberships are exploded as multi-response observations and are descriptive rather than inferential.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

```bash
npm run lint
npx tsc --noEmit
npm run test:network
npm run test:association
npm run test:map
npm run build
npm run test:worker
npm run build:pages
npx playwright install chromium
npm run test:browser
python scripts/validate_release.py
python scripts/audit_palette.py
```

The browser-ready research release is in `public/data`. Local source inputs are intentionally excluded from version control. When those inputs are present in `data/source`, rebuild and re-audit the release with:

```bash
python scripts/build_atlas_data.py
python scripts/audit_projection.py
python scripts/build_3d_projection.py
python scripts/build_abstract_positions.py
python scripts/build_union_source.py
python scripts/build_union_embeddings.py
python scripts/build_union_positions.py
python scripts/audit_palette.py
python scripts/validate_release.py
```

The focused full-catalogue revision is documented in [`docs/PAPERS_ATLAS_IMPLEMENTATION_PLAN.md`](docs/PAPERS_ATLAS_IMPLEMENTATION_PLAN.md).

The interaction/3D revision has a [plan](docs/INTERACTION_3D_IMPLEMENTATION_PLAN.md) and [verification record](docs/INTERACTION_3D_AUDIT.md). Both hosts bundle identical font binaries; licences are in `public/licenses`. Browser tests can target a running build with `ATLAS_URL`, use Firefox with `ATLAS_BROWSER=firefox`, and store evidence in `work/audit`. The default test command starts and stops its own production preview.

The combined-text revision has an [implementation plan](docs/UNION_POSITIONS_PLAN.md) and [verification record](docs/UNION_POSITIONS_VALIDATION.md).
