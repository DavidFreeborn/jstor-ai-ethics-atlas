'use client';

import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import unionRelease from '@/lib/union-release.json';

export function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label="Methodology" className="rounded-none text-muted-foreground" />}><CircleHelp /><span className="max-sm:hidden">Methodology</span></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto rounded-none p-6 sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-heading text-2xl">Methodology</DialogTitle><DialogDescription className="sr-only">Definitions, cohorts and interpretive limits.</DialogDescription></DialogHeader>
        <div className="space-y-4 text-[13px] leading-5">
          <section><h3 className="font-medium">Positions</h3><p className="mt-1 text-muted-foreground">Titles: 7,076 SPECTER records. Abstracts: 2,057 frozen S-SciBERT records. Abstracts + full text: {unionRelease.count.toLocaleString()} newly encoded SPECTER records; abstracts preferred, otherwise up to eight sampled full-text passages. Each has seeded 2D/3D UMAP layouts. Sources and cohorts differ; gaps are not semantic distances.</p></section>
          <section><h3 className="font-medium">Coverage</h3><p className="mt-1 text-muted-foreground">BERTopic covers 2,057 abstracts; the released 37-topic LDA covers 2,052. Journals cover 3,784 records, including 1,769 titles propagated through unambiguous exact JSTOR journal identifiers. Keywords cover 6,023; authors cover 5,265.</p></section>
          <section><h3 className="font-medium">Analytical fields</h3><p className="mt-1 text-muted-foreground">Topic assignments come from abstract models. Keywords match the 534-term network vocabulary. Neighbourhood agreement compares BERTopic and LDA within 30 abstract-semantic neighbours; colour is rank-scaled.</p></section>
          <section><h3 className="font-medium">Selection</h3><p className="mt-1 text-muted-foreground">Groups retain IDs across positions, lenses and dimensions; records without the chosen text representation are omitted. Counts and shared-author reach use the active map. Names are not disambiguated. Hollow selected points lack lens data.</p></section>
          <section><h3 className="font-medium">Matrices</h3><p className="mt-1 text-muted-foreground">Pairwise association uses bias-corrected Cramér&apos;s V; detailed cells show Pearson residuals. Keyword memberships are multi-response and descriptive.</p></section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
