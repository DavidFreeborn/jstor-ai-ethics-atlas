import type { FacetValue, MapData, PaperPoint } from './atlas-types';
import type { Vec3 } from './map-camera';

export type PositionSource = 'titles' | 'abstracts' | 'union' | 'fulltext';
export type AbstractPositions = {
  version: number;
  ids: string[];
  coordinates2d: [number, number][];
  coordinates3d: Vec3[];
  embedding: string;
  parameters: Record<string, string | number>;
  sources?: ('abstract' | 'fulltext')[];
};

export type UnionRelease = {
  count: number;
  abstracts: number;
  fulltext: number;
  sha256: string;
};

/** Check the exact frozen bytes as well as the cohort/coordinate schema. */
export async function verifyPositionBytes(
  bytes: ArrayBuffer,
  expected: string,
  label = 'Combined-text',
) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (actual !== expected)
    throw new Error(`${label} positions failed the release integrity check.`);
}

export function validateUnionPositions(
  value: unknown,
  catalogue: MapData,
  release: UnionRelease,
): AbstractPositions {
  const p = value as AbstractPositions | null;
  const byId = new Map(catalogue.points.map((paper) => [paper.id, paper]));
  const rowsValid = (rows: unknown, dimensions: number) =>
    Array.isArray(rows) &&
    rows.length === release.count &&
    rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === dimensions &&
        row.every((v) => typeof v === 'number' && Number.isFinite(v)),
    );
  if (
    !p ||
    p.version !== 1 ||
    !Array.isArray(p.ids) ||
    p.ids.length !== release.count ||
    new Set(p.ids).size !== release.count ||
    p.ids.some((id) => !byId.has(id)) ||
    !rowsValid(p.coordinates2d, 2) ||
    !rowsValid(p.coordinates3d, 3) ||
    typeof p.embedding !== 'string' ||
    !p.parameters ||
    typeof p.parameters !== 'object' ||
    !Array.isArray(p.sources) ||
    p.sources.length !== release.count ||
    p.sources.filter((s) => s === 'abstract').length !== release.abstracts ||
    p.sources.filter((s) => s === 'fulltext').length !== release.fulltext ||
    p.sources.some(
      (s, i) =>
        s !==
        (byId.get(p.ids[i])!.bertopic !== undefined ? 'abstract' : 'fulltext'),
    ) ||
    release.abstracts !== catalogue.cohort.coverage.bertopic
  ) {
    throw new Error(
      'Combined-text positions do not match the released papers.',
    );
  }
  return p;
}

/** Reject misaligned or partial releases before any displayed coordinates change. */
export function validateAbstractPositions(
  value: unknown,
  catalogue: MapData,
): AbstractPositions {
  const p = value as AbstractPositions | null;
  const expected = new Set(
    catalogue.points
      .filter((paper) => paper.bertopic !== undefined)
      .map((paper) => paper.id),
  );
  const validCoordinates = (rows: unknown, dimensions: number) =>
    Array.isArray(rows) &&
    rows.length === expected.size &&
    rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === dimensions &&
        row.every((v) => typeof v === 'number' && Number.isFinite(v)),
    );
  if (
    !p ||
    p.version !== 1 ||
    !Array.isArray(p.ids) ||
    p.ids.length !== expected.size ||
    new Set(p.ids).size !== expected.size ||
    p.ids.some((id) => !expected.has(id)) ||
    !validCoordinates(p.coordinates2d, 2) ||
    !validCoordinates(p.coordinates3d, 3) ||
    typeof p.embedding !== 'string' ||
    !p.parameters ||
    typeof p.parameters !== 'object'
  ) {
    throw new Error('Abstract positions do not match the released papers.');
  }
  return p;
}

