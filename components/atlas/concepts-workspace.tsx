'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, Search, X } from 'lucide-react';

import { DataError, DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CommunitySummary, KeywordNode, NetworkData, NetworkEdge } from '@/lib/atlas-types';

type CommunityLevel = 'top' | 'split';

function NetworkCanvas({ nodes, edges, level, community, selected, onSelect }: { nodes: KeywordNode[]; edges: NetworkEdge[]; level: CommunityLevel; community: string | null; selected: KeywordNode | null; onSelect: (node: KeywordNode | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const visibleNodes = useMemo(() => community === null ? nodes : nodes.filter((node) => String(level === 'top' ? node.topCommunity : node.splitCommunity) === community), [community, level, nodes]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const bounds = useMemo(() => ({ minX: Math.min(...nodes.map((node) => node.x)), maxX: Math.max(...nodes.map((node) => node.x)), minY: Math.min(...nodes.map((node) => node.y)), maxY: Math.max(...nodes.map((node) => node.y)) }), [nodes]);
  const weightCut = useMemo(() => { const weights = edges.map((edge) => edge.weight).sort((a, b) => a - b); return weights[Math.floor(weights.length * 0.63)] ?? 1; }, [edges]);

  useEffect(() => { const node = wrapRef.current; if (!node) return; const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(300, Math.floor(entry.contentRect.height)) })); observer.observe(node); return () => observer.disconnect(); }, []);

  const basePoint = useCallback((node: KeywordNode) => {
    const pad = 38;
    const x = pad + ((node.x - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * (size.width - pad * 2);
    const y = pad + ((node.y - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * (size.height - pad * 2);
    return { x, y };
  }, [bounds, size]);
  const screenPoint = useCallback((node: KeywordNode) => { const p = basePoint(node); return { x: (p.x - size.width / 2) * view.scale + size.width / 2 + view.x, y: (p.y - size.height / 2) * view.scale + size.height / 2 + view.y }; }, [basePoint, size, view]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ratio = window.devicePixelRatio || 1; canvas.width = size.width * ratio; canvas.height = size.height * ratio; canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.scale(ratio, ratio); ctx.clearRect(0, 0, size.width, size.height);
    const selectedNeighbours = selected ? new Set(edges.flatMap((edge) => edge.source === selected.id ? [edge.target] : edge.target === selected.id ? [edge.source] : [])) : null;
    ctx.lineCap = 'round';
    edges.forEach((edge) => {
      if (edge.weight < weightCut || !visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return;
      const source = nodeById.get(edge.source); const target = nodeById.get(edge.target); if (!source || !target) return;
      const a = screenPoint(source); const b = screenPoint(target);
      const connected = !selected || edge.source === selected.id || edge.target === selected.id;
      ctx.strokeStyle = selected ? (connected ? 'rgba(34,68,87,.42)' : 'rgba(63,71,77,.035)') : 'rgba(63,71,77,.075)';
      ctx.lineWidth = Math.min(2.1, 0.35 + Math.sqrt(edge.weight / weightCut) * 0.25);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    visibleNodes.forEach((node) => {
      const p = screenPoint(node); const chosen = selected?.id === node.id; const neighbour = selectedNeighbours?.has(node.id); const muted = Boolean(selected && !chosen && !neighbour);
      const radius = Math.max(1.4, Math.min(8, 1.1 + Math.sqrt(node.frequency) * 0.22)) * Math.sqrt(view.scale);
      ctx.globalAlpha = muted ? 0.13 : 0.9; ctx.fillStyle = level === 'top' ? node.topColour : node.splitColour; ctx.beginPath(); ctx.arc(p.x, p.y, chosen ? radius + 3 : radius, 0, Math.PI * 2); ctx.fill();
      if (chosen) { ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    ctx.globalAlpha = 1;
  }, [edges, level, nodeById, screenPoint, selected, size, view.scale, visibleIds, visibleNodes, weightCut]);

  function findNode(event: React.PointerEvent<HTMLCanvasElement>) { const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; let best: KeywordNode | null = null; let distance = 13; for (const node of visibleNodes) { const p = screenPoint(node); const d = Math.hypot(x - p.x, y - p.y); if (d < distance) { best = node; distance = d; } } return best; }
  return <div ref={wrapRef} className="h-full min-h-[380px] w-full"><canvas ref={canvasRef} className="block h-full w-full touch-none cursor-grab active:cursor-grabbing" aria-label="Interactive keyword co-occurrence network" onDoubleClick={() => setView({ scale: 1, x: 0, y: 0 })} onWheel={(event) => { event.preventDefault(); const factor = event.deltaY < 0 ? 1.12 : 0.89; setView((current) => ({ ...current, scale: Math.min(5, Math.max(0.65, current.scale * factor)) })); }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; }} onPointerMove={(event) => { const hit = findNode(event); event.currentTarget.title = hit ? `${hit.label} · ${hit.frequency} papers` : ''; if (drag.current) setView((current) => ({ ...current, x: drag.current!.vx + event.clientX - drag.current!.x, y: drag.current!.vy + event.clientY - drag.current!.y })); }} onPointerUp={(event) => { if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 4) onSelect(findNode(event)); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} /></div>;
}

export function ConceptsWorkspace() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<CommunityLevel>('top');
  const [community, setCommunity] = useState<string | null>(null);
  const [selected, setSelected] = useState<KeywordNode | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { let active = true; fetch('/data/network.json').then((response) => { if (!response.ok) throw new Error(`Network data returned ${response.status}`); return response.json() as Promise<NetworkData>; }).then((payload) => active && setData(payload)).catch((cause: Error) => active && setError(cause.message)); return () => { active = false; }; }, []);
  const changeLevel = (next: CommunityLevel) => { setLevel(next); setCommunity(null); setSelected(null); };
  const results = useMemo(() => data && query.trim() ? data.full.nodes.filter((node) => node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.frequency - a.frequency).slice(0, 8) : [], [data, query]);
  if (error) return <DataError message={error} />;
  if (!data) return <DataLoading label="Loading concept network" />;
  const communities: CommunitySummary[] = level === 'top' ? data.meta.topCommunities : data.meta.splitCommunities;
  const neighbours = selected ? data.full.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).sort((a, b) => b.weight - a.weight).slice(0, 12).map((edge) => ({ label: edge.source === selected.id ? edge.target : edge.source, weight: edge.weight })) : [];
  return (
    <section className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)_300px] max-lg:grid-cols-[210px_minmax(0,1fr)] max-sm:grid-cols-1" aria-labelledby="concepts-title">
      <aside className="flex min-h-0 flex-col border-r border-border bg-[var(--panel-background)] max-sm:hidden">
        <div className="border-b border-border p-4"><p className="data-kicker">Community resolution</p><div className="mt-2 grid grid-cols-2 border border-border p-0.5"><Button size="sm" variant={level === 'top' ? 'default' : 'ghost'} className="rounded-none" onClick={() => changeLevel('top')}>6 broad</Button><Button size="sm" variant={level === 'split' ? 'default' : 'ghost'} className="rounded-none" onClick={() => changeLevel('split')}>21 refined</Button></div></div>
        <ScrollArea className="min-h-0 flex-1"><div className="p-3"><button className={`w-full px-2 py-2 text-left text-xs ${community === null ? 'bg-background font-medium' : 'text-muted-foreground hover:bg-background/60'}`} onClick={() => setCommunity(null)}>All communities</button>{communities.map((item) => <button key={item.id} className={`grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 text-left text-[11px] ${community === String(item.id) ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`} onClick={() => setCommunity(String(item.id))}><span className="size-2" style={{ backgroundColor: item.colour }} /><span className="truncate capitalize">{item.name}</span><span className="font-mono text-[9px]">{item.size}</span></button>)}</div></ScrollArea>
        <p className="border-t border-border p-4 text-[10px] leading-4 text-muted-foreground">{data.method.edge_definition} Displayed positions and edge weights reproduce the published network release.</p>
      </aside>
      <div className="relative min-h-0 overflow-hidden border-r border-border max-lg:border-r-0">
        <NetworkCanvas nodes={data.full.nodes} edges={data.full.edges} level={level} community={community} selected={selected} onSelect={setSelected} />
        <div className="absolute left-4 top-4 max-w-[300px] border border-border bg-background/90 px-3 py-2"><p className="data-kicker">Keyword co-occurrence</p><h2 id="concepts-title" className="mt-1 font-heading text-xl">Concept structure</h2><p className="mt-1 text-[10px] text-muted-foreground">{data.meta.counts.keywords} keywords · {data.meta.counts.keywordEdges.toLocaleString()} associations</p></div>
        <div className="absolute right-4 top-4 z-10 w-[min(280px,calc(100%-32px))] max-sm:left-4 max-sm:right-4 max-sm:top-28 max-sm:w-auto"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a concept" aria-label="Find a concept" className="h-9 rounded-none bg-background/94 pl-8 pr-8" />{query ? <Button variant="ghost" size="icon-sm" className="absolute right-1 top-0.5" onClick={() => setQuery('')} aria-label="Clear concept search"><X /></Button> : null}</div>{query ? <div className="mt-1 border border-border bg-background shadow-lg">{results.length ? results.map((node) => <button key={node.id} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { setSelected(node); setQuery(''); }}><span className="truncate">{node.label}</span><span className="ml-3 font-mono text-[9px] text-muted-foreground">{node.frequency}</span></button>) : <p className="px-3 py-4 text-xs text-muted-foreground">No matching concept</p>}</div> : null}</div>
        <div className="absolute left-4 right-4 top-40 z-[5] hidden grid-cols-2 gap-2 max-sm:grid"><label className="sr-only" htmlFor="community-level">Community resolution</label><select id="community-level" value={level} onChange={(event) => changeLevel(event.target.value as CommunityLevel)} className="h-8 border border-border bg-background/94 px-2 text-[10px]"><option value="top">6 broad communities</option><option value="split">21 refined communities</option></select><label className="sr-only" htmlFor="community-filter">Community filter</label><select id="community-filter" value={community ?? ''} onChange={(event) => setCommunity(event.target.value || null)} className="h-8 min-w-0 border border-border bg-background/94 px-2 text-[10px]"><option value="">All communities</option>{communities.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></div>
        <p className="absolute bottom-3 left-4 text-[10px] text-muted-foreground">Scroll to zoom · drag to pan · double-click to reset</p>
        {selected ? <aside className="absolute bottom-3 left-3 right-3 z-20 hidden max-h-[44%] overflow-auto border border-border bg-background/97 p-4 shadow-lg max-lg:block lg:hidden"><div className="flex items-start justify-between gap-3"><div><p className="data-kicker">Selected concept</p><h3 className="mt-1 font-heading text-xl capitalize">{selected.label}</h3></div><Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="Clear mobile selected concept"><X /></Button></div><div className="mt-3 grid grid-cols-2 gap-3 border-y border-border py-3 text-xs"><div><span className="text-muted-foreground">Paper frequency</span><p className="mt-1 font-mono">{selected.frequency}</p></div><div><span className="text-muted-foreground">Network degree</span><p className="mt-1 font-mono">{selected.degree}</p></div></div><p className="mt-3 text-[10px] text-muted-foreground capitalize">{selected.topCommunityName}</p><ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">{neighbours.slice(0, 6).map((item) => <li key={item.label} className="flex justify-between gap-2"><span className="truncate capitalize">{item.label}</span><span className="font-mono">{item.weight}</span></li>)}</ol></aside> : null}
      </div>
      <aside className="min-h-0 overflow-auto bg-[var(--panel-background)] p-5 max-lg:hidden">
        {selected ? <><p className="data-kicker">Selected concept</p><div className="mt-3 flex items-start justify-between gap-3"><h3 className="font-heading text-2xl leading-tight capitalize">{selected.label}</h3><Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="Clear selected concept"><X /></Button></div><dl className="mt-5 grid grid-cols-2 gap-4 border-y border-border py-4 text-xs"><div><dt className="text-muted-foreground">Paper frequency</dt><dd className="mt-1 font-mono text-base">{selected.frequency}</dd></div><div><dt className="text-muted-foreground">Network degree</dt><dd className="mt-1 font-mono text-base">{selected.degree}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Broad community</dt><dd className="mt-1 capitalize">{selected.topCommunityName}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Refined community</dt><dd className="mt-1 capitalize">{selected.splitCommunityName}</dd></div></dl><p className="data-kicker mt-5">Strongest neighbours</p><ol className="mt-3 space-y-2">{neighbours.map((item) => <li key={item.label}><button className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 text-left text-xs hover:text-primary" onClick={() => setSelected(data.full.nodes.find((node) => node.id === item.label) ?? null)}><span className="truncate capitalize">{item.label}</span><span className="font-mono text-[10px]">{item.weight}</span></button></li>)}</ol></> : <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-muted-foreground"><Network className="size-5" /><p className="mt-3 max-w-[190px] text-xs leading-5">Select a keyword to inspect its community, frequency and strongest network neighbours.</p></div>}
      </aside>
    </section>
  );
}
