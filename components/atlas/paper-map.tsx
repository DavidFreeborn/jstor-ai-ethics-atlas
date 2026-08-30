'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { MapData, PaperLens, PaperPoint, TopicSummary } from '@/lib/atlas-types';

type Transform = { scale: number; tx: number; ty: number };
type ScreenPoint = { paper: PaperPoint; x: number; y: number };

const PROVENANCE_COLOURS = {
  core: '#36C5F0',
  reassigned: '#FFB000',
  outlier: '#D8DEE9',
};

const PICK_CELL = 24;

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function ramp(value: number | null, low = '#6B7280', high = '#67E8F9') {
  if (value === null || !Number.isFinite(value)) return '#9CA3AF';
  const t = Math.max(0, Math.min(1, value));
  const parse = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const a = parse(low);
  const b = parse(high);
  const rgb = a.map((channel, index) => Math.round(channel + (b[index] - channel) * t));
  return `rgb(${rgb.join(',')})`;
}

function paperColour(
  paper: PaperPoint,
  lens: PaperLens,
  topicColours: Map<number, string>,
) {
  switch (lens) {
    case 'bertopic':
      return topicColours.get(paper.bertopic) ?? '#D8DEE9';
    case 'bertopic_reduced':
      return topicColours.get(paper.bertopic_reduced) ?? '#D8DEE9';
    case 'provenance':
      return PROVENANCE_COLOURS[paper.provenance];
    case 'lda':
      return paper.lda ? topicColours.get(paper.lda.topic) ?? '#D8DEE9' : '#6B7280';
    case 'lda_dominance':
      return ramp(paper.lda?.dominance ?? null, '#64748B', '#2DFF9A');
    case 'alignment':
      return ramp(paper.alignment, '#64748B', '#FF5FD2');
  }
}

