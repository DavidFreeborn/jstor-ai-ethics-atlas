# JSTOR AI Ethics Atlas

An interactive research atlas for exploring the complete AI ethics literature catalogue through semantic, topic, publication, keyword and authorship lenses.

**Live atlas:** [GitHub Pages](https://davidfreeborn.github.io/jstor-ai-ethics-atlas/) · [Sites release](https://jstor-ai-ethics-atlas.dafidius.chatgpt.site)

The public interface has a paper atlas and a correlation-matrix workspace. Every map lens uses one fixed, title-based SPECTER/UMAP geometry for all 7,076 records:

- **Topic models** — 26-topic BERTopic, the fixed 9-topic reduction, and 37-topic LDA.
- **Neighbourhood agreement** — local BERTopic–LDA agreement within abstract-semantic neighbourhoods.
- **Publication metadata** — selectable publishers and journals.
- **Controlled keywords** — up to 30 terms, with segmented marks for multi-membership.
- **Coauthorship** — direct shared-author reach and on-selection connections.
- **Correlation matrices** — pairwise lens association and detailed hot–cold residual matrices.

The method-comparison and aggregate network workspaces remain in the source tree and their frozen data artifacts remain available, but their navigation is intentionally suppressed in this focused release.

## Evidence contract

Every lens carries its own denominator. The catalogue has 7,076 records; BERTopic covers 2,057 abstracts; the released 37-topic LDA covers 2,052 abstracts; journal metadata covers 3,784 records; the controlled keyword vocabulary covers 6,023; creator metadata covers 5,265. Missing values are never imputed.

Map position is held constant across lenses. Publisher, creator and keyphrase fields are direct paper-level catalogue metadata. Of the journal values, 2,015 are direct canonical-ID joins and 1,769 are propagated through an unambiguous exact JSTOR journal identifier; two ambiguous identifiers are excluded. Selection rings mark exact shared metadata; relation edges are not drawn.

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
npm run build
npm run build:pages
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
