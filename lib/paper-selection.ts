import type { PaperLens, PaperPoint } from './atlas-types';
export type PaperGroup = {
  ids: ReadonlySet<string>;
  label: string;
  sourceLens: PaperLens | 'box';
  value?: string | number;
};
export function topicGroup(
  points: PaperPoint[],
  lens: PaperLens,
  topic: number,
  label: string,
): PaperGroup {
  const field =
    lens === 'bertopic'
      ? 'bertopic'
      : lens === 'bertopic_reduced'
        ? 'bertopic_reduced'
        : 'lda_topic';
  return {
    ids: new Set(points.filter((p) => p[field] === topic).map((p) => p.id)),
    label,
    sourceLens: lens,
    value: topic,
  };
}
export function facetGroup(
  points: PaperPoint[],
  lens: 'publisher' | 'journal' | 'keywords',
  values: string[],
): PaperGroup {
  const wanted = new Set(values);
  return {
    ids: new Set(
      points
        .filter((p) =>
          lens === 'keywords'
            ? p.keywords.some((k) => wanted.has(k))
            : wanted.has(p[lens]),
        )
        .map((p) => p.id),
    ),
    label: values.length === 1 ? values[0] : `${values.length} ${lens} values`,
    sourceLens: lens,
    value: values.length === 1 ? values[0] : undefined,
  };
}
export function groupFingerprint(ids: ReadonlySet<string>) {
  let hash = 2166136261;
  for (const id of [...ids].sort())
    for (const char of id + '\n')
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
