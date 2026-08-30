'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Library, Search } from 'lucide-react';

import { DataError, DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BipartiteNode, NetworkData, PublishingData } from '@/lib/atlas-types';

type PublishingMode = 'journals' | 'publishers';

const PROFILE_COLOURS = ['#355C7D', '#4F7D61', '#C18A38', '#855D6E', '#3F7C85', '#766357'];

function JournalSpokes({ journal, associations, keywordLookup }: { journal: BipartiteNode; associations: Array<{ keyword: string; weight: number }>; keywordLookup: Map<string, BipartiteNode> }) {
  const width = 700; const height = 440; const cx = width / 2; const cy = height / 2; const max = Math.max(...associations.map((item) => item.weight), 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-[350px] w-full" aria-label={`Strongest keyword associations for ${journal.label}`}>
      <title>Strongest keyword associations for {journal.label}</title>
      {associations.map((item, index) => { const angle = (index / associations.length) * Math.PI * 2 - Math.PI / 2; const radius = 145 + (index % 2) * 34; const x = cx + Math.cos(angle) * radius; const y = cy + Math.sin(angle) * radius; const node = keywordLookup.get(item.keyword); return <g key={item.keyword}><line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(52,65,72,.2)" strokeWidth={0.8 + (item.weight / max) * 2.2} /><circle cx={x} cy={y} r={5 + Math.sqrt(node?.degree ?? 1) * 0.35} fill={node?.topColour ?? '#567E91'} opacity=".86" /><text x={x} y={y + (y < cy ? -13 : 20)} textAnchor="middle" className="fill-foreground text-[10px] capitalize">{item.keyword.length > 24 ? `${item.keyword.slice(0, 22)}…` : item.keyword}</text><text x={(cx + x) / 2} y={(cy + y) / 2 - 4} textAnchor="middle" className="fill-muted-foreground font-mono text-[8px]">{item.weight}</text></g>; })}
      <circle cx={cx} cy={cy} r="48" fill="#f7f4ed" stroke="#23475f" strokeWidth="1.4" />
      <foreignObject x={cx - 108} y={cy - 35} width="216" height="70"><div className="flex h-full items-center justify-center px-4 text-center font-heading text-[15px] leading-tight text-foreground">{journal.label}</div></foreignObject>
    </svg>
  );
}

export function PublishingWorkspace() {
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [publishing, setPublishing] = useState<PublishingData | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<PublishingMode>('journals');
  const [selectedJournal, setSelectedJournal] = useState<string>('');
  const [query, setQuery] = useState('');
  useEffect(() => { let active = true; Promise.all([fetch('/data/network.json'), fetch('/data/publishing.json')]).then(async ([networkResponse, publishingResponse]) => { if (!networkResponse.ok || !publishingResponse.ok) throw new Error('Publishing evidence could not be retrieved.'); return [await networkResponse.json() as NetworkData, await publishingResponse.json() as PublishingData] as const; }).then(([networkData, publishingData]) => { if (!active) return; setNetwork(networkData); setPublishing(publishingData); const first = networkData.bipartite.nodes.filter((node) => node.kind === 'journal').sort((a, b) => b.degree - a.degree)[0]; setSelectedJournal(first?.id ?? ''); }).catch((cause: Error) => active && setError(cause.message)); return () => { active = false; }; }, []);
  const journals = useMemo(() => network ? network.bipartite.nodes.filter((node) => node.kind === 'journal').sort((a, b) => b.degree - a.degree) : [], [network]);
  const filteredJournals = useMemo(() => query.trim() ? journals.filter((node) => node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 40) : journals.slice(0, 40), [journals, query]);
  if (error) return <DataError message={error} />;
  if (!network || !publishing) return <DataLoading label="Loading publishing structure" />;
  const journal = journals.find((node) => node.id === selectedJournal) ?? journals[0];
  const keywordLookup = new Map(network.bipartite.nodes.filter((node) => node.kind === 'keyword').map((node) => [node.id, node]));
  const associations = journal ? network.bipartite.edges.filter((edge) => edge.target === journal.id || edge.source === journal.id).map((edge) => ({ keyword: edge.target === journal.id ? edge.source : edge.target, weight: edge.weight })).sort((a, b) => b.weight - a.weight).slice(0, 12) : [];
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="publishing-title">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-b border-border px-6 py-4 max-sm:grid-cols-1 max-sm:px-4">
        <div><p className="data-kicker">Publishing structure</p><h2 id="publishing-title" className="mt-1 font-heading text-2xl font-medium">Where concepts are published</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Journal associations are directly linked to corpus keywords. Publisher profiles are aggregate community summaries and are presented separately to preserve their evidential scope.</p></div>
        <div className="flex items-center gap-1 self-center border border-border p-0.5"><Button size="sm" variant={mode === 'journals' ? 'default' : 'ghost'} className="rounded-none" onClick={() => setMode('journals')}><Library />Journals</Button><Button size="sm" variant={mode === 'publishers' ? 'default' : 'ghost'} className="rounded-none" onClick={() => setMode('publishers')}><Building2 />Publishers</Button></div>
      </div>
      {mode === 'journals' ? <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_260px] max-lg:grid-cols-[250px_minmax(0,1fr)] max-sm:grid-cols-1">
        <aside className="min-h-0 overflow-auto border-r border-border bg-[var(--panel-background)] p-4 max-sm:max-h-52 max-sm:border-b max-sm:border-r-0"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find a journal" placeholder="Find a journal" className="h-9 rounded-none bg-background pl-8" /></div><p className="data-kicker mt-4">Journals by network degree</p><div className="mt-2">{filteredJournals.map((item) => <button key={item.id} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-l-2 px-2 py-2 text-left text-xs ${journal?.id === item.id ? 'border-primary bg-background text-foreground' : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'}`} onClick={() => setSelectedJournal(item.id)}><span className="truncate">{item.label}</span><span className="font-mono text-[9px]">{item.degree}</span></button>)}</div></aside>
        <div className="min-h-[390px] overflow-hidden p-4">{journal ? <JournalSpokes journal={journal} associations={associations} keywordLookup={keywordLookup} /> : null}</div>
        <aside className="min-h-0 overflow-auto border-l border-border bg-[var(--panel-background)] p-5 max-lg:hidden"><p className="data-kicker">Selected journal</p><h3 className="mt-2 font-heading text-xl leading-tight">{journal?.label}</h3><p className="mt-2 text-xs text-muted-foreground">{journal?.degree} keyword associations in the retained network</p><p className="data-kicker mt-6 border-t border-border pt-5">Strongest associations</p><ol className="mt-3 space-y-2">{associations.map((item) => <li key={item.keyword} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs"><span className="truncate capitalize">{item.keyword}</span><span className="font-mono text-[10px]">{item.weight}</span></li>)}</ol></aside>
      </div> : <div className="min-h-0 flex-1 overflow-auto p-6 max-sm:p-4"><div className="mx-auto grid max-w-6xl grid-cols-3 gap-px border border-border bg-border max-lg:grid-cols-2 max-sm:grid-cols-1">{publishing.publisher_profiles.map((profile, profileIndex) => { const maxShare = Math.max(...profile.publishers.map((publisher) => publisher.share)); return <article key={profile.community} className="bg-background p-5"><div className="flex items-start justify-between gap-3"><div><p className="data-kicker">Community {profile.community}</p><h3 className="mt-1 font-heading text-xl capitalize">{profile.name}</h3></div><span className="font-mono text-xs text-muted-foreground">n={profile.papers.toLocaleString()}</span></div><ol className="mt-5 space-y-3">{profile.publishers.map((publisher) => <li key={publisher.name}><div className="flex items-end justify-between gap-3 text-[11px]"><span className="truncate">{publisher.name}</span><span className="font-mono">{publisher.share.toFixed(1)}%</span></div><div className="mt-1 h-1.5 bg-muted"><div className="h-full" style={{ width: `${(publisher.share / maxShare) * 100}%`, backgroundColor: PROFILE_COLOURS[profileIndex] }} /></div></li>)}</ol></article>; })}</div><p className="mx-auto mt-4 max-w-6xl text-[10px] leading-4 text-muted-foreground">{publishing.publisher_scope} Percentages are within-community shares; displayed publishers are the five largest reported for each community.</p></div>}
    </section>
  );
}
