'use client';

import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="rounded-none text-muted-foreground" />}><CircleHelp />Method</DialogTrigger>
      <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] max-w-2xl overflow-y-auto rounded-none p-6 sm:max-w-2xl">
        <DialogHeader><p className="data-kicker">Research note</p><DialogTitle className="font-heading text-2xl">How to read this atlas</DialogTitle><DialogDescription>The atlas coordinates several analytical results while keeping their assumptions and eligible cohorts visible.</DialogDescription></DialogHeader>
        <div className="grid gap-6 text-[13px] leading-6 sm:grid-cols-2">
          <section><h3 className="font-medium">Paper geometry</h3><p className="mt-1 text-muted-foreground">Each point is one of 2,057 English-language abstracts. Positions come from a two-dimensional UMAP projection of SPECTER document embeddings. The geometry is fixed when the analytical lens changes, so colour—not location—carries the comparison.</p></section>
          <section><h3 className="font-medium">Topic models</h3><p className="mt-1 text-muted-foreground">BERTopic supplies a discrete semantic assignment and a documented outlier-reduction provenance. LDA is mixed-membership: the map can show its dominant topic, but paper details retain secondary memberships above the reported threshold.</p></section>
          <section><h3 className="font-medium">Method comparisons</h3><p className="mt-1 text-muted-foreground">Contingency matrices use explicit intersection cohorts. ARI and AMI summarize partition agreement; they do not rank one model as correct. Abstract/full-text comparison is limited to papers with both text forms and non-outlier assignments.</p></section>
          <section><h3 className="font-medium">Concept network</h3><p className="mt-1 text-muted-foreground">Keywords are connected when they co-occur in a paper. Node size reflects retained frequency; colour reflects either six broad Louvain communities or a 21-community refinement. Network positions reproduce the published analytical release.</p></section>
          <section><h3 className="font-medium">Publishing structures</h3><p className="mt-1 text-muted-foreground">Journal–keyword associations are directly represented in the source graph. Publisher profiles are aggregate within-community percentages and are deliberately separated from paper-level views because no validated paper-level publisher join is available.</p></section>
          <section><h3 className="font-medium">Interpretive limits</h3><p className="mt-1 text-muted-foreground">Distances are local approximations, topic labels are compact descriptors rather than definitions, and coverage differs by document type and text availability. The catalogue contains 7,076 records; every view reports the denominator it actually uses.</p></section>
        </div>
        <div className="border-t border-border pt-4 text-[10px] leading-4 text-muted-foreground">Release 2026-08-30 · Data artifacts are deterministically generated with cohort assertions, source hashes and a release manifest. No result is silently extrapolated across unavailable records.</div>
      </DialogContent>
    </Dialog>
  );
}
