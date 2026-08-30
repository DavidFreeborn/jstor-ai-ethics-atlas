'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';

import { PaperMap } from '@/components/atlas/paper-map';
import { DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { MapData, PaperLens, PaperPoint, TopicSummary } from '@/lib/atlas-types';

const LENSES: { id: PaperLens; label: string }[] = [
  { id: 'bertopic', label: 'BERTopic: 26 topics' },
  { id: 'bertopic_reduced', label: 'BERTopic: 9 topics' },
  { id: 'provenance', label: 'BERTopic assignment status' },
  { id: 'lda', label: 'LDA: 37 topics' },
  { id: 'lda_dominance', label: 'LDA dominant-topic proportion' },
  { id: 'alignment', label: 'BERTopic-LDA neighbourhood agreement' },
];

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function activeTopics(data: MapData, lens: PaperLens): TopicSummary[] {
  if (lens === 'bertopic_reduced') return data.topics.bertopic_reduced;
  if (lens === 'lda') return data.topics.lda;
  return data.topics.bertopic;
}

function lensValue(paper: PaperPoint, lens: PaperLens, topics: TopicSummary[]) {
  const lookup = new Map(topics.map((topic) => [topic.id, topic.label]));
  if (lens === 'bertopic') return lookup.get(paper.bertopic) ?? 'Unresolved';
  if (lens === 'bertopic_reduced') return lookup.get(paper.bertopic_reduced) ?? 'Unresolved';
  if (lens === 'provenance') return paper.provenance === 'core' ? 'Core model assignment' : paper.provenance === 'reassigned' ? 'Assigned during outlier reduction' : 'Unresolved outlier';
  if (lens === 'lda') return paper.lda ? lookup.get(paper.lda.topic) ?? `Topic ${paper.lda.topic}` : 'No LDA assignment';
  if (lens === 'lda_dominance') return paper.lda ? `${Math.round(paper.lda.dominance * 100)}% dominant-topic share` : 'No LDA assignment';
  return paper.alignment === null ? 'Not in comparison cohort' : `${Math.round(paper.alignment * 100)}% local alignment`;
}

function LensControls({ data, lens, topicFilter, onLens, onTopic }: { data: MapData; lens: PaperLens; topicFilter: number | null; onLens: (lens: PaperLens) => void; onTopic: (topic: number | null) => void }) {
  const topics = activeTopics(data, lens);
  const counts = [...topics].sort((a, b) => b.count - a.count);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="data-kicker">Lens</p>
        <div className="mt-2 space-y-0.5">
          {LENSES.map((item) => (
            <button key={item.id} className={`group w-full border-l-2 px-2 py-2 text-left text-[12px] font-medium leading-4 transition-colors ${lens === item.id ? 'border-primary bg-background text-foreground' : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'}`} onClick={() => onLens(item.id)}>{item.label}</button>
          ))}
        </div>
      </div>
      {lens === 'bertopic' || lens === 'bertopic_reduced' || lens === 'lda' ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <div className="flex items-center justify-between"><p className="data-kicker">Topics</p>{topicFilter !== null ? <button className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => onTopic(null)}>Show all</button> : null}</div>
          <ScrollArea className="mt-2 min-h-0 flex-1 pr-2">
            <div className="space-y-px pb-3">
              {counts.map((topic) => <button key={topic.id} className={`grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 px-1 py-1.5 text-left text-[11px] ${topicFilter === topic.id ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`} onClick={() => onTopic(topicFilter === topic.id ? null : topic.id)}><span className="size-2" style={{ backgroundColor: topic.colour }} /><span className="truncate">{topic.label}</span><span className="font-mono text-[9px] tabular-nums opacity-70">{topic.count}</span></button>)}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="px-4 py-4 text-xs leading-relaxed text-muted-foreground">
          {lens === 'provenance' ? <ul className="space-y-2"><li><span className="legend-dot bg-[#315A7D]" />Core model assignment</li><li><span className="legend-dot bg-[#C18A38]" />Assigned during outlier reduction</li><li><span className="legend-dot bg-[#91969A]" />Unresolved outlier</li></ul> : <div className="space-y-2"><div className={`h-2 w-full ${lens === 'alignment' ? 'alignment-ramp' : 'dominance-ramp'}`} /><div className="flex justify-between font-mono text-[9px] uppercase tracking-wide"><span>lower</span><span>higher</span></div></div>}
        </div>
      )}
    </div>
  );
}

