'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ColourSlots, FacetSelections, RelationState } from '@/components/atlas/papers-workspace';
import { AGREEMENT_STOPS, CATEGORY_COLOURS, OTHER_COLOUR } from '@/lib/atlas-visual';
import type { MapData, PaperLens, PaperPoint, TopicSummary } from '@/lib/atlas-types';

type Transform = { scale: number; tx: number; ty: number };
type ScreenPoint = { paper: PaperPoint; x: number; y: number };
type Mark = { colours: string[]; applicable: boolean };

const PICK_CELL = 24;

function parseHex(hex: string) { return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)); }
function rgba(hex: string, alpha: number) { const [r, g, b] = parseHex(hex); return `rgba(${r},${g},${b},${alpha})`; }
function interpolateStops(value: number, stops: readonly string[]) {
  const bounded = Math.max(0, Math.min(1, value));
  const position = bounded * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  const fraction = position - index;
  const left = parseHex(stops[index]); const right = parseHex(stops[index + 1]);
  return `rgb(${left.map((channel, i) => Math.round(channel + (right[i] - channel) * fraction)).join(',')})`;
}

function drawMark(context: CanvasRenderingContext2D, x: number, y: number, radius: number, colours: string[], alpha: number) {
  if (!colours.length) { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = `rgba(190,200,210,${alpha * 0.12})`; context.fill(); return; }
  if (colours.length === 1) { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = colours[0].startsWith('#') ? rgba(colours[0], alpha) : colours[0]; context.globalAlpha = colours[0].startsWith('#') ? 1 : alpha; context.fill(); context.globalAlpha = 1; return; }
  const step = Math.PI * 2 / colours.length;
  colours.forEach((colour, index) => { context.beginPath(); context.moveTo(x, y); context.arc(x, y, radius, -Math.PI / 2 + step * index, -Math.PI / 2 + step * (index + 1)); context.closePath(); context.fillStyle = rgba(colour, alpha); context.fill(); });
}

function topicValue(paper: PaperPoint, lens: PaperLens) { if (lens === 'bertopic') return paper.bertopic; if (lens === 'bertopic_reduced') return paper.bertopic_reduced; return paper.lda_topic; }

