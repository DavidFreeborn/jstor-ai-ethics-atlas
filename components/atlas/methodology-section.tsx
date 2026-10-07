'use client';

import unionRelease from '@/lib/union-release.json';
import fulltextRelease from '@/lib/fulltext-release.json';

export function MethodologySection() {
  return (
    <details className="tool-methodology">
      <summary>Model and methodology</summary>
        <div>
          <section>
            <h3 className="font-medium">Positions</h3>
            <p className="mt-1 text-muted-foreground">
              Titles: 7,076 SPECTER records. Abstracts: 2,057 frozen S-SciBERT
              records. Full text: {fulltextRelease.count.toLocaleString()}{' '}
              SPECTER records. Abstracts ∪ full text:{' '}
              {unionRelease.count.toLocaleString()} SPECTER records, preferring
              abstracts. Full texts use up to eight sampled passages. Each has
              seeded 2D/3D UMAP layouts; gaps are not semantic distances.
            </p>
          </section>
          <section>
            <h3 className="font-medium">Coverage</h3>
            <p className="mt-1 text-muted-foreground">
              BERTopic covers 2,057 abstracts; the released 37-topic LDA covers
              2,052. Journals cover 3,784 records, including 1,769 titles
              propagated through unambiguous exact JSTOR journal identifiers.
              Keywords cover 6,023; authors cover 5,265.
            </p>
          </section>
          <section>
            <h3 className="font-medium">Analytical fields</h3>
            <p className="mt-1 text-muted-foreground">
              Topic assignments come from abstract models. Keywords match the
              534-term network vocabulary. Neighbourhood agreement compares
              BERTopic and LDA within 30 abstract-semantic neighbours; colour is
              rank-scaled.
            </p>
          </section>
          <section>
            <h3 className="font-medium">Filtering and selection</h3>
            <p className="mt-1 text-muted-foreground">
              Text availability: 2,100 nonempty abstracts, 2,091 usable full
              texts; 423 have both (∩). Filters hide records without moving
              points. Groups retain IDs across filters, positions and lenses.
              Counts and shared-author reach use shown papers; names are not
              disambiguated. Hollow selected points lack lens data.
            </p>
          </section>
          <section>
            <h3 className="font-medium">Matrices</h3>
            <p className="mt-1 text-muted-foreground">
              Pairwise association uses bias-corrected Cramér&apos;s V; detailed
              cells show Pearson residuals. Keyword memberships are
              multi-response and descriptive.
            </p>
          </section>
        </div>
    </details>
  );
}
