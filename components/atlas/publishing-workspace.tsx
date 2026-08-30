'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';

import { DataError, DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { BipartiteNode, NetworkData, NetworkEdge, PublishingData } from '@/lib/atlas-types';

type PublishingMode = 'network' | 'publishers';
type BipartiteLayout = 'rings' | 'columns';
type LabelMode = 'auto' | 'all' | 'off';
type View = { scale: number; x: number; y: number };
type PositionedNode = BipartiteNode & { x: number; y: number; radius: number };

const PLOT_BACKGROUND = '#090C10';
const KEYWORD_COLOUR = '#8B7CFF';
const JOURNAL_COLOUR = '#FFB000';
const PROFILE_COLOURS = ['#8B7CFF', '#2DFF9A', '#FFB000', '#FF5FD2', '#35D7FF', '#FF6B4A'];

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function edgePath(source: PositionedNode, target: PositionedNode, layout: BipartiteLayout) {
  if (layout === 'columns') {
    const middle = (source.x + target.x) / 2;
    return { canvas: (context: CanvasRenderingContext2D) => { context.moveTo(source.x, source.y); context.bezierCurveTo(middle, source.y, middle, target.y, target.x, target.y); }, svg: `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} C ${middle.toFixed(2)} ${source.y.toFixed(2)} ${middle.toFixed(2)} ${target.y.toFixed(2)} ${target.x.toFixed(2)} ${target.y.toFixed(2)}` };
  }
  const controlX = ((source.x + target.x) / 2) * 0.3 + source.x * 0.35 + target.x * 0.35;
  const controlY = ((source.y + target.y) / 2) * 0.3 + source.y * 0.35 + target.y * 0.35;
  return { canvas: (context: CanvasRenderingContext2D) => { context.moveTo(source.x, source.y); context.quadraticCurveTo(controlX, controlY, target.x, target.y); }, svg: `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${target.x.toFixed(2)} ${target.y.toFixed(2)}` };
}

function BipartiteCanvas({ nodes, edges, layout, selectedId, labelMode, onSelect, onReset, onLabelMode }: { nodes: BipartiteNode[]; edges: NetworkEdge[]; layout: BipartiteLayout; selectedId: string | null; labelMode: LabelMode; onSelect: (id: string | null) => void; onReset: () => void; onLabelMode: (mode: LabelMode) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(340, Math.floor(entry.contentRect.height)) });
      setView({ scale: 1, x: 0, y: 0 });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const compactViewport = size.width < 600;
  useEffect(() => {
    const handle = window.setTimeout(() => setView({ scale: 1, x: 0, y: 0 }), 0);
    return () => window.clearTimeout(handle);
  }, [compactViewport, layout]);

  const positioned = useMemo<PositionedNode[]>(() => {
    const keywords = nodes.filter((node) => node.kind === 'keyword');
    const journals = nodes.filter((node) => node.kind === 'journal');
    const maxDegree = Math.max(...nodes.map((node) => node.degree), 1);
    const radius = (node: BipartiteNode) => 3 + (Math.sqrt(node.degree) / Math.sqrt(maxDegree)) * 7;
    const output: PositionedNode[] = [];
    if (layout === 'rings') {
      const cx = size.width / 2;
      const cy = size.height / 2;
      const outer = Math.min(size.height * 0.4, size.width * 0.29);
      const inner = outer * 0.58;
      keywords.forEach((node, index) => { const angle = (index / keywords.length) * Math.PI * 2 - Math.PI / 2; output.push({ ...node, x: cx + Math.cos(angle) * inner, y: cy + Math.sin(angle) * inner, radius: radius(node) }); });
      journals.forEach((node, index) => { const angle = (index / journals.length) * Math.PI * 2 - Math.PI / 2; output.push({ ...node, x: cx + Math.cos(angle) * outer, y: cy + Math.sin(angle) * outer, radius: radius(node) }); });
    } else {
      const top = 22;
      const height = size.height - top - 64;
      keywords.forEach((node, index) => output.push({ ...node, x: size.width * 0.28, y: top + (index / Math.max(1, keywords.length - 1)) * height, radius: radius(node) }));
      journals.forEach((node, index) => output.push({ ...node, x: size.width * 0.72, y: top + (index / Math.max(1, journals.length - 1)) * height, radius: radius(node) }));
    }
    return output.map((node) => ({ ...node, x: (node.x - size.width / 2) * view.scale + size.width / 2 + view.x, y: (node.y - size.height / 2) * view.scale + size.height / 2 + view.y, radius: node.radius * Math.sqrt(view.scale) }));
  }, [layout, nodes, size, view]);
  const nodeById = useMemo(() => new Map(positioned.map((node) => [node.id, node])), [positioned]);
  const neighbourIds = useMemo(() => selectedId ? new Set(edges.flatMap((edge) => edge.source === selectedId ? [edge.target] : edge.target === selectedId ? [edge.source] : [])) : null, [edges, selectedId]);
  const selectedEdges = useMemo(() => selectedId ? edges.filter((edge) => edge.source === selectedId || edge.target === selectedId) : [], [edges, selectedId]);

  const labels = useMemo(() => {
    if (labelMode === 'off' && !selectedId && !hoveredId) return [];
    const mandatory = new Set([selectedId, hoveredId].filter((id): id is string => Boolean(id)));
    const candidates = selectedId && neighbourIds
      ? positioned.filter((node) => node.id === selectedId || neighbourIds.has(node.id))
      : [...positioned].sort((a, b) => b.degree - a.degree).slice(0, labelMode === 'all' ? positioned.length : compactViewport ? 20 : 50);
    return candidates.sort((a, b) => Number(mandatory.has(b.id)) - Number(mandatory.has(a.id)) || b.degree - a.degree);
  }, [compactViewport, hoveredId, labelMode, neighbourIds, positioned, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = PLOT_BACKGROUND;
    context.fillRect(0, 0, size.width, size.height);

    for (const edge of edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const active = selectedId ? edge.source === selectedId || edge.target === selectedId : false;
      context.globalAlpha = selectedId ? active ? 0.72 : 0.018 : 0.075;
      context.strokeStyle = active ? '#F8FAFC' : '#8091A3';
      context.lineWidth = active ? 1.2 + Math.log1p(edge.weight) * 0.35 : 0.45;
      context.beginPath();
      edgePath(source, target, layout).canvas(context);
      context.stroke();
    }

    for (const node of positioned) {
      const selected = node.id === selectedId;
      const active = !selectedId || selected || neighbourIds?.has(node.id);
      context.globalAlpha = active ? 0.96 : 0.1;
      context.fillStyle = node.kind === 'keyword' ? KEYWORD_COLOUR : JOURNAL_COLOUR;
      context.beginPath();
      context.arc(node.x, node.y, selected ? node.radius + 2.5 : node.radius, 0, Math.PI * 2);
      context.fill();
      if (selected) { context.globalAlpha = 1; context.strokeStyle = '#FFFFFF'; context.lineWidth = 2.2; context.stroke(); }
    }

    if (selectedId) {
      context.globalAlpha = 1;
      context.font = '9px ui-monospace, monospace';
      context.fillStyle = '#FFFFFF';
      context.textAlign = 'center';
      for (const edge of selectedEdges) {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) continue;
        const x = source.x * 0.28 + target.x * 0.72;
        const y = source.y * 0.28 + target.y * 0.72;
        context.lineWidth = 3;
        context.strokeStyle = PLOT_BACKGROUND;
        context.strokeText(String(edge.weight), x, y);
        context.fillText(String(edge.weight), x, y);
      }
    }

    context.globalAlpha = 1;
    context.font = '9px ui-sans-serif, system-ui, sans-serif';
    context.textBaseline = 'middle';
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const node of labels) {
      const mandatory = node.id === selectedId || node.id === hoveredId;
      const maxCharacters = compactViewport ? 14 : 22;
      const display = node.label.length > maxCharacters ? `${node.label.slice(0, maxCharacters - 2)}…` : node.label;
      const width = context.measureText(display).width;
      const leftSide = layout === 'columns' ? node.kind === 'keyword' : node.x < size.width / 2;
      const x = leftSide ? node.x - node.radius - 4 : node.x + node.radius + 4;
      const box = { left: leftSide ? x - width - 2 : x - 2, right: leftSide ? x + 2 : x + width + 2, top: node.y - 6, bottom: node.y + 6 };
      if (labelMode !== 'all' && !mandatory && occupied.some((item) => !(box.right < item.left || box.left > item.right || box.bottom < item.top || box.top > item.bottom))) continue;
      if (box.right < 0 || box.left > size.width || box.bottom < 0 || box.top > size.height) continue;
      occupied.push(box);
      context.textAlign = leftSide ? 'right' : 'left';
      context.lineWidth = 3;
      context.strokeStyle = PLOT_BACKGROUND;
      context.strokeText(display, x, node.y);
      context.fillStyle = mandatory ? '#FFFFFF' : '#D7DEE8';
      context.fillText(display, x, node.y);
    }
  }, [compactViewport, edges, hoveredId, labelMode, labels, layout, neighbourIds, nodeById, positioned, selectedEdges, selectedId, size]);

  const findNode = useCallback((x: number, y: number) => {
    let best: PositionedNode | null = null;
    let distance = 14;
    for (const node of positioned) {
      const current = Math.hypot(node.x - x, node.y - y);
      if (current < distance) { best = node; distance = current; }
    }
    return best;
  }, [positioned]);
  const resetView = () => setView({ scale: 1, x: 0, y: 0 });

  function exportSvg() {
    const lines = edges.map((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return '';
      const active = selectedId ? edge.source === selectedId || edge.target === selectedId : false;
      return `<path d="${edgePath(source, target, layout).svg}" fill="none" stroke="${active ? '#F8FAFC' : '#8091A3'}" stroke-opacity="${selectedId ? active ? 0.72 : 0.018 : 0.075}" stroke-width="${active ? (1.2 + Math.log1p(edge.weight) * 0.35).toFixed(2) : '0.45'}"/>`;
    }).join('');
    const circles = positioned.map((node) => `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${(node.id === selectedId ? node.radius + 2.5 : node.radius).toFixed(2)}" fill="${node.kind === 'keyword' ? KEYWORD_COLOUR : JOURNAL_COLOUR}" fill-opacity="${selectedId && node.id !== selectedId && !neighbourIds?.has(node.id) ? 0.1 : 0.96}"${node.id === selectedId ? ' stroke="#FFFFFF" stroke-width="2.2"' : ''}/>`).join('');
    const text = labels.map((node) => `<text x="${(node.x + node.radius + 4).toFixed(2)}" y="${node.y.toFixed(2)}" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="9">${escapeXml(node.label)}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><title>Keyword-journal network</title><rect width="100%" height="100%" fill="${PLOT_BACKGROUND}"/>${lines}${circles}${text}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jstor-keyword-journal-network.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <div ref={wrapRef} className="relative h-full min-h-[390px] w-full overflow-hidden bg-[var(--plot-background)]"><canvas ref={canvasRef} className="block touch-none cursor-grab active:cursor-grabbing" aria-label="Interactive keyword-journal network. Use the node search and details lists for keyboard selection." onDoubleClick={resetView} onWheel={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; setView((current) => { const nextScale = Math.max(0.65, Math.min(6, current.scale * Math.exp(-event.deltaY * 0.0012))); const factor = nextScale / current.scale; return { scale: nextScale, x: x - size.width / 2 - (x - size.width / 2 - current.x) * factor, y: y - size.height / 2 - (y - size.height / 2 - current.y) * factor }; }); }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false }; }} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); if (dragRef.current) { const dx = event.clientX - dragRef.current.x; const dy = event.clientY - dragRef.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true; setView((current) => ({ ...current, x: dragRef.current!.vx + dx, y: dragRef.current!.vy + dy })); if (hoveredId) setHoveredId(null); } else { const hit = findNode(event.clientX - rect.left, event.clientY - rect.top); if (hit?.id !== hoveredId) setHoveredId(hit?.id ?? null); } }} onPointerUp={(event) => { const rect = event.currentTarget.getBoundingClientRect(); if (!dragRef.current?.moved) onSelect(findNode(event.clientX - rect.left, event.clientY - rect.top)?.id ?? null); dragRef.current = null; }} onPointerLeave={() => { dragRef.current = null; setHoveredId(null); }} onPointerCancel={() => { dragRef.current = null; setHoveredId(null); }} /><div className="absolute bottom-3 left-3 flex items-center gap-1 border border-white/15 bg-[#11151a]/94 p-1 text-white"><Button variant="ghost" size="sm" className="rounded-none text-white hover:bg-white/10 hover:text-white" onClick={() => { resetView(); onReset(); }}><RotateCcw />Reset</Button><label htmlFor="journal-label-mode" className="sr-only">Network labels</label><select id="journal-label-mode" value={labelMode} onChange={(event) => onLabelMode(event.target.value as LabelMode)} className="h-8 border border-white/15 bg-[#11151a] px-2 text-[10px] text-white"><option value="auto">Automatic labels</option><option value="all">All labels</option><option value="off">No labels</option></select><Button variant="ghost" size="sm" className="rounded-none text-white hover:bg-white/10 hover:text-white" onClick={exportSvg}><Download />Export SVG</Button></div></div>;
}

function PublisherProfiles({ publishing }: { publishing: PublishingData }) {
  return <div className="min-h-0 flex-1 overflow-auto p-5 max-sm:p-3"><div className="mx-auto grid max-w-6xl grid-cols-3 border-l border-t border-border max-lg:grid-cols-2 max-sm:grid-cols-1">{publishing.publisher_profiles.map((profile, profileIndex) => { const maxShare = Math.max(...profile.publishers.map((publisher) => publisher.share)); return <article key={profile.community} className="border-b border-r border-border bg-background p-4"><div className="flex items-baseline justify-between gap-3"><h3 className="font-heading text-lg capitalize">{profile.name}</h3><span className="font-mono text-[10px] text-muted-foreground">n={profile.papers.toLocaleString()}</span></div><ol className="mt-4 space-y-2.5">{profile.publishers.map((publisher) => <li key={publisher.name}><div className="flex justify-between gap-3 text-[10px]"><span className="truncate">{publisher.name}</span><span className="font-mono">{publisher.share.toFixed(1)}%</span></div><div className="mt-1 h-1 bg-muted"><div className="h-full" style={{ width: `${(publisher.share / maxShare) * 100}%`, backgroundColor: PROFILE_COLOURS[profileIndex] }} /></div></li>)}</ol></article>; })}</div></div>;
}

export function PublishingWorkspace() {
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [publishing, setPublishing] = useState<PublishingData | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<PublishingMode>('network');
  const [layout, setLayout] = useState<BipartiteLayout>('rings');
  const [labelMode, setLabelMode] = useState<LabelMode>('auto');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [controlsOpen, setControlsOpen] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/data/network.json'), fetch('/data/publishing.json')])
      .then(async ([networkResponse, publishingResponse]) => { if (!networkResponse.ok || !publishingResponse.ok) throw new Error('Publishing evidence could not be retrieved.'); return [await networkResponse.json() as NetworkData, await publishingResponse.json() as PublishingData] as const; })
      .then(([networkData, publishingData]) => { if (active) { setNetwork(networkData); setPublishing(publishingData); } })
      .catch((cause: Error) => active && setError(cause.message));
    return () => { active = false; };
  }, []);

  const graph = useMemo(() => {
    if (!network) return { nodes: [] as BipartiteNode[], edges: [] as NetworkEdge[] };
    const keywords = network.bipartite.nodes.filter((node) => node.kind === 'keyword').sort((a, b) => b.degree - a.degree).slice(0, 50);
    const journals = network.bipartite.nodes.filter((node) => node.kind === 'journal').sort((a, b) => b.degree - a.degree).slice(0, 50);
    const nodes = [...keywords, ...journals];
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes, edges: network.bipartite.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }, [network]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const results = useMemo(() => query.trim() ? graph.nodes.filter((node) => node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.degree - a.degree).slice(0, 10) : [], [graph.nodes, query]);

  if (error) return <DataError message={error} />;
  if (!network || !publishing) return <DataLoading label="Loading publication networks" />;

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const associations = selected ? graph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).map((edge) => ({ id: edge.source === selected.id ? edge.target : edge.source, weight: edge.weight })).sort((a, b) => b.weight - a.weight) : [];
  const topJournals = graph.nodes.filter((node) => node.kind === 'journal').slice(0, 6);

  const controls = <div className="space-y-4 p-4"><label className="block text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">Layout<select value={layout} onChange={(event) => { setLayout(event.target.value as BipartiteLayout); setSelectedId(null); }} className="mt-1 h-9 w-full border border-border bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground"><option value="rings">Concentric rings</option><option value="columns">Opposing columns</option></select></label><div><p className="data-kicker">Displayed subset</p><p className="mt-1 text-xs leading-5 text-muted-foreground">50 highest-degree keywords<br />50 highest-degree journals</p></div><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find displayed node" aria-label="Find displayed node" className="h-9 rounded-none pl-8 pr-8" />{query ? <Button variant="ghost" size="icon-sm" className="absolute right-1 top-0.5" onClick={() => setQuery('')} aria-label="Clear node search"><X /></Button> : null}</div>{query ? <div className="border border-t-0 border-border bg-background">{results.length ? results.map((node) => <button key={node.id} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { setSelectedId(node.id); setQuery(''); }}><span className="truncate">{node.label}</span><span className="font-mono text-[9px] text-muted-foreground">{node.kind}</span></button>) : <p className="px-3 py-4 text-xs text-muted-foreground">No match</p>}</div> : null}</div>;

  return <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="publishing-title"><header className="flex min-h-14 items-center justify-between gap-5 border-b border-border px-5 py-3 max-sm:grid max-sm:px-3"><div className="min-w-0"><h2 id="publishing-title" className="truncate font-heading text-xl font-medium">Keyword-journal network and aggregate publisher profiles</h2>{mode === 'network' ? <p className="font-mono text-[9px] text-muted-foreground">534 keywords · 1,201 journals · 9,330 associations</p> : null}</div><div className="flex border border-border p-0.5"><Button size="sm" variant={mode === 'network' ? 'default' : 'ghost'} className="rounded-none" onClick={() => setMode('network')}>Keyword-journal network</Button><Button size="sm" variant={mode === 'publishers' ? 'default' : 'ghost'} className="rounded-none" onClick={() => setMode('publishers')}>Publisher profiles</Button></div></header>{mode === 'publishers' ? <PublisherProfiles publishing={publishing} /> : <div className={`grid min-h-0 flex-1 ${controlsOpen ? 'grid-cols-[220px_minmax(0,1fr)_280px] max-lg:grid-cols-[190px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_280px] max-lg:grid-cols-1'} max-sm:grid-cols-1`}>{controlsOpen ? <aside className="border-r border-border bg-[var(--panel-background)] max-sm:hidden">{controls}</aside> : null}<div className="relative min-h-0 overflow-hidden border-r border-border max-lg:border-r-0"><BipartiteCanvas nodes={graph.nodes} edges={graph.edges} layout={layout} selectedId={selectedId} labelMode={labelMode} onSelect={setSelectedId} onReset={() => setSelectedId(null)} onLabelMode={setLabelMode} /><Button variant="ghost" size="icon-sm" className="absolute left-3 top-3 hidden rounded-none border border-white/15 bg-[#11151a]/94 text-white hover:bg-white/10 hover:text-white sm:inline-flex" onClick={() => setControlsOpen((open) => !open)} aria-label={controlsOpen ? 'Hide publication-network controls' : 'Show publication-network controls'}>{controlsOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button><Sheet><SheetTrigger render={<Button size="sm" variant="outline" className="absolute left-3 top-3 hidden rounded-none border-white/15 bg-[#11151a]/94 text-white max-sm:inline-flex" />}><SlidersHorizontal />Controls</SheetTrigger><SheetContent side="left" className="w-[300px]"><SheetHeader><SheetTitle>Publication network controls</SheetTitle><SheetDescription className="sr-only">Set layout and select a displayed network node.</SheetDescription></SheetHeader>{controls}</SheetContent></Sheet></div><aside className="min-h-0 overflow-auto bg-[var(--panel-background)] p-5 max-lg:hidden"><div className="flex items-start justify-between"><p className="data-kicker">{selected ? selected.kind === 'keyword' ? 'Keyword details' : 'Journal details' : 'Highest-degree journals'}</p>{selected ? <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)} aria-label="Clear network selection"><X /></Button> : null}</div>{selected ? <><h3 className="mt-3 font-heading text-xl leading-tight">{selected.label}</h3><dl className="mt-4 border-y border-border py-3 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Degree in full network</dt><dd className="font-mono">{selected.degree}</dd></div></dl><p className="data-kicker mt-5">Strongest displayed associations</p><ol className="mt-3 space-y-2">{associations.slice(0, 10).map((item) => <li key={item.id}><button className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 text-left text-xs hover:text-primary" onClick={() => setSelectedId(item.id)}><span className="truncate">{nodeById.get(item.id)?.label ?? item.id}</span><span className="font-mono text-[10px]">{item.weight}</span></button></li>)}</ol></> : <ol className="mt-3 space-y-2">{topJournals.map((journal) => <li key={journal.id}><button className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 text-left text-xs hover:text-primary" onClick={() => setSelectedId(journal.id)}><span className="truncate">{journal.label}</span><span className="font-mono text-[10px]">{journal.degree}</span></button></li>)}</ol>}</aside></div>}</section>;
}