export function PaperMap({ data, lens, selected, onSelect, topicFilter, selections, colourSlots, relation }: {
  data: MapData; lens: PaperLens; selected: PaperPoint | null; onSelect: (paper: PaperPoint | null) => void;
  topicFilter: number | null; selections: FacetSelections; colourSlots: ColourSlots; relation: RelationState;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const hostRef = useRef<HTMLDivElement>(null); const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 }); const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 }); const [hovered, setHovered] = useState<ScreenPoint | null>(null);
  const topics: TopicSummary[] = lens === 'bertopic_reduced' ? data.topics.bertopic_reduced : lens === 'lda' ? data.topics.lda : data.topics.bertopic;
  const topicColours = useMemo(() => new Map(topics.map((topic) => [topic.id, topic.colour])), [topics]);
  const selectedValues = useMemo(() => ({ publisher: new Set(selections.publisher), journal: new Set(selections.journal), keywords: new Set(selections.keywords) }), [selections]);
  const maxCoauthor = useMemo(() => Math.max(1, ...data.points.map((paper) => paper.coauthor_count)), [data.points]);
  const agreementScale = useMemo(() => {
    const values = data.points.map((paper) => paper.neighbour_agreement).filter((value): value is number => value !== null).sort((a, b) => a - b);
    const ranks = new Map<number, number>();
    for (let start = 0; start < values.length;) {
      let end = start;
      while (end + 1 < values.length && values[end + 1] === values[start]) end += 1;
      ranks.set(values[start], values.length > 1 ? ((start + end) / 2) / (values.length - 1) : 0.5);
      start = end + 1;
    }
    return ranks;
  }, [data.points]);

  const markFor = useCallback((paper: PaperPoint): Mark => {
    if (lens === 'catalogue') return { colours: ['#DDF6FF'], applicable: true };
    if (lens === 'bertopic' || lens === 'bertopic_reduced' || lens === 'lda') { const value = topicValue(paper, lens); const applicable = value !== undefined && (topicFilter === null || value === topicFilter); return { colours: applicable ? [topicColours.get(value!) ?? '#D8DEE9'] : [], applicable }; }
    if (lens === 'agreement') return paper.neighbour_agreement === null ? { colours: [], applicable: false } : { colours: [interpolateStops(agreementScale.get(paper.neighbour_agreement) ?? 0, AGREEMENT_STOPS)], applicable: true };
    if (lens === 'publisher') { if (!paper.publisher) return { colours: [], applicable: false }; const selectedValue = selectedValues.publisher.has(paper.publisher); return { colours: [selectedValue ? CATEGORY_COLOURS[colourSlots.publisher.get(paper.publisher) ?? 0] : OTHER_COLOUR], applicable: true }; }
    if (lens === 'journal') { if (!paper.journal) return { colours: [], applicable: false }; const selectedValue = selectedValues.journal.has(paper.journal); return { colours: [selectedValue ? CATEGORY_COLOURS[colourSlots.journal.get(paper.journal) ?? 0] : OTHER_COLOUR], applicable: true }; }
    if (lens === 'keywords') { if (!paper.keywords.length) return { colours: [], applicable: false }; const matches = paper.keywords.filter((value) => selectedValues.keywords.has(value)); return { colours: matches.length ? matches.map((value) => CATEGORY_COLOURS[colourSlots.keywords.get(value) ?? 0]) : [OTHER_COLOUR], applicable: true }; }
    if (!paper.authors.length) return { colours: [], applicable: false };
    const value = Math.log1p(paper.coauthor_count) / Math.log1p(maxCoauthor);
    return { colours: [interpolateStops(value, ['#274060', '#00A9B7', '#FFE34D'])], applicable: true };
  }, [agreementScale, colourSlots, lens, maxCoauthor, selectedValues, topicColours, topicFilter]);

  useEffect(() => { if (!hostRef.current) return; const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(360, Math.floor(entry.contentRect.height)) })); observer.observe(hostRef.current); return () => observer.disconnect(); }, []);
  const project = useCallback((paper: PaperPoint) => { const padding = 30; const [minX, maxX] = data.geometry.bounds.x; const [minY, maxY] = data.geometry.bounds.y; const baseX = padding + ((paper.x - minX) / (maxX - minX)) * (size.width - padding * 2); const baseY = padding + (1 - (paper.y - minY) / (maxY - minY)) * (size.height - padding * 2); return { x: (baseX - size.width / 2) * transform.scale + size.width / 2 + transform.tx, y: (baseY - size.height / 2) * transform.scale + size.height / 2 + transform.ty }; }, [data.geometry.bounds, size, transform]);
  const screenPoints = useMemo<ScreenPoint[]>(() => data.points.map((paper) => ({ paper, ...project(paper) })), [data.points, project]);
  const pointById = useMemo(() => new Map(screenPoints.map((point) => [point.paper.id, point])), [screenPoints]);
  const pickGrid = useMemo(() => { const grid = new Map<string, ScreenPoint[]>(); for (const point of screenPoints) { const key = `${Math.floor(point.x / PICK_CELL)}:${Math.floor(point.y / PICK_CELL)}`; const bucket = grid.get(key); if (bucket) bucket.push(point); else grid.set(key, [point]); } return grid; }, [screenPoints]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio); canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`; const context = canvas.getContext('2d'); if (!context) return; context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, size.width, size.height);
    const hasRelation = Boolean(selected) && ['publisher', 'journal', 'keywords', 'coauthorship'].includes(lens);
    const dimsUnrelated = hasRelation && lens !== 'coauthorship';
    const selectedScreen = selected ? pointById.get(selected.id) : null;
    const radius = Math.min(3.8, 1.8 + Math.log2(Math.max(1, transform.scale)) * 0.55);
    for (const point of screenPoints) { if (point.x < -8 || point.y < -8 || point.x > size.width + 8 || point.y > size.height + 8) continue; const mark = markFor(point.paper); const connected = !dimsUnrelated || point.paper.id === selected?.id || relation.all.has(point.paper.id); const alpha = mark.applicable && connected ? 0.96 : mark.applicable ? 0.2 : 0.14; drawMark(context, point.x, point.y, mark.colours.length > 1 ? radius + 0.7 : radius, mark.colours, alpha); if (hasRelation && relation.all.has(point.paper.id)) { context.beginPath(); context.arc(point.x, point.y, radius + 1.7, 0, Math.PI * 2); context.strokeStyle = 'rgba(255,255,255,.82)'; context.lineWidth = 1; context.stroke(); } }
    if (selectedScreen) { context.beginPath(); context.arc(selectedScreen.x, selectedScreen.y, radius + 5, 0, Math.PI * 2); context.strokeStyle = '#FFFFFF'; context.lineWidth = 2; context.stroke(); context.beginPath(); context.arc(selectedScreen.x, selectedScreen.y, radius + 2, 0, Math.PI * 2); context.strokeStyle = 'rgba(9,12,16,.95)'; context.lineWidth = 1.5; context.stroke(); const mark = markFor(selected!); drawMark(context, selectedScreen.x, selectedScreen.y, radius + 0.8, mark.colours.length ? mark.colours : ['#FFFFFF'], 1); }
  }, [lens, markFor, pointById, relation, screenPoints, selected, size, transform.scale]);

  const nearest = useCallback((x: number, y: number) => { let best: ScreenPoint | null = null; let bestDistance = 11; const cellX = Math.floor(x / PICK_CELL); const cellY = Math.floor(y / PICK_CELL); for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (const point of pickGrid.get(`${cellX + dx}:${cellY + dy}`) ?? []) { const distance = Math.hypot(point.x - x, point.y - y); if (distance < bestDistance) { bestDistance = distance; best = point; } } return best; }, [pickGrid]);
  const reset = useCallback(() => { setTransform({ scale: 1, tx: 0, ty: 0 }); setHovered(null); }, []);

  return (
    <div ref={hostRef} className="relative h-full min-h-[360px] w-full overflow-hidden bg-[var(--map-background)]">
      <canvas ref={canvasRef} aria-label={`Semantic map of ${data.cohort.n.toLocaleString()} papers`} className="block touch-none cursor-grab active:cursor-grabbing" onDoubleClick={reset} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, tx: transform.tx, ty: transform.ty, moved: false }; }} onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const x = event.clientX - bounds.left; const y = event.clientY - bounds.top; if (dragRef.current) { const dx = event.clientX - dragRef.current.x; const dy = event.clientY - dragRef.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true; setTransform((current) => ({ ...current, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy })); setHovered(null); } else { const next = nearest(x, y); setHovered((current) => current?.paper.id === next?.paper.id ? current : next); } }} onPointerUp={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (!dragRef.current?.moved) onSelect(nearest(event.clientX - bounds.left, event.clientY - bounds.top)?.paper ?? null); dragRef.current = null; }} onPointerLeave={() => { dragRef.current = null; setHovered(null); }} onPointerCancel={() => { dragRef.current = null; setHovered(null); }} onWheel={(event) => { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); const x = event.clientX - bounds.left; const y = event.clientY - bounds.top; setTransform((current) => { const nextScale = Math.max(0.7, Math.min(8, current.scale * Math.exp(-event.deltaY * 0.0012))); const factor = nextScale / current.scale; return { scale: nextScale, tx: x - size.width / 2 - (x - size.width / 2 - current.tx) * factor, ty: y - size.height / 2 - (y - size.height / 2 - current.ty) * factor }; }); }} />
      <div className="absolute bottom-4 left-4 flex items-center gap-1 border border-white/15 bg-[#11151a]/94 p-1 text-white shadow-sm backdrop-blur-sm"><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Zoom in" onClick={() => setTransform((current) => ({ ...current, scale: Math.min(8, current.scale * 1.25) }))} />}><Plus /></TooltipTrigger><TooltipContent>Zoom in</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Zoom out" onClick={() => setTransform((current) => ({ ...current, scale: Math.max(0.7, current.scale / 1.25) }))} />}><Minus /></TooltipTrigger><TooltipContent>Zoom out</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Reset map" onClick={reset} />}><LocateFixed /></TooltipTrigger><TooltipContent>Reset view</TooltipContent></Tooltip></div>
      {hovered ? <div className="pointer-events-none absolute z-10 max-w-[280px] border border-white/20 bg-[#11151a]/96 px-3 py-2 text-xs text-white shadow-md" style={{ left: Math.max(8, Math.min(hovered.x + 12, size.width - 292)), top: Math.max(8, hovered.y - 46) }}><p className="line-clamp-2 font-medium leading-snug">{hovered.paper.title}</p><p className="mt-1 truncate text-white/60">{hovered.paper.journal || hovered.paper.publisher}</p></div> : null}
    </div>
  );
}
