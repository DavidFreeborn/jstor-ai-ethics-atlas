'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Maximize, Minus, Plus, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ColourSlots, FacetSelections } from './papers-workspace';
import {
  AGREEMENT_STOPS,
  CATEGORY_COLOURS,
  OTHER_COLOUR,
} from '@/lib/atlas-visual';
import type { MapData, PaperLens, PaperPoint } from '@/lib/atlas-types';
import { decodeHtmlEntities } from '@/lib/display-text';
import { normalise3D, type Vec3 } from '@/lib/map-camera';
import {
  PaperRenderer,
  type HoverPoint,
  type PaperMark,
} from '@/lib/paper-renderer';
import type { PaperGroup } from '@/lib/paper-selection';

const parseHex = (hex: string) =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
function interpolateStops(value: number, stops: readonly string[]) {
  const position = Math.max(0, Math.min(1, value)) * (stops.length - 1),
    index = Math.min(stops.length - 2, Math.floor(position)),
    fraction = position - index;
  const left = parseHex(stops[index]),
    right = parseHex(stops[index + 1]);
  return `rgb(${left.map((c, i) => Math.round(c + (right[i] - c) * fraction)).join(',')})`;
}

export function PaperMap({
  data,
  lens,
  selected,
  onSelect,
  group,
  onGroup,
  selections,
  colourSlots,
}: {
  data: MapData;
  lens: PaperLens;
  selected: PaperPoint | null;
  onSelect: (paper: PaperPoint | null) => void;
  group: PaperGroup | null;
  onGroup: (group: PaperGroup) => void;
  selections: FacetSelections;
  colourSlots: ColourSlots;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    rendererRef = useRef<PaperRenderer | null>(null);
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d'),
    [coordinates, setCoordinates] = useState<Vec3[] | null>(null);
  const [projectionError, setProjectionError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [boxMode, setBoxMode] = useState(false);
  const [hovered, setHovered] = useState<HoverPoint | null>(null),
    [rendererError, setRendererError] = useState<Error | null>(null);
  const topics =
    lens === 'bertopic_reduced'
      ? data.topics.bertopic_reduced
      : lens === 'lda'
        ? data.topics.lda
        : data.topics.bertopic;
  const topicColours = useMemo(
    () => new Map(topics.map((t) => [t.id, t.colour])),
    [topics],
  );
  const selectedValues = useMemo(
    () => ({
      publisher: new Set(selections.publisher),
      journal: new Set(selections.journal),
      keywords: new Set(selections.keywords),
    }),
    [selections],
  );
  const maxCoauthor = useMemo(
    () => Math.max(1, ...data.points.map((p) => p.coauthor_count)),
    [data.points],
  );
  const agreementScale = useMemo(() => {
    const values = data.points
        .map((p) => p.neighbour_agreement)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b),
      ranks = new Map<number, number>();
    for (let start = 0; start < values.length;) {
      let end = start;
      while (end + 1 < values.length && values[end + 1] === values[start])
        end++;
      ranks.set(
        values[start],
        values.length > 1 ? (start + end) / 2 / (values.length - 1) : 0.5,
      );
      start = end + 1;
    }
    return ranks;
  }, [data.points]);
  // Encodings change with lenses, not camera movement. Multi-keyword glyphs preserve every selected membership.
  const marks = useMemo<PaperMark[]>(
    () =>
      data.points.map((paper) => {
        if (lens === 'catalogue') return { colours: ['#ddf6ff'] };
        if (
          lens === 'bertopic' ||
          lens === 'bertopic_reduced' ||
          lens === 'lda'
        ) {
          const value =
            lens === 'bertopic'
              ? paper.bertopic
              : lens === 'bertopic_reduced'
                ? paper.bertopic_reduced
                : paper.lda_topic;
          return value === undefined
            ? { colours: [], missing: true }
            : { colours: [topicColours.get(value) ?? '#d8dee9'] };
        }
        if (lens === 'agreement')
          return paper.neighbour_agreement === null
            ? { colours: [], missing: true }
            : {
                colours: [
                  interpolateStops(
                    agreementScale.get(paper.neighbour_agreement) ?? 0,
                    AGREEMENT_STOPS,
                  ),
                ],
              };
        if (lens === 'publisher' || lens === 'journal') {
          const value = paper[lens];
          return !value
            ? { colours: [], missing: true }
            : {
                colours: [
                  selectedValues[lens].has(value)
                    ? CATEGORY_COLOURS[colourSlots[lens].get(value) ?? 0]
                    : OTHER_COLOUR,
                ],
              };
        }
        if (lens === 'keywords') {
          if (!paper.keywords.length) return { colours: [], missing: true };
          const matches = paper.keywords.filter((k) =>
            selectedValues.keywords.has(k),
          );
          return {
            colours: matches.length
              ? matches.map(
                  (k) => CATEGORY_COLOURS[colourSlots.keywords.get(k) ?? 0],
                )
              : [OTHER_COLOUR],
          };
        }
        return !paper.authors.length
          ? { colours: [], missing: true }
          : {
              colours: [
                interpolateStops(
                  Math.log1p(paper.coauthor_count) / Math.log1p(maxCoauthor),
                  ['#274060', '#00a9b7', '#ffe34d'],
                ),
              ],
            };
      }),
    [
      agreementScale,
      colourSlots,
      data.points,
      lens,
      maxCoauthor,
      selectedValues,
      topicColours,
    ],
  );
  const visual = { marks, group, selectedId: selected?.id ?? null };
  const callbacks = {
    select: onSelect,
    hover: setHovered,
    box: (ids: Set<string>) => {
      onGroup({ ids, label: 'Spatial selection', sourceLens: 'box' });
      setBoxMode(false);
    },
    error: setRendererError,
  };
  const latest = useRef({ visual, callbacks });
  useLayoutEffect(() => {
    latest.current = { visual, callbacks };
    rendererRef.current?.setVisual(visual, callbacks);
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new PaperRenderer(
      canvas,
      data,
      latest.current.visual,
      latest.current.callbacks,
    );
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [data]);
  useEffect(() => {
    rendererRef.current?.setDimension(dimension, coordinates);
  }, [coordinates, dimension]);
  useEffect(() => {
    rendererRef.current?.setBoxMode(boxMode);
  }, [boxMode]);
  useEffect(() => {
    if (dimension !== '3d' || coordinates) return;
    const controller = new AbortController();
    fetch(new URL('data/projection-3d.json', document.baseURI), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`3D data returned ${response.status}`);
        return response.json() as Promise<{
          ids: string[];
          coordinates: Vec3[];
        }>;
      })
      .then((payload) => {
        if (
          payload.ids?.length !== data.points.length ||
          payload.coordinates?.length !== data.points.length ||
          payload.ids.some((id, i) => id !== data.points[i].id) ||
          payload.coordinates.some(
            (p) =>
              !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite),
          )
        )
          throw new Error('3D coordinates do not match the catalogue.');
        if (!controller.signal.aborted)
          setCoordinates(normalise3D(payload.coordinates));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setProjectionError(error.message);
      });
    return () => controller.abort();
  }, [attempt, coordinates, data.points, dimension]);
  if (rendererError) throw rendererError;
  const navigate = (action: string) => {
    if (action === 'Zoom in') rendererRef.current?.zoom(1.25);
    if (action === 'Zoom out') rendererRef.current?.zoom(1 / 1.25);
    if (action === 'Reset view') rendererRef.current?.reset();
    if (action === 'Fit all') rendererRef.current?.reset(true);
  };
  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden bg-[var(--map-background)]">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={`${dimension === '3d' && coordinates ? '3D' : '2D'} semantic map of ${data.cohort.n.toLocaleString()} papers`}
        aria-describedby="map-keyboard-help"
        className="block h-full w-full touch-none cursor-grab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-200"
      />
      <span id="map-keyboard-help" className="sr-only">
        Plus and minus zoom. Arrow keys pan in 2D and rotate in 3D; Shift and
        arrows pan in 3D. Home resets; Shift Home fits all. Drag rotates in 3D;
        Shift-drag or two fingers pan. Use Select area to select papers within a
        rectangle.
      </span>
      <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-32px)] flex-wrap items-center gap-1 border border-white/20 bg-[#11151a] p-1 text-white">
        <div
          className="mr-1 flex border-r border-white/20 pr-2"
          aria-label="Map dimension"
        >
          {(['2d', '3d'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={dimension === value}
              className={`min-h-8 px-2.5 text-sm font-medium ${dimension === value ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}
              onClick={() => {
                setProjectionError('');
                setDimension(value);
              }}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
        {[
          { label: 'Zoom in', icon: Plus },
          { label: 'Zoom out', icon: Minus },
          { label: 'Reset view', icon: LocateFixed },
          { label: 'Fit all', icon: Maximize },
        ].map(({ label, icon: Icon }) => (
          <Tooltip key={label}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                  aria-label={label}
                  onClick={() => navigate(label)}
                />
              }
            >
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className={`rounded-none border-l border-white/20 text-white hover:bg-white/10 hover:text-white ${boxMode ? 'bg-white/15' : ''}`}
          aria-pressed={boxMode}
          onClick={() => setBoxMode(!boxMode)}
        >
          <Scan />
          Select area
        </Button>
      </div>
      {dimension === '3d' && !coordinates ? (
        <output className="absolute bottom-20 left-4 max-w-[calc(100%-32px)] border border-white/20 bg-[#11151a] px-3 py-2 text-sm text-white">
          {projectionError ? (
            <>
              {projectionError}{' '}
              <button
                className="ml-2 underline"
                onClick={() => {
                  setProjectionError('');
                  setAttempt((a) => a + 1);
                }}
              >
                Retry
              </button>{' '}
              <button
                className="ml-2 underline"
                onClick={() => setDimension('2d')}
              >
                Use 2D
              </button>
            </>
          ) : (
            'Loading 3D projection…'
          )}
        </output>
      ) : null}
      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] border border-white/20 bg-[#11151a] px-3 py-2 text-xs text-white"
          style={{
            left: Math.max(8, Math.min(hovered.x + 12, hovered.width - 292)),
            top: Math.max(8, Math.min(hovered.y - 46, hovered.height - 130)),
          }}
        >
          <p className="line-clamp-2 font-medium leading-snug">
            {decodeHtmlEntities(hovered.paper.title)}
          </p>
          <p className="mt-1 truncate text-white/60">
            {hovered.paper.journal || hovered.paper.publisher}
          </p>
        </div>
      ) : null}
    </div>
  );
}
