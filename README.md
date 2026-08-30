# JSTOR AI Ethics Atlas

An interactive research atlas for exploring the complete AI ethics literature catalogue through semantic, topic, publication, keyword and authorship lenses.

The public interface is a single paper atlas. Every lens uses one fixed, title-based SPECTER/UMAP geometry for all 7,076 records:

- **Topic models** — 26-topic BERTopic, the fixed 9-topic reduction, and 37-topic LDA.
- **Neighbourhood agreement** — local BERTopic–LDA agreement within abstract-semantic neighbourhoods.
- **Publication metadata** — selectable publishers and journals.
- **Controlled keywords** — up to 30 terms, with segmented marks for multi-membership.
- **Coauthorship** — direct shared-author reach and on-selection connections.

The method-comparison and aggregate network workspaces remain in the source tree and their frozen data artifacts remain available, but their navigation is intentionally suppressed in this focused release.

## Evidence contract

Every lens carries its own denominator. The catalogue has 7,076 records; BERTopic covers 2,057 abstracts; LDA covers 2,052 records; journal metadata covers 2,015; the controlled keyword vocabulary covers 6,023; creator metadata covers 5,265. Missing values are never imputed.

Map position is held constant across lenses. Publisher, creator and keyphrase fields are direct paper-level catalogue metadata. Journal values are joined by canonical JSTOR ID from the LDA export. Relationship edges represent exact shared metadata and appear only after selection.

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
npm run build
python scripts/validate_release.py
python scripts/audit_palette.py
```

The browser-ready research release is in `public/data`. Local source inputs are intentionally excluded from version control. When those inputs are present in `data/source`, rebuild and re-audit the release with:

```bash
python scripts/build_atlas_data.py
python scripts/audit_projection.py
python scripts/audit_palette.py
python scripts/validate_release.py
```

The focused full-catalogue revision is documented in [`docs/PAPERS_ATLAS_IMPLEMENTATION_PLAN.md`](docs/PAPERS_ATLAS_IMPLEMENTATION_PLAN.md).
