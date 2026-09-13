'use client';

import { useEffect, useMemo, useState } from 'react';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';

import { PaperMap } from '@/components/atlas/paper-map';
import { DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  CATEGORY_COLOURS,
  normaliseText,
  OTHER_COLOUR,
} from '@/lib/atlas-visual';
import type {
  FacetValue,
  MapData,
  PaperLens,
  PaperPoint,
  TopicSummary,
} from '@/lib/atlas-types';
import { decodeHtmlEntities } from '@/lib/display-text';
import { facetGroup, topicGroup, type PaperGroup } from '@/lib/paper-selection';
import {
  abstractMap,
  subsetMap,
  validateAbstractPositions,
  validateFulltextPositions,
  validateUnionPositions,
  verifyPositionBytes,
  type AbstractPositions,
  type PositionSource,
} from '@/lib/paper-positions';
import unionRelease from '@/lib/union-release.json';
import fulltextRelease from '@/lib/fulltext-release.json';
import textAvailability from '@/lib/text-availability.json';
import {
  matchesText,
  textFilterCounts,
  TEXT_FILTERS,
  type TextFilter,
} from '@/lib/paper-text-filter';

const availableText = {
  abstracts: new Set(
    textAvailability.abstracts.map((id) => textAvailability.id_prefix + id),
  ),
  fulltext: new Set(
    textAvailability.fulltext.map((id) => textAvailability.id_prefix + id),
  ),
};

export type RelationState = { all: Set<string>; shared: Map<string, string[]> };
export type FacetSelections = Record<
  'publisher' | 'journal' | 'keywords',
  string[]
>;
export type ColourSlots = Record<
  'publisher' | 'journal' | 'keywords',
  Map<string, number>
>;

const LENSES: Array<{ id: PaperLens; label: string }> = [
  { id: 'catalogue', label: 'All papers' },
  { id: 'bertopic', label: 'BERTopic — 26 topics' },
  { id: 'bertopic_reduced', label: 'BERTopic — 9 topics' },
  { id: 'lda', label: 'LDA — 37 topics' },
  { id: 'agreement', label: 'Neighbourhood agreement' },
  { id: 'publisher', label: 'Publisher' },
  { id: 'journal', label: 'Journal' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'coauthorship', label: 'Coauthorship connections' },
];

function activeTopics(data: MapData, lens: PaperLens): TopicSummary[] {
  if (lens === 'bertopic_reduced') return data.topics.bertopic_reduced;
  if (lens === 'lda') return data.topics.lda;
  return data.topics.bertopic;
}

function coverage(data: MapData, lens: PaperLens) {
  if (lens === 'bertopic' || lens === 'bertopic_reduced')
    return data.cohort.coverage.bertopic;
  if (lens === 'lda') return data.cohort.coverage.lda;
  if (lens === 'agreement') return data.cohort.coverage.neighbour_agreement;
  if (lens === 'publisher') return data.cohort.coverage.publisher;
  if (lens === 'journal') return data.cohort.coverage.journal;
  if (lens === 'keywords') return data.cohort.coverage.keywords;
  if (lens === 'coauthorship') return data.cohort.coverage.authors;
  return data.cohort.n;
}

function facetFor(data: MapData, lens: PaperLens): FacetValue[] {
  if (lens === 'publisher') return data.facets.publishers;
  if (lens === 'journal') return data.facets.journals;
  return data.facets.keywords;
}