export function subsetMap(
  catalogue: MapData,
  selectedPoints: PaperPoint[],
  label = catalogue.cohort.label,
): MapData {
  const points = selectedPoints.map((p) => ({ ...p }));
  const authors = new Map<string, Set<string>>();
  for (const p of points)
    for (const author of p.authors) {
      if (!authors.has(author)) authors.set(author, new Set());
      authors.get(author)!.add(p.id);
    }
  for (const p of points) {
    const others = new Set(
      p.authors.flatMap((author) => [...authors.get(author)!]),
    );
    others.delete(p.id);
    p.coauthor_count = others.size;
  }
  const count = (predicate: (p: PaperPoint) => boolean) =>
    points.filter(predicate).length;
  const facet = (
    values: FacetValue[],
    field: 'publisher' | 'journal' | 'keywords',
  ) => {
    const counts = new Map<string, number>();
    for (const p of points)
      for (const value of new Set(
        field === 'keywords' ? p.keywords : [p[field]],
      ))
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    return values
      .map((item) => ({
        value: item.value,
        count: counts.get(item.value) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  return {
    ...catalogue,
    points,
    topics: {
      bertopic: catalogue.topics.bertopic.map((t) => ({
        ...t,
        count: count((p) => p.bertopic === t.id),
      })),
      bertopic_reduced: catalogue.topics.bertopic_reduced.map((t) => ({
        ...t,
        count: count((p) => p.bertopic_reduced === t.id),
      })),
      lda: catalogue.topics.lda.map((t) => ({
        ...t,
        count: count((p) => p.lda_topic === t.id),
      })),
    },
    cohort: {
      ...catalogue.cohort,
      label,
      n: points.length,
      coverage: {
        bertopic: count((p) => p.bertopic !== undefined),
        lda: count((p) => p.lda_topic !== undefined),
        neighbour_agreement: count((p) => p.neighbour_agreement !== null),
        publisher: count((p) => !!p.publisher),
        journal: count((p) => !!p.journal),
        keywords: count((p) => p.keywords.length > 0),
        authors: count((p) => p.authors.length > 0),
      },
    },
    facets: {
      ...catalogue.facets,
      publishers: facet(catalogue.facets.publishers, 'publisher'),
      journals: facet(catalogue.facets.journals, 'journal'),
      keywords: facet(catalogue.facets.keywords, 'keywords'),
    },
  };
}

export function abstractMap(
  catalogue: MapData,
  positions: AbstractPositions,
  source: Exclude<PositionSource, 'titles'> = 'abstracts',
): MapData {
  const byId = new Map(catalogue.points.map((p) => [p.id, p]));
  const points = positions.ids.map((id, i) => ({
    ...byId.get(id)!,
    i,
    x: positions.coordinates2d[i][0],
    y: positions.coordinates2d[i][1],
  }));
  const label =
    source === 'union'
      ? 'Abstract and full-text union'
      : source === 'fulltext'
        ? 'Full-text cohort'
        : 'Abstract cohort';
  return {
    ...subsetMap(catalogue, points, label),
    geometry: {
      ...catalogue.geometry,
      embedding: positions.embedding,
      parameters: { ...positions.parameters, n_components: 2 },
      quality: {},
      opening_zoom: 1.08,
      bounds: {
        x: [
          Math.min(...points.map((p) => p.x)),
          Math.max(...points.map((p) => p.x)),
        ],
        y: [
          Math.min(...points.map((p) => p.y)),
          Math.max(...points.map((p) => p.y)),
        ],
      },
      interpretation:
        'Local proximity approximates text-semantic neighbourhoods; global spacing is not a semantic distance.',
    },
  };
}

export function validateFulltextPositions(
  value: unknown,
  expected: ReadonlySet<string>,
): AbstractPositions {
  const p = value as AbstractPositions | null;
  const rowsValid = (rows: unknown, dimensions: number) =>
    Array.isArray(rows) &&
    rows.length === expected.size &&
    rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === dimensions &&
        row.every((v) => typeof v === 'number' && Number.isFinite(v)),
    );
  if (
    !p ||
    p.version !== 1 ||
    !Array.isArray(p.ids) ||
    p.ids.length !== expected.size ||
    new Set(p.ids).size !== expected.size ||
    p.ids.some((id) => !expected.has(id)) ||
    !rowsValid(p.coordinates2d, 2) ||
    !rowsValid(p.coordinates3d, 3) ||
    typeof p.embedding !== 'string' ||
    !p.parameters ||
    typeof p.parameters !== 'object'
  )
    throw new Error('Full-text positions do not match the released papers.');
  return p;
}
