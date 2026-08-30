'use client';

import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label="Methodology" className="rounded-none text-muted-foreground" />}><CircleHelp /><span className="max-sm:hidden">Methodology</span></DialogTrigger>
      <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] max-w-2xl overflow-y-auto rounded-none p-6 sm:max-w-2xl">
        <DialogHeader><DialogTitle className="font-heading text-2xl">Methodology</DialogTitle><DialogDescription>Definitions, cohorts and interpretive limits.</DialogDescription></DialogHeader>
        <div className="grid gap-6 text-[13px] leading-6 sm:grid-cols-2">
          <section><h3 className="font-medium">Coverage</h3><p className="mt-1 text-muted-foreground">The catalogue contains 7,076 records. The paper map uses the 2,057 records in the persisted release with a usable abstract, document index, embedding and BERTopic assignment. Records without that model input are not imputed.</p></section>
          <section><h3 className="font-medium">Paper geometry</h3><p className="mt-1 text-muted-foreground">Each point is a SPECTER document embedding projected to two dimensions with UMAP. Coordinates remain fixed across lenses. Local proximity is more interpretable than global distance.</p></section>
          <section><h3 className="font-medium">Topic models</h3><p className="mt-1 text-muted-foreground">BERTopic supplies a discrete assignment plus core, reassigned or unresolved status. LDA is mixed-membership; the map shows the dominant membership while paper details retain memberships of at least 10%.</p></section>
          <section><h3 className="font-medium">Overlap matrices</h3><p className="mt-1 text-muted-foreground">BERTopic-LDA comparison uses 1,810 jointly assigned abstracts. Abstract-full-text comparison starts with 423 paired records and uses 383 non-outlier pairs for ARI and AMI.</p></section>
          <section><h3 className="font-medium">Networks</h3><p className="mt-1 text-muted-foreground">Keyword edges are weighted paper-level co-occurrences. Node size represents frequency. The six- and 21-community partitions are alternative Louvain resolutions. Shortest paths are unweighted with degree-based tie-breaking.</p></section>
          <section><h3 className="font-medium">Publication evidence</h3><p className="mt-1 text-muted-foreground">Keyword-journal edges are direct corpus associations. Publisher profiles are aggregate community percentages; no validated paper-level publisher join is available, so publisher values are not attached to individual papers or journals.</p></section>
        </div>
        <div className="border-t border-border pt-4 text-[10px] leading-4 text-muted-foreground">Topic descriptors are navigation labels, not definitions. Colours supplement search, filters, labels and selection outlines; they are not the only carrier of meaning.</div>
      </DialogContent>
    </Dialog>
  );
}