export function PaperMap({
  data,
  lens,
  selected,
  onSelect,
  topicFilter,
}: {
  data: MapData;
  lens: PaperLens;
  selected: PaperPoint | null;
  onSelect: (paper: PaperPoint | null) => void;
  topicFilter: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [hovered, setHovered] = useState<ScreenPoint | null>(null);

  const topics: TopicSummary[] =
    lens === 'bertopic_reduced'
      ? data.topics.bertopic_reduced
      : lens === 'lda'
        ? data.topics.lda
        : data.topics.bertopic;
  const topicColours = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic.colour])),
    [topics],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  const project = useCallback(
    (paper: PaperPoint) => {
      const padding = 30;
      const [minX, maxX] = data.geometry.bounds.x;
      const [minY, maxY] = data.geometry.bounds.y;
      const baseX = padding + ((paper.x - minX) / (maxX - minX)) * (size.width - padding * 2);
      const baseY = padding + (1 - (paper.y - minY) / (maxY - minY)) * (size.height - padding * 2);
      return {
        x: (baseX - size.width / 2) * transform.scale + size.width / 2 + transform.tx,
        y: (baseY - size.height / 2) * transform.scale + size.height / 2 + transform.ty,
      };
    },
    [data.geometry.bounds, size, transform],
  );

  const screenPoints = useMemo<ScreenPoint[]>(
    () => data.points.map((paper) => ({ paper, ...project(paper) })),
    [data.points, project],
  );
  const pointById = useMemo(
    () => new Map(screenPoints.map((point) => [point.paper.id, point])),
    [screenPoints],
  );
  const pickGrid = useMemo(() => {
    const grid = new Map<string, ScreenPoint[]>();
    for (const point of screenPoints) {
      const key = `${Math.floor(point.x / PICK_CELL)}:${Math.floor(point.y / PICK_CELL)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(point); else grid.set(key, [point]);
    }
    return grid;
  }, [screenPoints]);

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
    context.clearRect(0, 0, size.width, size.height);

    const filtered = data.points.filter((paper) => {
      if (topicFilter === null) return true;
      if (lens === 'lda') return paper.lda?.topic === topicFilter;
      if (lens === 'bertopic_reduced') return paper.bertopic_reduced === topicFilter;
      return paper.bertopic === topicFilter;
    });
    const filteredIds = topicFilter === null ? null : new Set(filtered.map((paper) => paper.id));

    for (const point of screenPoints) {
      const paper = point.paper;
      if (point.x < -8 || point.y < -8 || point.x > size.width + 8 || point.y > size.height + 8) continue;
      const active = filteredIds === null || filteredIds.has(paper.id);
      const colour = paperColour(paper, lens, topicColours);
      context.beginPath();
      context.arc(point.x, point.y, active ? 2.25 : 1.5, 0, Math.PI * 2);
      context.fillStyle = active ? hexToRgba(colour.startsWith('#') ? colour : '#66757D', 0.95) : 'rgba(203,213,225,.08)';
      if (!colour.startsWith('#')) context.fillStyle = active ? colour : 'rgba(203,213,225,.08)';
      context.fill();
    }

    if (selected) {
      const point = pointById.get(selected.id);
      if (!point) return;
      context.beginPath();
      context.arc(point.x, point.y, 7.5, 0, Math.PI * 2);
      context.strokeStyle = '#FFFFFF';
      context.lineWidth = 2;
      context.stroke();
      context.beginPath();
      context.arc(point.x, point.y, 3, 0, Math.PI * 2);
      context.fillStyle = paperColour(selected, lens, topicColours);
      context.fill();
    }
  }, [data.points, lens, pointById, screenPoints, selected, size, topicColours, topicFilter]);

  const nearest = useCallback(
    (x: number, y: number) => {
      let best: ScreenPoint | null = null;
      let bestDistance = 11;
      const cellX = Math.floor(x / PICK_CELL);
      const cellY = Math.floor(y / PICK_CELL);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const point of pickGrid.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = point;
            }
          }
        }
      }
      return best;
    },
    [pickGrid],
  );

  const reset = useCallback(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 });
    setHovered(null);
  }, []);

  return (
    <div ref={hostRef} className="relative h-full min-h-[360px] w-full overflow-hidden bg-[var(--map-background)]">
      <canvas
        ref={canvasRef}
        aria-label={`Semantic map of ${data.cohort.n.toLocaleString()} papers. Use search or the results list for keyboard selection.`}
        className="block touch-none cursor-grab active:cursor-grabbing"
        onDoubleClick={reset}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            tx: transform.tx,
            ty: transform.ty,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - bounds.left;
          const y = event.clientY - bounds.top;
          if (dragRef.current) {
            const dx = event.clientX - dragRef.current.x;
            const dy = event.clientY - dragRef.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
            setTransform((current) => ({ ...current, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
            setHovered(null);
          } else {
            const next = nearest(x, y);
            setHovered((current) => current?.paper.id === next?.paper.id ? current : next);
          }
        }}
        onPointerUp={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (!dragRef.current?.moved) onSelect(nearest(event.clientX - bounds.left, event.clientY - bounds.top)?.paper ?? null);
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          dragRef.current = null;
          setHovered(null);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setHovered(null);
        }}
        onWheel={(event) => {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - bounds.left;
          const y = event.clientY - bounds.top;
          setTransform((current) => {
            const nextScale = Math.max(0.7, Math.min(8, current.scale * Math.exp(-event.deltaY * 0.0012)));
            const factor = nextScale / current.scale;
            return {
              scale: nextScale,
              tx: x - size.width / 2 - (x - size.width / 2 - current.tx) * factor,
              ty: y - size.height / 2 - (y - size.height / 2 - current.ty) * factor,
            };
          });
        }}
      />

      <div className="absolute bottom-4 left-4 flex items-center gap-1 border border-white/15 bg-[#11151a]/94 p-1 text-white shadow-sm backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Zoom in" onClick={() => setTransform((current) => ({ ...current, scale: Math.min(8, current.scale * 1.25) }))} />}>
            <Plus />
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Zoom out" onClick={() => setTransform((current) => ({ ...current, scale: Math.max(0.7, current.scale / 1.25) }))} />}>
            <Minus />
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" aria-label="Reset map" onClick={reset} />}>
            <LocateFixed />
          </TooltipTrigger>
          <TooltipContent>Reset view</TooltipContent>
        </Tooltip>
        <span className="px-1.5 font-mono text-[10px] tabular-nums text-white/60">{transform.scale.toFixed(1)}×</span>
      </div>

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] border border-white/20 bg-[#11151a]/96 px-3 py-2 text-xs text-white shadow-md"
          style={{ left: Math.min(hovered.x + 12, size.width - 292), top: Math.max(8, hovered.y - 46) }}
        >
          <p className="line-clamp-2 font-medium leading-snug">{hovered.paper.title}</p>
          <p className="mt-1 truncate text-white/60">{hovered.paper.journal || 'Journal unavailable'}</p>
        </div>
      ) : null}
    </div>
  );
}
