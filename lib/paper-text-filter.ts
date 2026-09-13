import type { PaperPoint } from './atlas-types';

export const TEXT_FILTERS = [
  { value: 'all', label: 'All papers' },
  { value: 'abstract', label: 'Has abstract' },
  { value: 'fulltext', label: 'Has full text' },
  { value: 'both', label: 'Has both (∩)' },
  { value: 'abstract_only', label: 'Abstract only' },
  { value: 'fulltext_only', label: 'Full text only' },
] as const;
export type TextFilter = (typeof TEXT_FILTERS)[number]['value'];
export type TextAvailability = {
  abstracts: ReadonlySet<string>;
  fulltext: ReadonlySet<string>;
};

export function matchesText(
  id: string,
  filter: TextFilter,
  available: TextAvailability,
) {
  if (filter === 'all') return true;
  const abstract = available.abstracts.has(id),
    fulltext = available.fulltext.has(id);
  if (filter === 'abstract') return abstract;
  if (filter === 'fulltext') return fulltext;
  if (filter === 'both') return abstract && fulltext;
  if (filter === 'abstract_only') return abstract && !fulltext;
  return fulltext && !abstract;
}

export function textFilterCounts(
  points: PaperPoint[],
  available: TextAvailability,
) {
  return Object.fromEntries(
    TEXT_FILTERS.map(({ value }) => [
      value,
      points.filter((p) => matchesText(p.id, value, available)).length,
    ]),
  ) as Record<TextFilter, number>;
}
