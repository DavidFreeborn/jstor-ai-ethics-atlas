# Combined-text positions: verification

7 September 2026. This extends the position selector; it does not replace an
existing geometry or release a new topic model.

## Coverage and representation

Canonical-ID reconciliation yields 3,725 records: the released 2,057 abstracts
and 1,668 additional full-text records. The latter include 578 books, 827 reports,
167 chapters, 83 articles and 13 documents. The 423 paired records use their
abstract in the released map, with their full text reserved for sensitivity
analysis. The 43 raw abstracts outside the frozen cohort remain excluded. This
is 52.64% of the catalogue, not a reconstruction of a previously reported union
with a different denominator or filtering policy.

All records use the same pinned SPECTER encoder. Original abstract bodies are
split without truncation. Full texts contribute at most eight stratified
256-word passages. Body-token weighting prevents a short token remainder from
contributing as much as a complete chunk; sampled passages have equal weight.
All 3,725 vectors are finite, 768-dimensional and unit normalised. Three records
(an abstract, a multi-chunk abstract and a full text) were independently
reconstructed at batch size 1 and four CPU threads; maximum absolute vector
differences were below 8 × 10⁻⁸. A short-tail weighting boundary test also passes.

The [machine-readable audit](UNION_POSITIONS_AUDIT.json) records exact data,
model-revision and pipeline hashes. Source text and private checkpoints are not
included in either web release. Existing title/abstract coordinates, catalogue
metadata and analytical assignments remain unchanged.

## Projection and sensitivity

Independent, label-free 2D and 3D UMAP fits use 30 neighbours, cosine distance,
minimum distance 0.08 and seed 42. Seeds 43 and 44 provide sensitivity checks.

| Diagnostic | 2D | 3D |
| --- | ---: | ---: |
| Seed-42 trustworthiness, 15 neighbours | 0.8914 | 0.9194 |
| Exact source-neighbour recall, 15 neighbours | 0.2403 | 0.2934 |
| Trustworthiness across three seeds | 0.8886–0.8929 | 0.9175–0.9194 |
| Layout-neighbour overlap with seed 42, other seeds | 0.5858–0.5936 | 0.7338–0.7567 |

Trustworthiness and exact neighbour retention are different measures. Most
exact source-space neighbours do not survive projection; fine local structure
and visual gaps must not be interpreted as measured semantic boundaries.

For 1,510 eight-window full-text records, nested four-versus-eight sampling has
median vector cosine similarity 0.9915 but only 0.6845 overlap among 30 nearest
neighbours. Replacing the 423 paired abstracts with sampled full text gives
median cosine similarity 0.9303 and neighbour overlap 0.4253. This paired cohort
contains chapters and articles, not books. The median book contributes about
1.95% of its words; the corresponding report median is 24.87%. These checks do
not establish exhaustive text coverage or validate book representations.

SPECTER was trained on titles and abstracts, making this full-text extension
exploratory. Text source, document type and content are confounded. The
same-source neighbour fraction (0.6122 versus a random-mixing baseline of
0.5053) is descriptive, not a causal estimate of a source effect.

## Interface and regression checks

- The third option reports its audited count and lazy-loads one 362,290-byte
  payload containing aligned 2D/3D coordinates and source flags. SHA-256 and
  schema/ID checks precede adoption. Failed or corrupt downloads leave the
  title map usable and support retry.
- Exact cohort counts are checked: BERTopic 2,057; LDA 2,051; neighbourhood
  agreement 1,797; journals 2,090; keywords 3,286; authors 3,707. Topic coverage
  is not imputed. Matrices continue to use their existing analytical cohorts.
- Tests independently recompute every facet count and all 3,725 shared-author
  counts. Adapting a position cohort must not mutate the catalogue.
- Browser checks exercise all three source modes in 2D/3D, independent camera
  restoration, persistent canonical-ID selections, temporarily absent papers,
  full-text provenance, corrupt-asset recovery, desktop/narrow layouts, and
  touch interaction. The methodology panel remains scrollable within a
  320 × 568 viewport.
- Existing stress cases remain: 40,000 camera updates; 3,200 rapid pointer moves;
  800 mixed-unit wheel events; 120 paper clicks; 3D orbit/pan/pinch; palette and
  lens changes; 20 workspace remounts; idle redraw and backing-store checks.
  No browser exceptions occurred in the completed Chromium and Firefox runs.
- Lint, TypeScript, source-protocol tests, release/hash validation, palette,
  network and association tests, both production builds and the Worker HTTP
  smoke test pass. The deployment workflow repeats the Chromium regression
  suite before GitHub Pages publication.

Screenshots and structured browser evidence are retained locally in
`work/audit`; the README lists reproducible test commands. These are scoped
checks on the tested browsers and machine, not a guarantee against every
possible device-specific fault.
