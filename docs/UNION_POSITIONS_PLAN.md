# Combined-text positions

## Scope and evidence contract

Add one Positions option, **Abstracts + full text (N papers)**, alongside the
unchanged title and frozen-abstract layouts. The union is an exploratory geometry,
not a new topic-model release. Use canonical catalogue IDs, one point per record,
and a single encoder for both input types. Never splice independent projections.

Use the released abstract cohort when its original text can be recovered. Add
English-tagged catalogue records with usable full text. Prefer the abstract
when both are available; this avoids double-counting and makes the source rule
explicit. Count exclusions and coverage independently of earlier correspondence.

## Implementation and review gates

1. Stream the original compressed export. Verify unique IDs and recover original
   abstracts, not previews. Audit language, nonempty/usable text, document type,
   overlap and exclusions. Keep texts local; publish only positions and provenance.
2. Encode title + text using a pinned local SPECTER model. For full text, sample
   eight deterministic, evenly spaced body windows and average their normalised
   embeddings, then normalise each document. Cap contribution per document.
   Audit token truncation, four-versus-eight-window sensitivity and paired-source
   sensitivity. This is a documented full-text extension of an abstract-trained
   encoder, not a validated full-text topic model.
3. Fit independent direct 2D/3D UMAP projections, cosine metric, 30 neighbours,
   min_dist 0.08, seed 42. Audit seeds 43/44, trustworthiness and neighbourhood
   retention. No topic labels or hand-adjusted gaps enter the geometry.
4. Generalise the existing position loader and cohort adapter. Validate every
   payload before changing the map. Keep camera restoration, stable selections,
   facet controls, 2D/3D, mobile controls, missing-data marks and fallback/retry.
   Publish the verified count in a small release descriptor and concise methods.
5. Test ID alignment, source counts, eligibility, finite coordinates, duplicates,
   unchanged old artifacts, active-cohort facet counts and author reach. Exercise
   all position transitions, selected groups, malformed loads, rapid interaction,
   responsive layouts and camera restoration in Chromium and Firefox.
6. Run lint, types, scientific release validation, existing regression suites,
   production builds and Worker smoke test. Review visual evidence. Publish the
   tested source to both existing hosts and verify the live versions.

## Review conclusions

- Eight-window sampling is finite coverage of full text, not whole-book reading.
  Expose that limitation in methods; retain source/window diagnostics in the audit.
- A text-source/type confound remains even with a shared encoder. Paired-record
  sensitivity quantifies part of it; it does not remove it.
- Topic coverage and correlation-matrix denominators must not expand merely
  because more positions exist. Existing assignments must never be imputed.
- Existing layouts and their source artifacts remain byte-for-byte unchanged.
- Counts must be generated from validated inputs, never typed from an email.
- Weight token subchunks by their body length within each passage, so a short
  remainder cannot equal a full chunk. Give each sampled passage equal weight.
