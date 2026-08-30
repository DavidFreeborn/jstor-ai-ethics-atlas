'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';

import { DataError, DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { CommunitySummary, KeywordNode, NetworkData, NetworkEdge } from '@/lib/atlas-types';
import { buildAdjacency, communityId, edgeKey, highestDegreeShortestPath, oneHop, separatedCommunityNodes, twoNeighbourhoods, type CommunityLevel } from '@/lib/network-analysis';

type NetworkLayout = 'observed' | 'separated';
type SelectionMode = 'one' | 'two' | 'path';
type LabelMode = 'auto' | 'all' | 'off';
type ColourMode = 'community' | 'mono';
type View = { scale: number; x: number; y: number };
type ScreenNode = KeywordNode & { sx: number; sy: number; radius: number };

const MAP_BACKGROUND = '#090C10';
const MONO_COLOUR = '#B8C2D1';
const PICK_CELL = 28;

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function edgeWeight(edges: NetworkEdge[], source: string, target: string) {
  return edges.find((edge) => (edge.source === source && edge.target === target) || (edge.source === target && edge.target === source))?.weight ?? 1;
}

function KeywordNetworkCanvas({ nodes, edges, level, layout, community, selectionMode, selectedIds, pathIds, labelMode, colourMode, hoveredId, onHover, onSelect, onReset, onLabelMode, onColourMode }: { nodes: KeywordNode[]; edges: NetworkEdge[]; level: CommunityLevel; layout: NetworkLayout; community: string | null; selectionMode: SelectionMode; selectedIds: string[]; pathIds: string[] | null; labelMode: LabelMode; colourMode: ColourMode; hoveredId: string | null; onHover: (id: string | null) => void; onSelect: (node: KeywordNode) => void; onReset: () => void; onLabelMode: (mode: LabelMode) => void; onColourMode: (mode: ColourMode) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const plottedNodes = useMemo(() => layout === 'separated' ? separatedCommunityNodes(nodes, level) : nodes, [layout, level, nodes]);
  const nodeById = useMemo(() => new Map(plottedNodes.map((node) => [node.id, node])), [plottedNodes]);
  const bounds = useMemo(() => ({ minX: Math.min(...plottedNodes.map((node) => node.x)), maxX: Math.max(...plottedNodes.map((node) => node.x)), minY: Math.min(...plottedNodes.map((node) => node.y)), maxY: Math.max(...plottedNodes.map((node) => node.y)) }), [plottedNodes]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pathSet = useMemo(() => new Set(pathIds ?? []), [pathIds]);
  const pathEdges = useMemo(() => new Set((pathIds ?? []).slice(0, -1).map((id, index) => edgeKey(id, pathIds?.[index + 1] ?? ''))), [pathIds]);
  const adjacency = useMemo(() => buildAdjacency(edges), [edges]);
  const activeSet = useMemo(() => {
    if (!selectedIds.length) return null;
    if (selectionMode === 'path') return pathIds ? new Set(pathIds) : new Set(selectedIds);
    if (selectionMode === 'two') return twoNeighbourhoods(selectedIds, adjacency);
    return oneHop(selectedIds[0], adjacency);
  }, [adjacency, pathIds, selectedIds, selectionMode]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(320, Math.floor(entry.contentRect.height)) });
      setView({ scale: 1, x: 0, y: 0 });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const compactViewport = size.width < 600;
  useEffect(() => {
    const handle = window.setTimeout(() => setView({ scale: 1, x: 0, y: 0 }), 0);
    return () => window.clearTimeout(handle);
  }, [compactViewport, layout, level]);

  const screenNodes = useMemo<ScreenNode[]>(() => {
    const padding = 42;
    return plottedNodes.map((node) => {
      const bx = padding + ((node.x - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * (size.width - padding * 2);
      const by = padding + ((node.y - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * (size.height - padding * 2);
      return {
        ...node,
        sx: (bx - size.width / 2) * view.scale + size.width / 2 + view.x,
        sy: (by - size.height / 2) * view.scale + size.height / 2 + view.y,
        radius: Math.max(2.2, Math.min(9.5, 1.25 + Math.sqrt(node.frequency) * 0.3)) * Math.sqrt(view.scale),
      };
    });
  }, [bounds, plottedNodes, size, view]);
  const screenById = useMemo(() => new Map(screenNodes.map((node) => [node.id, node])), [screenNodes]);
  const pickGrid = useMemo(() => {
    const grid = new Map<string, ScreenNode[]>();
    for (const node of screenNodes) {
      const key = `${Math.floor(node.sx / PICK_CELL)}:${Math.floor(node.sy / PICK_CELL)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(node); else grid.set(key, [node]);
    }
    return grid;
  }, [screenNodes]);

  const findNode = useCallback((x: number, y: number) => {
    const cx = Math.floor(x / PICK_CELL);
    const cy = Math.floor(y / PICK_CELL);
    let best: ScreenNode | null = null;
    let bestDistance = 14;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      for (const node of pickGrid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        const distance = Math.hypot(node.sx - x, node.sy - y);
        if (distance < bestDistance) { best = node; bestDistance = distance; }
      }
    }
    return best;
  }, [pickGrid]);

  const nodeColour = useCallback((node: KeywordNode) => colourMode === 'mono' ? MONO_COLOUR : level === 'top' ? node.topColour : node.splitColour, [colourMode, level]);
  const inCommunity = useCallback((node: KeywordNode) => community === null || communityId(node, level) === community, [community, level]);

  const edgeState = useCallback((edge: NetworkEdge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return { alpha: 0, width: 0, colour: '#6B7280' };
    const communityActive = inCommunity(source) && inCommunity(target);
    const selectedEdge = selectionMode === 'path'
      ? pathEdges.has(edgeKey(edge.source, edge.target))
      : selectedIds.some((id) => edge.source === id || edge.target === id);
    if (selectedIds.length) return { alpha: selectedEdge ? 0.78 : activeSet?.has(edge.source) && activeSet.has(edge.target) ? 0.16 : 0.018, width: selectedEdge ? 1.5 + Math.log1p(edge.weight) * 0.28 : 0.45, colour: selectedEdge ? '#F8FAFC' : '#7890A6' };
    return { alpha: communityActive ? layout === 'separated' ? 0.028 : 0.06 : 0.008, width: 0.35 + Math.log1p(edge.weight) * 0.13, colour: '#7890A6' };
  }, [activeSet, inCommunity, layout, nodeById, pathEdges, selectedIds, selectionMode]);

  const labelCandidates = useMemo(() => {
    if (labelMode === 'off' && !hoveredId && !selectedIds.length) return [];
    const mandatory = new Set([...selectedIds, ...(hoveredId ? [hoveredId] : [])]);
    let candidates: ScreenNode[];
    if (labelMode === 'all') candidates = screenNodes.filter(inCommunity);
    else if (activeSet) candidates = screenNodes.filter((node) => activeSet.has(node.id));
    else candidates = screenNodes.filter(inCommunity).sort((a, b) => b.frequency - a.frequency).slice(0, 90);
    for (const id of mandatory) {
      const node = screenById.get(id);
      if (node && !candidates.some((candidate) => candidate.id === id)) candidates.unshift(node);
    }
    return candidates.sort((a, b) => Number(mandatory.has(b.id)) - Number(mandatory.has(a.id)) || b.frequency - a.frequency);
  }, [activeSet, hoveredId, inCommunity, labelMode, screenById, screenNodes, selectedIds]);

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
    context.fillStyle = MAP_BACKGROUND;
    context.fillRect(0, 0, size.width, size.height);
    context.lineCap = 'round';

    for (const edge of edges) {
      const source = screenById.get(edge.source);
      const target = screenById.get(edge.target);
      if (!source || !target) continue;
      const state = edgeState(edge);
      if (state.alpha <= 0) continue;
      context.globalAlpha = state.alpha;
      context.strokeStyle = state.colour;
      context.lineWidth = state.width;
      context.beginPath();
      context.moveTo(source.sx, source.sy);
      context.lineTo(target.sx, target.sy);
      context.stroke();
    }

    for (const node of screenNodes) {
      if (node.sx < -16 || node.sy < -16 || node.sx > size.width + 16 || node.sy > size.height + 16) continue;
      const chosen = selectedSet.has(node.id);
      const pathMember = pathSet.has(node.id);
      const active = activeSet === null || activeSet.has(node.id);
      const communityActive = inCommunity(node);
      context.globalAlpha = chosen || pathMember ? 1 : !communityActive ? 0.08 : active ? 0.94 : 0.11;
      context.fillStyle = nodeColour(node);
      context.beginPath();
      context.arc(node.sx, node.sy, chosen ? node.radius + 2.5 : pathMember ? node.radius + 1.2 : node.radius, 0, Math.PI * 2);
      context.fill();
      if (chosen || pathMember) {
        context.globalAlpha = 1;
        context.strokeStyle = chosen ? '#FFFFFF' : '#CBD5E1';
        context.lineWidth = chosen ? 2.2 : 1.2;
        context.stroke();
      }
    }

    context.globalAlpha = 1;
    context.font = '10px ui-sans-serif, system-ui, sans-serif';
    context.textBaseline = 'middle';
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const node of labelCandidates) {
      const text = node.label;
      const width = context.measureText(text).width;
      const x = node.sx + node.radius + 4;
      const y = node.sy;
      const box = { left: x - 2, right: x + width + 2, top: y - 7, bottom: y + 7 };
      const mandatory = selectedSet.has(node.id) || node.id === hoveredId || pathSet.has(node.id);
      if (labelMode !== 'all' && !mandatory && occupied.some((item) => !(box.right < item.left || box.left > item.right || box.bottom < item.top || box.top > item.bottom))) continue;
      if (box.right < 0 || box.left > size.width || box.bottom < 0 || box.top > size.height) continue;
      occupied.push(box);
      context.lineWidth = 3;
      context.strokeStyle = MAP_BACKGROUND;
      context.strokeText(text, x, y);
      context.fillStyle = mandatory ? '#FFFFFF' : '#D7DEE8';
      context.fillText(text, x, y);
    }
  }, [activeSet, edgeState, edges, hoveredId, inCommunity, labelCandidates, labelMode, nodeColour, pathSet, screenById, screenNodes, selectedSet, size]);

  const resetView = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  function exportSvg() {
    const visible = screenNodes.filter((node) => node.sx >= -20 && node.sy >= -20 && node.sx <= size.width + 20 && node.sy <= size.height + 20);
    const visibleIds = new Set(visible.map((node) => node.id));
    const lines = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map((edge) => {
      const source = screenById.get(edge.source)!;
      const target = screenById.get(edge.target)!;
      const state = edgeState(edge);
      return `<line x1="${source.sx.toFixed(2)}" y1="${source.sy.toFixed(2)}" x2="${target.sx.toFixed(2)}" y2="${target.sy.toFixed(2)}" stroke="${state.colour}" stroke-opacity="${state.alpha}" stroke-width="${state.width.toFixed(2)}"/>`;
    }).join('');
    const circles = visible.map((node) => `<circle cx="${node.sx.toFixed(2)}" cy="${node.sy.toFixed(2)}" r="${(selectedSet.has(node.id) ? node.radius + 2.5 : node.radius).toFixed(2)}" fill="${nodeColour(node)}" fill-opacity="${!inCommunity(node) ? 0.08 : activeSet && !activeSet.has(node.id) ? 0.11 : 0.94}"${selectedSet.has(node.id) ? ' stroke="#FFFFFF" stroke-width="2.2"' : ''}/>`).join('');
    const labels = labelCandidates.filter((node) => visibleIds.has(node.id)).map((node) => `<text x="${(node.sx + node.radius + 4).toFixed(2)}" y="${node.sy.toFixed(2)}" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="10">${escapeXml(node.label)}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><title>Keyword co-occurrence network</title><rect width="100%" height="100%" fill="${MAP_BACKGROUND}"/>${lines}${circles}${labels}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jstor-keyword-network.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div ref={wrapRef} className="relative h-full min-h-[380px] w-full overflow-hidden bg-[var(--plot-background)]">
      <canvas
        ref={canvasRef}
        className="block touch-none cursor-grab active:cursor-grabbing"
        aria-label="Interactive keyword co-occurrence network. Use the keyword search and details lists for keyboard selection."
        onDoubleClick={resetView}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          setView((current) => {
            const nextScale = Math.max(0.55, Math.min(7, current.scale * Math.exp(-event.deltaY * 0.0012)));
            const factor = nextScale / current.scale;
            return { scale: nextScale, x: x - size.width / 2 - (x - size.width / 2 - current.x) * factor, y: y - size.height / 2 - (y - size.height / 2 - current.y) * factor };
          });
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (dragRef.current) {
            const dx = event.clientX - dragRef.current.x;
            const dy = event.clientY - dragRef.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
            setView((current) => ({ ...current, x: dragRef.current!.vx + dx, y: dragRef.current!.vy + dy }));
            if (hoveredId) onHover(null);
          } else {
            const hit = findNode(event.clientX - rect.left, event.clientY - rect.top);
            if (hit?.id !== hoveredId) onHover(hit?.id ?? null);
          }
        }}
        onPointerUp={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!dragRef.current?.moved) {
            const hit = findNode(event.clientX - rect.left, event.clientY - rect.top);
            if (hit) onSelect(hit);
          }
          dragRef.current = null;
        }}
        onPointerLeave={() => { dragRef.current = null; onHover(null); }}
        onPointerCancel={() => { dragRef.current = null; onHover(null); }}
      />
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1 border border-white/15 bg-[#11151a]/94 p-1 text-white shadow-lg">
        <Button variant="ghost" size="sm" className="rounded-none text-white hover:bg-white/10 hover:text-white" onClick={() => { resetView(); onReset(); }} aria-label="Reset keyword network"><RotateCcw />Reset</Button>
        <label className="sr-only" htmlFor="keyword-label-mode">Keyword labels</label>
        <select id="keyword-label-mode" value={labelMode} onChange={(event) => onLabelMode(event.target.value as LabelMode)} className="h-8 border border-white/15 bg-[#11151a] px-2 text-[10px] text-white"><option value="auto">Automatic labels</option><option value="all">All labels</option><option value="off">No labels</option></select>
        <Button variant="ghost" size="sm" className="rounded-none text-white hover:bg-white/10 hover:text-white" onClick={() => onColourMode(colourMode === 'community' ? 'mono' : 'community')}>{colourMode === 'community' ? 'Community colours' : 'Monochrome'}</Button>
        <Button variant="ghost" size="sm" className="rounded-none text-white hover:bg-white/10 hover:text-white" onClick={exportSvg}><Download />Export SVG</Button>
      </div>
    </div>
  );
}

function ControlPanel({ level, layout, mode, community, communities, onLevel, onLayout, onMode, onCommunity }: { level: CommunityLevel; layout: NetworkLayout; mode: SelectionMode; community: string | null; communities: CommunitySummary[]; onLevel: (level: CommunityLevel) => void; onLayout: (layout: NetworkLayout) => void; onMode: (mode: SelectionMode) => void; onCommunity: (community: string | null) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-4 border-b border-border p-4">
        <label className="block text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">Partition<select value={level} onChange={(event) => onLevel(event.target.value as CommunityLevel)} className="mt-1 h-9 w-full border border-border bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground"><option value="top">6-community partition</option><option value="split">21-community partition</option></select></label>
        <label className="block text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">Layout<select value={layout} onChange={(event) => onLayout(event.target.value as NetworkLayout)} className="mt-1 h-9 w-full border border-border bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground"><option value="observed">Observed network</option><option value="separated">Communities separated</option></select></label>
        <label className="block text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">Selection<select value={mode} onChange={(event) => onMode(event.target.value as SelectionMode)} className="mt-1 h-9 w-full border border-border bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground"><option value="one">One neighbourhood</option><option value="two">Two neighbourhoods</option><option value="path">Shortest path</option></select></label>
      </div>
      <ScrollArea className="min-h-0 flex-1"><div className="p-3"><p className="data-kicker px-2 pb-2">Community</p><button className={`w-full px-2 py-2 text-left text-xs ${community === null ? 'bg-background font-medium' : 'text-muted-foreground hover:bg-background/60'}`} onClick={() => onCommunity(null)}>All communities</button>{communities.map((item) => <button key={item.id} className={`grid w-full grid-cols-[9px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 text-left text-[11px] ${community === String(item.id) ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`} onClick={() => onCommunity(String(item.id))}><span className="size-[9px] border border-black/10" style={{ backgroundColor: item.colour }} /><span className="truncate capitalize">{item.name}</span><span className="font-mono text-[9px]">{item.size}</span></button>)}</div></ScrollArea>
    </div>
  );
}

export function ConceptsWorkspace() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<CommunityLevel>('top');
  const [layout, setLayout] = useState<NetworkLayout>('observed');
  const [mode, setMode] = useState<SelectionMode>('one');
  const [labelMode, setLabelMode] = useState<LabelMode>('auto');
  const [colourMode, setColourMode] = useState<ColourMode>('community');
  const [community, setCommunity] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [controlsOpen, setControlsOpen] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/data/network.json')
      .then((response) => { if (!response.ok) throw new Error(`Network data returned ${response.status}`); return response.json() as Promise<NetworkData>; })
      .then((payload) => active && setData(payload))
      .catch((cause: Error) => active && setError(cause.message));
    return () => { active = false; };
  }, []);

  const changeLevel = (next: CommunityLevel) => { setLevel(next); setCommunity(null); setSelectedIds([]); };
  const changeMode = (next: SelectionMode) => { setMode(next); setSelectedIds([]); };
  const results = useMemo(() => data && query.trim() ? data.full.nodes.filter((node) => node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.frequency - a.frequency).slice(0, 10) : [], [data, query]);
  const nodeById = useMemo(() => new Map((data?.full.nodes ?? []).map((node) => [node.id, node])), [data]);
  const adjacency = useMemo(() => buildAdjacency(data?.full.edges ?? []), [data]);
  const degrees = useMemo(() => new Map((data?.full.nodes ?? []).map((node) => [node.id, node.degree])), [data]);
  const pathIds = useMemo(() => mode === 'path' && selectedIds.length === 2 ? highestDegreeShortestPath(selectedIds[0], selectedIds[1], adjacency, degrees) : null, [adjacency, degrees, mode, selectedIds]);

  if (error) return <DataError message={error} />;
  if (!data) return <DataLoading label="Loading keyword network" />;

  const communities = level === 'top' ? data.meta.topCommunities : data.meta.splitCommunities;
  const selectedNodes = selectedIds.map((id) => nodeById.get(id)).filter((node): node is KeywordNode => Boolean(node));
  const current = selectedNodes.at(-1) ?? null;
  const neighbours = current ? data.full.edges.filter((edge) => edge.source === current.id || edge.target === current.id).map((edge) => ({ id: edge.source === current.id ? edge.target : edge.source, weight: edge.weight })).sort((a, b) => b.weight - a.weight).slice(0, 10) : [];
  const topKeywords = data.full.nodes.filter((node) => community === null || communityId(node, level) === community).sort((a, b) => b.frequency - a.frequency).slice(0, 5);

  const selectNode = (node: KeywordNode) => {
    setSelectedIds((currentIds) => {
      if (mode === 'one') return [node.id];
      if (currentIds.length === 1 && currentIds[0] !== node.id) return [currentIds[0], node.id];
      return [node.id];
    });
  };
  const reset = () => { setSelectedIds([]); setCommunity(null); setHoveredId(null); };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="concepts-title">
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-5 py-3 max-sm:px-3"><div className="min-w-0"><h2 id="concepts-title" className="truncate font-heading text-xl font-medium">Keyword co-occurrence network</h2><p className="font-mono text-[9px] text-muted-foreground">534 keywords · 4,474 associations</p></div><div className="relative w-[min(300px,45vw)] max-sm:hidden"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find keyword" aria-label="Find keyword" className="h-9 rounded-none pl-8 pr-8" />{query ? <Button variant="ghost" size="icon-sm" className="absolute right-1 top-0.5" onClick={() => setQuery('')} aria-label="Clear keyword search"><X /></Button> : null}{query ? <div className="absolute right-0 top-10 z-30 w-full border border-border bg-background shadow-lg">{results.length ? results.map((node) => <button key={node.id} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { selectNode(node); setQuery(''); }}><span className="truncate">{node.label}</span><span className="font-mono text-[9px] text-muted-foreground">{node.frequency}</span></button>) : <p className="px-3 py-4 text-xs text-muted-foreground">No match</p>}</div> : null}</div></header>
      <div className={`grid min-h-0 flex-1 ${controlsOpen ? 'grid-cols-[240px_minmax(0,1fr)_286px] max-lg:grid-cols-[210px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_286px] max-lg:grid-cols-1'} max-sm:grid-cols-1`}>
        {controlsOpen ? <aside className="flex min-h-0 flex-col border-r border-border bg-[var(--panel-background)] max-sm:hidden"><ControlPanel level={level} layout={layout} mode={mode} community={community} communities={communities} onLevel={changeLevel} onLayout={setLayout} onMode={changeMode} onCommunity={setCommunity} /></aside> : null}
        <div className="relative min-h-0 overflow-hidden border-r border-border max-lg:border-r-0">
          <KeywordNetworkCanvas nodes={data.full.nodes} edges={data.full.edges} level={level} layout={layout} community={community} selectionMode={mode} selectedIds={selectedIds} pathIds={pathIds} labelMode={labelMode} colourMode={colourMode} hoveredId={hoveredId} onHover={setHoveredId} onSelect={selectNode} onReset={reset} onLabelMode={setLabelMode} onColourMode={setColourMode} />
          <Button variant="ghost" size="icon-sm" className="absolute left-3 top-3 hidden rounded-none border border-white/15 bg-[#11151a]/94 text-white hover:bg-white/10 hover:text-white sm:inline-flex" onClick={() => setControlsOpen((open) => !open)} aria-label={controlsOpen ? 'Hide keyword-network controls' : 'Show keyword-network controls'}>{controlsOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button>
          <Sheet><SheetTrigger render={<Button size="sm" variant="outline" className="absolute left-3 top-3 hidden rounded-none border-white/15 bg-[#11151a]/94 text-white max-sm:inline-flex" />}><SlidersHorizontal />Controls</SheetTrigger><SheetContent side="left" className="w-[300px]"><SheetHeader><SheetTitle>Keyword network controls</SheetTitle><SheetDescription className="sr-only">Set partition, layout, selection mode and community.</SheetDescription></SheetHeader><ControlPanel level={level} layout={layout} mode={mode} community={community} communities={communities} onLevel={changeLevel} onLayout={setLayout} onMode={changeMode} onCommunity={setCommunity} /></SheetContent></Sheet>
          <div className="absolute right-3 top-3 hidden w-[min(270px,calc(100%-100px))] max-sm:block"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-white/60" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find keyword" aria-label="Find keyword" className="h-9 rounded-none border-white/15 bg-[#11151a]/94 pl-8 pr-8 text-white placeholder:text-white/50" /></div>{query ? <div className="mt-1 border border-white/15 bg-[#11151a] text-white shadow-lg">{results.map((node) => <button key={node.id} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left text-xs hover:bg-white/10" onClick={() => { selectNode(node); setQuery(''); }}><span className="truncate">{node.label}</span><span className="font-mono text-[9px] text-white/60">{node.frequency}</span></button>)}</div> : null}</div>
          {current ? <aside className="absolute bottom-24 left-3 right-3 z-20 hidden max-h-[45%] overflow-auto border border-white/15 bg-[#11151a]/97 p-4 text-white shadow-xl max-lg:block"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.1em] text-white/55">Keyword details</p><h3 className="mt-1 font-heading text-xl capitalize">{current.label}</h3></div><Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSelectedIds([])} aria-label="Clear keyword selection"><X /></Button></div><dl className="mt-3 flex gap-5 text-xs"><div><dt className="text-white/55">Frequency</dt><dd className="font-mono">{current.frequency}</dd></div><div><dt className="text-white/55">Degree</dt><dd className="font-mono">{current.degree}</dd></div></dl></aside> : null}
        </div>
        <aside className="min-h-0 overflow-auto bg-[var(--panel-background)] p-5 max-lg:hidden">
          <div className="flex items-start justify-between"><p className="data-kicker">{mode === 'path' && pathIds ? 'Shortest path' : current ? 'Keyword details' : 'Highest-frequency keywords'}</p>{selectedIds.length ? <Button variant="ghost" size="icon-sm" onClick={() => setSelectedIds([])} aria-label="Clear keyword selection"><X /></Button> : null}</div>
          {mode === 'path' && pathIds ? <><dl className="mt-3 flex gap-5 text-xs"><div><dt className="text-muted-foreground">Keywords</dt><dd className="font-mono">{pathIds.length}</dd></div><div><dt className="text-muted-foreground">Edges</dt><dd className="font-mono">{Math.max(0, pathIds.length - 1)}</dd></div></dl><ol className="mt-5 space-y-1">{pathIds.map((id, index) => <li key={id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs"><button className="truncate text-left capitalize hover:text-primary" onClick={() => selectNode(nodeById.get(id)!)}>{nodeById.get(id)?.label ?? id}</button><span className="font-mono text-[9px] text-muted-foreground">{index < pathIds.length - 1 ? edgeWeight(data.full.edges, id, pathIds[index + 1]) : ''}</span></li>)}</ol></> : current ? <><h3 className="mt-3 font-heading text-2xl capitalize">{current.label}</h3>{selectedNodes.length === 2 ? <div className="mt-4 border-y border-border py-3"><p className="data-kicker">Selected keywords</p><div className="mt-2 grid grid-cols-[minmax(0,1fr)_45px_45px] gap-2 text-[10px]"><span className="text-muted-foreground">Keyword</span><span className="text-right text-muted-foreground">Freq.</span><span className="text-right text-muted-foreground">Degree</span>{selectedNodes.map((node) => <div className="contents" key={node.id}><span className="truncate capitalize">{node.label}</span><span className="text-right font-mono">{node.frequency}</span><span className="text-right font-mono">{node.degree}</span></div>)}</div></div> : <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-border py-4 text-xs"><div><dt className="text-muted-foreground">Frequency</dt><dd className="mt-1 font-mono text-base">{current.frequency}</dd></div><div><dt className="text-muted-foreground">Degree</dt><dd className="mt-1 font-mono text-base">{current.degree}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">6-community partition</dt><dd className="mt-1 capitalize">{current.topCommunityName}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">21-community partition</dt><dd className="mt-1 capitalize">{current.splitCommunityName}</dd></div></dl>}<p className="data-kicker mt-5">Strongest co-occurrences</p><ol className="mt-3 space-y-2">{neighbours.map((item) => <li key={item.id}><button className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 text-left text-xs hover:text-primary" onClick={() => { const node = nodeById.get(item.id); if (node) selectNode(node); }}><span className="truncate capitalize">{nodeById.get(item.id)?.label ?? item.id}</span><span className="font-mono text-[10px]">{item.weight}</span></button></li>)}</ol></> : <><div className="mt-3 grid grid-cols-[minmax(0,1fr)_38px_38px] gap-2 text-[9px] uppercase tracking-[.08em] text-muted-foreground"><span>Keyword</span><span className="text-right">Freq.</span><span className="text-right">Degree</span></div><ol className="mt-2 space-y-2">{topKeywords.map((node) => <li key={node.id}><button className="grid w-full grid-cols-[minmax(0,1fr)_38px_38px] gap-2 text-left text-xs hover:text-primary" onClick={() => selectNode(node)}><span className="truncate capitalize">{node.label}</span><span className="text-right font-mono text-[9px]">{node.frequency}</span><span className="text-right font-mono text-[9px] text-muted-foreground">{node.degree}</span></button></li>)}</ol></>}
        </aside>
      </div>
    </section>
  );
}