export function PapersWorkspace({ data }: { data: MapData | null }) {
  const [lens, setLens] = useState<PaperLens>('bertopic');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<number | null>(null);
  const topics = data ? activeTopics(data, lens) : [];
  const selected = useMemo(() => data?.points.find((paper) => paper.id === selectedId) ?? null, [data, selectedId]);
  const results = useMemo(() => {
    if (!data || !query.trim()) return [];
    const needle = normalize(query);
    return data.points.map((paper) => ({ paper, score: normalize(paper.title).startsWith(needle) ? 0 : normalize(paper.title).includes(needle) ? 1 : normalize(paper.journal).includes(needle) ? 2 : normalize(paper.id).includes(needle) ? 3 : 9 })).filter((entry) => entry.score < 9).sort((a, b) => a.score - b.score || a.paper.title.localeCompare(b.paper.title)).slice(0, 8).map((entry) => entry.paper);
  }, [data, query]);
  const changeLens = (next: PaperLens) => { setLens(next); setTopicFilter(null); };

  if (!data) return <DataLoading />;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-[176px_minmax(0,1fr)] max-sm:grid-cols-1">
      <aside className="flex min-h-0 flex-col border-r border-border bg-[var(--panel-background)] max-sm:hidden"><LensControls data={data} lens={lens} topicFilter={topicFilter} onLens={changeLens} onTopic={setTopicFilter} /></aside>
      <section className="relative min-h-0 overflow-hidden" aria-label="Paper atlas">
        <PaperMap data={data} lens={lens} selected={selected} onSelect={(paper) => setSelectedId(paper?.id ?? null)} topicFilter={topicFilter} />
        <div className="absolute left-3 top-3 flex gap-2">
          <Sheet><SheetTrigger render={<Button size="sm" variant="outline" className="hidden rounded-none bg-background/92 max-sm:inline-flex" />}><SlidersHorizontal />Lens</SheetTrigger><SheetContent side="left" className="w-[290px]"><SheetHeader><SheetTitle>Lens</SheetTitle><SheetDescription className="sr-only">Select the analytical colouring applied to the paper map.</SheetDescription></SheetHeader><LensControls data={data} lens={lens} topicFilter={topicFilter} onLens={changeLens} onTopic={setTopicFilter} /></SheetContent></Sheet>
        </div>
        <div className="absolute right-3 top-3 z-20 w-[min(330px,calc(100%-88px))]">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search papers" placeholder="Search title or journal" className="h-9 rounded-none border-border bg-background/94 pl-8 pr-8 shadow-none" />{query ? <Button variant="ghost" size="icon-sm" className="absolute right-1 top-0.5" aria-label="Clear search" onClick={() => setQuery('')}><X /></Button> : null}</div>
          {query ? <div className="mt-1 border border-border bg-background shadow-lg">{results.length ? <ul className="py-1" aria-label="Search results">{results.map((paper) => <li key={paper.id}><button className="w-full border-l-2 border-transparent px-3 py-2 text-left hover:border-primary hover:bg-muted/60 focus-visible:border-primary focus-visible:bg-muted/60 focus-visible:outline-none" onClick={() => { setSelectedId(paper.id); setQuery(''); }}><span className="block truncate text-sm font-medium">{paper.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{paper.journal || paper.id}</span></button></li>)}</ul> : <p className="px-3 py-4 text-sm text-muted-foreground">No matching papers</p>}</div> : null}
        </div>
        {selected ? <aside className="absolute bottom-4 right-4 top-14 z-20 flex w-[min(360px,calc(100%-32px))] flex-col border border-border bg-background/97 shadow-xl backdrop-blur-sm"><div className="flex items-start justify-between border-b border-border px-4 py-3"><div className="min-w-0 pr-3"><p className="data-kicker">Selected paper</p><h2 className="mt-1.5 font-heading text-xl font-medium leading-tight">{selected.title || 'Untitled record'}</h2></div><Button variant="ghost" size="icon-sm" aria-label="Close paper details" onClick={() => setSelectedId(null)}><X /></Button></div><ScrollArea className="min-h-0 flex-1"><div className="space-y-5 p-4"><div><p className="text-xs text-muted-foreground">{selected.journal || 'Journal unavailable'}</p><a href={selected.id.replace(/^http:\/\//, 'https://')} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-[10px] text-primary underline decoration-border underline-offset-2 hover:decoration-primary">{selected.id.replace(/^http:\/\//, 'https://')}</a></div><div className="border-y border-border py-3"><p className="data-kicker">Active lens</p><p className="mt-1 text-sm font-medium">{lensValue(selected, lens, topics)}</p></div>{selected.preview ? <p className="text-[13px] leading-6 text-foreground/82">{selected.preview}…</p> : null}<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><div><dt className="text-muted-foreground">BERTopic</dt><dd className="mt-0.5 font-medium">{data.topics.bertopic.find((topic) => topic.id === selected.bertopic)?.label ?? 'Unresolved'}</dd></div><div><dt className="text-muted-foreground">BERTopic status</dt><dd className="mt-0.5 font-medium capitalize">{selected.provenance}</dd></div><div><dt className="text-muted-foreground">LDA</dt><dd className="mt-0.5 font-medium">{selected.lda ? data.topics.lda.find((topic) => topic.id === selected.lda?.topic)?.label ?? `Topic ${selected.lda.topic}` : 'Unavailable'}</dd></div><div><dt className="text-muted-foreground">Dominant-topic proportion</dt><dd className="mt-0.5 font-mono font-medium">{selected.lda ? `${Math.round(selected.lda.dominance * 100)}%` : '—'}</dd></div></dl>{selected.lda ? <section className="border-t border-border pt-4"><div className="flex items-center justify-between"><p className="data-kicker">LDA composition</p><span className="font-mono text-[9px] text-muted-foreground">memberships ≥10%</span></div><ol className="mt-3 space-y-2">{(selected.lda.memberships ?? []).map((membership) => { const topic = data.topics.lda.find((item) => item.id === membership.topic); return <li key={membership.topic}><div className="flex items-end justify-between gap-3 text-[10px]"><span className="truncate">{topic?.label ?? `Topic ${membership.topic}`}</span><span className="font-mono">{Math.round(membership.value * 100)}%</span></div><div className="mt-1 h-1 bg-muted"><div className="h-full" style={{ width: `${membership.value * 100}%`, backgroundColor: topic?.colour }} /></div></li>; })}</ol></section> : null}</div></ScrollArea></aside> : null}
      </section>
    </div>
  );
}
