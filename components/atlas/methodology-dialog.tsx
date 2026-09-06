'use client';

import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label="Methodology" className="rounded-none text-muted-foreground" />}><CircleHelp /><span className="max-sm:hidden">Methodology</span></DialogTrigger>
      <DialogContent className="max-w-lg rounded-none p-6 sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-heading text-2xl">Methodology</DialogTitle><DialogDescription className="sr-only">Definitions, cohorts and interpretive limits.</DialogDescription></DialogHeader>
        <div className="space-y-4 text-[13px] leading-5">
          <section><h3 className="font-medium">Geometry</h3><p className="mt-1 text-muted-foreground">Titles: 7,076 SPECTER embeddings. Abstracts: 2,057 S-SciBERT embeddings used by BERTopic. Each has independent seeded 2D/3D UMAP positions, fixed across lenses. Text, encoder and coverage differ; gaps are not semantic distances.</p></section>
          <section><h3 className="font-medium">Coverage</h3><p className="mt-1 text-muted-foreground">BERTopic covers 2,057 abstracts; the released 37-topic LDA covers 2,052. Journals cover 3,784 records, including 1,769 titles propagated through unambiguous exact JSTOR journal identifiers. Keywords cover 6,023; authors cover 5,265.</p></section>
          <section><h3 className="font-medium">Analytical fields</h3><p className="mt-1 text-muted-foreground">Topic assignments come from abstract models. Keywords match the 534-term network vocabulary. Neighbourhood agreement compares BERTopic and LDA within 30 abstract-semantic neighbours; colour is rank-scaled.</p></section>
          <section><h3 className="font-medium">Selection</h3><p className="mt-1 text-muted-foreground">Groups retain paper IDs across positions, lenses and dimensions. Abstract positions omit papers without embeddings. Lens counts and shared-author reach use the active map; author names are not disambiguated. Hollow selected points lack lens data.</p></section>
          <section><h3 className="font-medium">Matrices</h3><p className="mt-1 text-muted-foreground">Pairwise association uses bias-corrected Cramér&apos;s V; detailed cells show Pearson residuals. Keyword memberships are multi-response and descriptive.</p></section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
