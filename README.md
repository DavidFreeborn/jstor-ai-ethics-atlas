# JSTOR AI Ethics Atlas

An interactive research atlas for exploring semantic topics, mixed-membership models, concept communities, and publishing structures in an AI ethics literature corpus.

The atlas is organized as four coordinated workspaces:

- **Papers** — a fixed SPECTER/UMAP geometry with BERTopic, reduced-topic, assignment-provenance, LDA, LDA-focus, and cross-method lenses.
- **Methods** — BERTopic–LDA and abstract–full-text contingency matrices, plus LDA size, dominance, term, and partial stability diagnostics.
- **Concepts** — a keyword co-occurrence network at six-community and 21-community resolutions.
- **Publishing** — journal–keyword associations and separately scoped aggregate publisher profiles.

## Evidence contract

Every view carries its own denominator. The catalogue has 7,076 records; the reference paper map contains 2,057 model-ready English abstracts; LDA covers 2,052 abstracts; the abstract/full-text paired cohort contains 423 papers. The interface never treats these as interchangeable.

Map position is held constant across paper lenses. BERTopic assignments retain core/reassigned/outlier provenance. LDA remains a mixed-membership model: dominant-topic colour is supplemented by reported memberships at or above 0.10. Publisher summaries are not presented as a paper-level join.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

```bash
npm run lint
npx tsc --noEmit
npm run build
python scripts/validate_release.py
```

The browser-ready research release is in `public/data`. Local source inputs are intentionally excluded from version control. When those inputs are present in `data/source`, rebuild and re-audit the release with:

```bash
python scripts/build_atlas_data.py
python scripts/audit_projection.py
python scripts/validate_release.py
```

The detailed implementation and review gates are documented in [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