function FacetControls({
  values,
  selected,
  slots,
  maximum,
  onToggle,
  onReset,
  onSelectGroup,
}: {
  values: FacetValue[];
  selected: string[];
  slots: Map<string, number>;
  maximum: number;
  onToggle: (value: string) => void;
  onReset: () => void;
  onSelectGroup: (values: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const needle = normaliseText(query);
    return values
      .filter((item) => !needle || normaliseText(item.value).includes(needle))
      .sort(
        (a, b) =>
          Number(selectedSet.has(b.value)) - Number(selectedSet.has(a.value)) ||
          b.count - a.count,
      )
      .slice(0, 120);
  }, [query, selectedSet, values]);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {selected.length} / {maximum}
        </span>
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={onReset}
        >
          Top 10
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 border-y border-border py-1.5 text-xs text-muted-foreground">
        <span className="size-2" style={{ backgroundColor: OTHER_COLOUR }} />
        <span>Other values</span>
      </div>
      <button
        className="mt-2 text-left text-xs text-primary underline underline-offset-2"
        onClick={() => onSelectGroup(selected)}
      >
        Select papers in coloured values
      </button>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search lens values"
          placeholder="Search"
          className="h-8 rounded-none pl-7 text-xs"
        />
      </div>
      <ScrollArea className="mt-2 min-h-0 flex-1 pr-2">
        <div className="space-y-px pb-3">
          {visible.map((item) => {
            const checked = selectedSet.has(item.value);
            const slot = slots.get(item.value) ?? 0;
            return (
              <div
                key={item.value}
                className={`grid grid-cols-[16px_8px_minmax(0,1fr)] items-center gap-2 px-1 py-1.5 text-sm ${checked ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
              >
                <Checkbox
                  checked={checked}
                  disabled={!checked && selected.length >= maximum}
                  onCheckedChange={() => onToggle(item.value)}
                  aria-label={`Colour ${item.value}`}
                />
                <span
                  className="size-2"
                  style={{
                    backgroundColor: checked
                      ? CATEGORY_COLOURS[slot]
                      : OTHER_COLOUR,
                  }}
                />
                <button
                  className="flex min-w-0 items-center gap-2 text-left hover:text-primary"
                  aria-label={`Select ${item.value} papers`}
                  onClick={() => onSelectGroup([item.value])}
                >
                  <span className="min-w-0 flex-1 truncate" title={item.value}>
                    {item.value}
                  </span>
                  <span className="font-mono text-xs tabular-nums opacity-70">
                    {item.count}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function TextFilterControl({
  value,
  counts,
  onChange,
}: {
  value: TextFilter;
  counts: Record<TextFilter, number>;
  onChange: (value: TextFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = TEXT_FILTERS.find((item) => item.value === value)!.label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            aria-label={`Text availability: ${label}`}
            className={`mt-2 h-8 w-full justify-start gap-2 rounded-none px-2 text-sm shadow-none ${value !== 'all' ? 'border-primary text-primary' : ''}`}
          />
        }
      >
        <Filter className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">Text: {label}</span>
        <span className="ml-auto font-mono text-xs tabular-nums">
          {counts[value].toLocaleString()}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[264px] max-w-[calc(100vw-24px)] gap-0 rounded-none p-1"
        aria-label="Text availability filter"
      >
        <fieldset className="min-w-0" aria-label="Available text">
          {TEXT_FILTERS.map((item) => (
            <button
              key={item.value}
              aria-pressed={value === item.value}
              className={`flex min-h-9 w-full items-center justify-between gap-3 border-l-2 px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === item.value ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:bg-muted'}`}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              <span className="font-mono text-xs tabular-nums">
                {counts[item.value].toLocaleString()}
              </span>
            </button>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

function LensControls({
  data,
  positions,
  textFilter,
  textCounts,
  onTextFilter,
  catalogueCount,
  abstractCount,
  onPositions,
  positionError,
  onRetryPositions,
  lens,
  topicFilter,
  selections,
  colourSlots,
  onLens,
  onTopic,
  onToggleFacet,
  onResetFacet,
  onFacetGroup,
}: {
  data: MapData;
  positions: PositionSource;
  textFilter: TextFilter;
  textCounts: Record<TextFilter, number>;
  onTextFilter: (value: TextFilter) => void;
  catalogueCount: number;
  abstractCount: number;
  onPositions: (source: PositionSource) => void;
  positionError: string;
  onRetryPositions: () => void;
  lens: PaperLens;
  topicFilter: number | null;
  selections: FacetSelections;
  colourSlots: ColourSlots;
  onLens: (lens: PaperLens) => void;
  onTopic: (topic: number | null) => void;
  onToggleFacet: (
    lens: 'publisher' | 'journal' | 'keywords',
    value: string,
  ) => void;
  onResetFacet: (lens: 'publisher' | 'journal' | 'keywords') => void;
  onFacetGroup: (
    lens: 'publisher' | 'journal' | 'keywords',
    values: string[],
  ) => void;
}) {
  const topics = [...activeTopics(data, lens)].sort(
    (a, b) => b.count - a.count,
  );
  const facetLens =
    lens === 'publisher' || lens === 'journal' || lens === 'keywords'
      ? lens
      : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <label className="grid gap-2">
          <span className="data-kicker">Positions</span>
          <select
            aria-label="Positions"
            value={positions}
            onChange={(event) =>
              onPositions(event.target.value as PositionSource)
            }
            className="h-9 w-full min-w-0 rounded-none border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:px-1 max-lg:text-[13px] max-sm:px-2 max-sm:text-sm"
          >
            <option value="titles">
              Titles ({catalogueCount.toLocaleString()} papers)
            </option>
            <option value="abstracts">
              Abstracts ({abstractCount.toLocaleString()} papers)
            </option>
            <option value="fulltext">
              Full text ({fulltextRelease.count.toLocaleString()} papers)
            </option>
            <option
              value="union"
              disabled={!/^[a-f0-9]{64}$/.test(unionRelease.sha256)}
            >
              Abstracts ∪ full text ({unionRelease.count.toLocaleString()}{' '}
              papers)
            </option>
          </select>
        </label>
        <TextFilterControl
          value={textFilter}
          counts={textCounts}
          onChange={onTextFilter}
        />
        {positionError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {positionError}{' '}
            <button className="underline" onClick={onRetryPositions}>
              Retry positions
            </button>
          </p>
        ) : null}
      </div>
      <div className="border-b border-border px-4 py-3">
        <p className="data-kicker">Lens</p>
        <div className="mt-2 space-y-0.5">
          {LENSES.map((item) => (
            <button
              key={item.id}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 border-l-2 px-2 py-1.5 text-left text-sm font-medium leading-4 transition-colors ${lens === item.id ? 'border-primary bg-background text-foreground' : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
              onClick={() => onLens(item.id)}
            >
              <span>{item.label}</span>
              <span className="font-mono text-xs tabular-nums opacity-65">
                {coverage(data, item.id).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>
      {lens === 'bertopic' || lens === 'bertopic_reduced' || lens === 'lda' ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="data-kicker">Topics</p>
            {topicFilter !== null ? (
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => onTopic(null)}
              >
                Show all
              </button>
            ) : null}
          </div>
          <ScrollArea className="mt-2 min-h-0 flex-1 pr-2">
            <div className="space-y-px pb-3">
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  className={`grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 px-1 py-1.5 text-left text-sm ${topicFilter === topic.id ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
                  onClick={() =>
                    onTopic(topicFilter === topic.id ? null : topic.id)
                  }
                >
                  <span
                    className="size-2"
                    style={{ backgroundColor: topic.colour }}
                  />
                  <span className="truncate" title={topic.label}>
                    {topic.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums opacity-70">
                    {topic.count}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : null}
      {facetLens ? (
        <FacetControls
          key={facetLens}
          values={facetFor(data, facetLens)}
          selected={selections[facetLens]}
          slots={colourSlots[facetLens]}
          maximum={data.facets.maximum_selection}
          onToggle={(value) => onToggleFacet(facetLens, value)}
          onReset={() => onResetFacet(facetLens)}
          onSelectGroup={(values) => onFacetGroup(facetLens, values)}
        />
      ) : null}
      {lens === 'agreement' ? (
        <div className="px-4 py-4">
          <div className="agreement-ramp-v3 h-2 w-full" />
          <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
            <span>lower</span>
            <span>median</span>
            <span>higher</span>
          </div>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">
            BERTopic–LDA overlap in 30 abstract-based neighbours.
          </p>
        </div>
      ) : null}
      {lens === 'coauthorship' ? (
        <div className="px-4 py-4">
          <div className="coauthor-ramp h-2 w-full" />
          <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
            <span>none</span>
            <span>more direct links</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildInvertedIndex(data: MapData) {
  const publisher = new Map<string, Set<string>>();
  const journal = new Map<string, Set<string>>();
  const keywords = new Map<string, Set<string>>();
  const authors = new Map<string, Set<string>>();
  const add = (index: Map<string, Set<string>>, value: string, id: string) => {
    if (!value) return;
    const bucket = index.get(value);
    if (bucket) bucket.add(id);
    else index.set(value, new Set([id]));
  };
  for (const paper of data.points) {
    add(publisher, paper.publisher, paper.id);
    add(journal, paper.journal, paper.id);
    paper.keywords.forEach((value) => add(keywords, value, paper.id));
    paper.authors.forEach((value) => add(authors, value, paper.id));
  }
  return { publisher, journal, keywords, authors };
}

function buildRelation(
  selected: PaperPoint | null,
  lens: PaperLens,
  selections: FacetSelections,
  index: ReturnType<typeof buildInvertedIndex>,
): RelationState {
  const empty = { all: new Set<string>(), shared: new Map<string, string[]>() };
  if (
    !selected ||
    !['publisher', 'journal', 'keywords', 'coauthorship'].includes(lens)
  )
    return empty;
  let values: string[] = [];
  let source: Map<string, Set<string>>;
  if (lens === 'publisher') {
    values = selected.publisher ? [selected.publisher] : [];
    source = index.publisher;
  } else if (lens === 'journal') {
    values = selected.journal ? [selected.journal] : [];
    source = index.journal;
  } else if (lens === 'keywords') {
    const active = new Set(selections.keywords);
    values = selected.keywords.filter((value) => active.has(value));
    source = index.keywords;
  } else {
    values = selected.authors;
    source = index.authors;
  }
  const shared = new Map<string, string[]>();
  for (const value of values)
    for (const id of source.get(value) ?? []) {
      if (id === selected.id) continue;
      const current = shared.get(id);
      if (current) current.push(value);
      else shared.set(id, [value]);
    }
  return { all: new Set(shared.keys()), shared };
}

function LoadedPapersWorkspace({ data: catalogue }: { data: MapData }) {
  const [positions, setPositions] = useState<PositionSource>('titles');
  const [textFilter, setTextFilter] = useState<TextFilter>('all');
  const [abstractPositions, setAbstractPositions] =
    useState<AbstractPositions | null>(null);
  const [unionPositions, setUnionPositions] =
    useState<AbstractPositions | null>(null);
  const [fulltextPositions, setFulltextPositions] =
    useState<AbstractPositions | null>(null);
  const [failedPositions, setFailedPositions] =
    useState<PositionSource>('abstracts');
  const [positionError, setPositionError] = useState('');
  const [positionAttempt, setPositionAttempt] = useState(0);
  const abstractData = useMemo(
    () =>
      abstractPositions ? abstractMap(catalogue, abstractPositions) : null,
    [catalogue, abstractPositions],
  );
  const unionData = useMemo(
    () =>
      unionPositions ? abstractMap(catalogue, unionPositions, 'union') : null,
    [catalogue, unionPositions],
  );
  const fulltextData = useMemo(
    () =>
      fulltextPositions
        ? abstractMap(catalogue, fulltextPositions, 'fulltext')
        : null,
    [catalogue, fulltextPositions],
  );
  const loadedData =
    positions === 'abstracts'
      ? abstractData
      : positions === 'union'
        ? unionData
        : positions === 'fulltext'
          ? fulltextData
          : catalogue;
  const positionData = loadedData ?? catalogue;
  const activePositions = positionData === catalogue ? 'titles' : positions;
  const textCounts = useMemo(
    () => textFilterCounts(positionData.points, availableText),
    [positionData],
  );
  const data = useMemo(
    () =>
      textFilter === 'all'
        ? positionData
        : subsetMap(
            positionData,
            positionData.points.filter((p) =>
              matchesText(p.id, textFilter, availableText),
            ),
          ),
    [positionData, textFilter],
  );
  const visibleIds = useMemo(
    () => (textFilter === 'all' ? null : new Set(data.points.map((p) => p.id))),
    [data, textFilter],
  );
  useEffect(() => {
    if (positions === 'titles' || loadedData) return;
    const label =
      positions === 'union'
        ? 'Combined-text'
        : positions === 'fulltext'
          ? 'Full-text'
          : 'Abstract';
    const fail = (message: string) => {
      setPositionError(message);
      setFailedPositions(positions);
      setPositions('titles');
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      fail(`${label} positions took too long to load.`);
    }, 15000);
    fetch(new URL(`data/positions-${positions}.json`, document.baseURI), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Could not load ${label.toLowerCase()} positions.`);
        if (positions === 'abstracts')
          return validateAbstractPositions(await response.json(), catalogue);
        const bytes = await response.arrayBuffer();
        if (positions === 'fulltext') {
          await verifyPositionBytes(bytes, fulltextRelease.sha256, 'Full-text');
          return validateFulltextPositions(
            JSON.parse(new TextDecoder().decode(bytes)),
            availableText.fulltext,
          );
        }
        await verifyPositionBytes(bytes, unionRelease.sha256);
        return validateUnionPositions(
          JSON.parse(new TextDecoder().decode(bytes)),
          catalogue,
          unionRelease,
        );
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          if (positions === 'abstracts') setAbstractPositions(payload);
          else if (positions === 'fulltext') setFulltextPositions(payload);
          else setUnionPositions(payload);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          fail(
            error instanceof Error
              ? error.message
              : `Could not load ${label.toLowerCase()} positions.`,
          );
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [loadedData, catalogue, positionAttempt, positions]);
  const defaults = useMemo<FacetSelections>(
    () => ({
      publisher: data.facets.publishers.slice(0, 10).map((item) => item.value),
      journal: data.facets.journals.slice(0, 10).map((item) => item.value),
      keywords: data.facets.keywords.slice(0, 10).map((item) => item.value),
    }),
    [data],
  );
  const [lens, setLens] = useState<PaperLens>('catalogue');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<PaperGroup | null>(null);
  const topicFilter =
    group?.sourceLens === lens && typeof group.value === 'number'
      ? group.value
      : null;
  const [facets, setFacets] = useState<{
    selections: FacetSelections;
    colourSlots: ColourSlots;
  }>(() => ({
    selections: defaults,
    colourSlots: {
      publisher: new Map(
        defaults.publisher.map((value, index) => [value, index]),
      ),
      journal: new Map(defaults.journal.map((value, index) => [value, index])),
      keywords: new Map(
        defaults.keywords.map((value, index) => [value, index]),
      ),
    },
  }));
  const { selections, colourSlots } = facets;
  const selected = useMemo(
    () => data.points.find((paper) => paper.id === selectedId) ?? null,
    [data.points, selectedId],
  );
  const inverted = useMemo(() => buildInvertedIndex(data), [data]);
  const relation = useMemo(
    () => buildRelation(selected, lens, selections, inverted),
    [inverted, lens, selected, selections],
  );
  const searchIndex = useMemo(
    () =>
      data.points.map((paper) => ({
        paper,
        fields: [
          paper.title,
          paper.journal,
          paper.publisher,
          paper.id,
          ...paper.authors,
          ...paper.keywords,
        ].map(normaliseText),
      })),
    [data.points],
  );
  const results = useMemo(() => {
    const needle = normaliseText(query);
    if (!needle) return [];
    return searchIndex
      .map(({ paper, fields }) => {
        const score = fields[0].startsWith(needle)
          ? 0
          : fields[0].includes(needle)
            ? 1
            : fields.slice(1).some((value) => value.includes(needle))
              ? 2
              : 9;
        return { paper, score };
      })
      .filter((entry) => entry.score < 9)
      .sort(
        (a, b) =>
          a.score - b.score || a.paper.title.localeCompare(b.paper.title),
      )
      .slice(0, 8)
      .map((entry) => entry.paper);
  }, [searchIndex, query]);
  const toggleFacet = (
    facet: 'publisher' | 'journal' | 'keywords',
    value: string,
  ) =>
    setFacets((current) => {
      const values = current.selections[facet];
      if (values.includes(value)) {
        return {
          ...current,
          selections: {
            ...current.selections,
            [facet]: values.filter((item) => item !== value),
          },
        };
      }
      if (values.length >= data.facets.maximum_selection) return current;
      const used = new Set(
        values.map((item) => current.colourSlots[facet].get(item)),
      );
      const slot =
        Array.from(
          { length: data.facets.maximum_selection },
          (_, index) => index,
        ).find((index) => !used.has(index)) ?? 0;
      return {
        selections: { ...current.selections, [facet]: [...values, value] },
        colourSlots: {
          ...current.colourSlots,
          [facet]: new Map(current.colourSlots[facet]).set(value, slot),
        },
      };
    });
  const resetFacet = (facet: 'publisher' | 'journal' | 'keywords') =>
    setFacets((current) => {
      const values = defaults[facet];
      return {
        selections: { ...current.selections, [facet]: values },
        colourSlots: {
          ...current.colourSlots,
          [facet]: new Map(values.map((value, index) => [value, index])),
        },
      };
    });
  const selectPaper = (paper: PaperPoint | null) => {
    setSelectedId(paper?.id ?? null);
    if (
      paper &&
      ['publisher', 'journal', 'keywords', 'coauthorship'].includes(lens)
    ) {
      const connected = buildRelation(paper, lens, selections, inverted);
      setGroup({
        ids: new Set([paper.id, ...connected.all]),
        label: `Shared ${lens === 'coauthorship' ? 'authors' : lens}`,
        sourceLens: lens,
      });
    }
  };
  const selectTopic = (topic: number | null) => {
    setGroup(
      topic === null
        ? null
        : topicGroup(
            data.points,
            lens,
            topic,
            activeTopics(data, lens).find((item) => item.id === topic)?.label ??
              `Topic ${topic}`,
          ),
    );
  };
  const clearSelection = () => {
    setGroup(null);
    setSelectedId(null);
  };
  const mappedSelectionCount = useMemo(
    () =>
      group ? data.points.filter((paper) => group.ids.has(paper.id)).length : 0,
    [data.points, group],
  );
  const controls = (
    <LensControls
      data={data}
      positions={positions}
      textFilter={textFilter}
      textCounts={textCounts}
      onTextFilter={setTextFilter}
      catalogueCount={catalogue.cohort.n}
      abstractCount={catalogue.cohort.coverage.bertopic}
      onPositions={(source) => {
        setPositionError('');
        setPositions(source);
      }}
      positionError={positionError}
      onRetryPositions={() => {
        setPositionError('');
        setPositionAttempt((attempt) => attempt + 1);
        setPositions(failedPositions);
      }}
      lens={lens}
      topicFilter={topicFilter}
      selections={selections}
      colourSlots={colourSlots}
      onLens={setLens}
      onTopic={selectTopic}
      onToggleFacet={toggleFacet}
      onResetFacet={resetFacet}
      onFacetGroup={(facet, values) =>
        setGroup(facetGroup(data.points, facet, values))
      }
    />
  );
  const activeTopicsList = activeTopics(data, lens);
  const activeValue = selected
    ? lens === 'bertopic'
      ? activeTopicsList.find((item) => item.id === selected.bertopic)?.label
      : lens === 'bertopic_reduced'
        ? activeTopicsList.find((item) => item.id === selected.bertopic_reduced)
            ?.label
        : lens === 'lda'
          ? activeTopicsList.find((item) => item.id === selected.lda_topic)
              ?.label
          : lens === 'agreement' && selected.neighbour_agreement !== null
            ? selected.neighbour_agreement.toFixed(2)
            : lens === 'publisher'
              ? selected.publisher
              : lens === 'journal'
                ? selected.journal
                : lens === 'keywords'
                  ? selected.keywords
                      .filter((item) => selections.keywords.includes(item))
                      .join(', ')
                  : lens === 'coauthorship'
                    ? `${selected.coauthor_count} direct connections`
                    : ''
    : '';

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[296px_minmax(0,1fr)] max-lg:grid-cols-[272px_minmax(0,1fr)] max-sm:grid-cols-1">
      <aside className="flex min-h-0 flex-col border-r border-border bg-[var(--panel-background)] max-sm:hidden">
        {controls}
      </aside>
      <section
        className="relative min-h-0 overflow-hidden"
        aria-label="Paper atlas"
      >
        <PaperMap
          data={positionData}
          displayData={data}
          visibleIds={visibleIds}
          positionSource={activePositions}
          textCoordinates={
            (activePositions === 'fulltext'
              ? fulltextPositions
              : activePositions === 'union'
                ? unionPositions
                : abstractPositions
            )?.coordinates3d ?? null
          }
          hasSelection={!!group || !!selectedId}
          lens={lens}
          selected={selected}
          onSelect={selectPaper}
          group={group}
          onGroup={setGroup}
          onClearSelection={clearSelection}
          selections={selections}
          colourSlots={colourSlots}
        />
        {!loadedData ? (
          <output className="absolute inset-0 z-40 grid place-items-center bg-[var(--map-background)] text-sm text-white">
            Loading{' '}
            {positions === 'union'
              ? 'combined-text'
              : positions === 'fulltext'
                ? 'full-text'
                : 'abstract'}{' '}
            positions…
          </output>
        ) : null}
        {loadedData && data.points.length === 0 ? (
          <output className="absolute inset-x-4 top-32 z-20 mx-auto w-fit border border-white/20 bg-[#11151a] px-4 py-3 text-sm text-white">
            No papers match this text filter in the current position view.
            <button
              className="ml-2 underline"
              onClick={() => setTextFilter('all')}
            >
              Clear text filter
            </button>
          </output>
        ) : null}
        {group ? (
          <output
            className="absolute left-4 top-16 z-10 flex max-w-[min(380px,calc(100%-32px))] items-start gap-3 border border-white/20 bg-[#11151a] px-3 py-2 text-sm text-white"
            aria-label="Persistent paper selection"
          >
            <div className="min-w-0">
              <p>
                <span className="font-mono tabular-nums">
                  {group.ids.size.toLocaleString()}
                </span>{' '}
                selected
                {group.ids.size > mappedSelectionCount ? (
                  <span className="text-white/65">
                    {' '}
                    · {mappedSelectionCount.toLocaleString()}{' '}
                    {textFilter === 'all' ? 'mapped' : 'shown'}
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-white/65" title={group.label}>
                {group.label}
              </p>
            </div>
            <button
              aria-label="Clear paper selection"
              className="ml-auto shrink-0 p-1 text-white/70 hover:text-white"
              onClick={clearSelection}
            >
              <X className="size-4" />
            </button>
          </output>
        ) : null}
        <div className="absolute left-3 top-3 z-20">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="hidden rounded-none bg-background/94 max-sm:inline-flex"
                />
              }
            >
              <SlidersHorizontal />
              Lens
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px]">
              <SheetHeader>
                <SheetTitle>Lens</SheetTitle>
                <SheetDescription className="sr-only">
                  Select an analytical lens.
                </SheetDescription>
              </SheetHeader>
              {controls}
            </SheetContent>
          </Sheet>
        </div>
        <div className="absolute right-3 top-3 z-20 w-[min(340px,calc(100%-88px))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search papers"
              placeholder="Search papers"
              className="h-9 rounded-none border-border bg-background/95 pl-8 pr-8 shadow-none"
            />
            {query ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-0.5"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <X />
              </Button>
            ) : null}
          </div>
          {query ? (
            <div className="mt-1 border border-border bg-background shadow-lg">
              {results.length ? (
                <ul className="py-1" aria-label="Search results">
                  {results.map((paper) => (
                    <li key={paper.id}>
                      <button
                        className="w-full border-l-2 border-transparent px-3 py-2 text-left hover:border-primary hover:bg-muted/60 focus-visible:border-primary focus-visible:bg-muted/60 focus-visible:outline-none"
                        onClick={() => {
                          selectPaper(paper);
                          setQuery('');
                        }}
                      >
                        <span className="block truncate text-sm font-medium">
                          {decodeHtmlEntities(paper.title)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {paper.journal || paper.publisher}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No matching papers
                </p>
              )}
            </div>
          ) : null}
        </div>
        {selected ? (
          <aside className="absolute bottom-4 right-4 top-14 z-20 flex w-[min(390px,calc(100%-32px))] flex-col border border-border bg-background/98 shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-4 py-3">
              <div className="min-w-0 pr-3">
                <p className="data-kicker">Selected paper</p>
                <h2 className="mt-1.5 font-heading text-xl font-medium leading-tight">
                  {decodeHtmlEntities(selected.title)}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close paper details"
                onClick={() => setSelectedId(null)}
              >
                <X />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-4 text-xs">
                <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-x-3 gap-y-2">
                  <span className="text-muted-foreground">Year</span>
                  <span>{selected.year || 'Unavailable'}</span>
                  <span className="text-muted-foreground">Type</span>
                  <span className="capitalize">
                    {selected.type.replaceAll('_', ' ')}
                  </span>
                  <span className="text-muted-foreground">Journal</span>
                  <span>{selected.journal || 'Unavailable'}</span>
                  <span className="text-muted-foreground">Publisher</span>
                  <span>{selected.publisher || 'Unavailable'}</span>
                  {activePositions === 'union' ||
                  activePositions === 'fulltext' ? (
                    <>
                      <span className="text-muted-foreground">
                        Position text
                      </span>
                      <span>
                        {activePositions === 'fulltext'
                          ? 'Sampled full text'
                          : unionPositions?.sources?.[selected.i] === 'abstract'
                            ? 'Abstract'
                            : unionPositions?.sources?.[selected.i] ===
                                'fulltext'
                              ? 'Sampled full text'
                              : 'Unavailable'}
                      </span>
                    </>
                  ) : null}
                </div>
                {activeValue ? (
                  <div className="border-y border-border py-3">
                    <p className="data-kicker">
                      {LENSES.find((item) => item.id === lens)?.label}
                    </p>
                    <p className="mt-1 leading-5">{activeValue}</p>
                  </div>
                ) : null}
                <section>
                  <p className="data-kicker">Authors</p>
                  <p className="mt-1.5 leading-5">
                    {selected.authors.length
                      ? selected.authors.join(' · ')
                      : 'Unavailable'}
                  </p>
                </section>
                <section>
                  <p className="data-kicker">Keywords</p>
                  {selected.keywords.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selected.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="border border-border bg-muted/55 px-1.5 py-0.5 text-xs"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-muted-foreground">Unavailable</p>
                  )}
                </section>
                {['publisher', 'journal', 'keywords', 'coauthorship'].includes(
                  lens,
                ) ? (
                  <section
                    className="border-t border-border pt-3"
                    aria-live="polite"
                  >
                    <div className="flex items-baseline justify-between">
                      <p className="data-kicker">Connected papers</p>
                      <span className="font-mono text-sm tabular-nums">
                        {relation.all.size.toLocaleString()}
                      </span>
                    </div>
                  </section>
                ) : null}
                <a
                  href={selected.id.replace(/^http:\/\//, 'https://')}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate border-t border-border pt-3 font-mono text-xs text-primary underline decoration-border underline-offset-2 hover:decoration-primary"
                >
                  {selected.id.replace(/^http:\/\//, 'https://')}
                </a>
              </div>
            </ScrollArea>
          </aside>
        ) : null}
      </section>
    </div>
  );
}

export function PapersWorkspace({ data }: { data: MapData | null }) {
  if (!data) return <DataLoading />;
  return <LoadedPapersWorkspace data={data} />;
}
