import type { PaperLens, PaperPoint } from './atlas-types';
type PaperGroupPart = {
  ids: ReadonlySet<string>;
  label: string;
  sourceLens: PaperLens | 'box';
  value?: string | number;
};
export type PaperGroup = PaperGroupPart & {
  parts?: readonly PaperGroupPart[];
};

export function highlightedValues(group: PaperGroup | null, lens: PaperLens) {
  return new Set(
    (group ? (group.parts ?? [group]) : [])
      .filter((part) => part.sourceLens === lens && part.value !== undefined)
      .map((part) => part.value!),
  );
}

// Each contribution keeps its original IDs, including papers hidden by a later
// position or availability change. Removing a contribution preserves overlaps.
export function updateHighlight(
  current: PaperGroup | null,
  incoming: PaperGroup,
  mode: 'add' | 'toggle' = 'toggle',
): PaperGroup | null {
  const parts = current ? [...(current.parts ?? [current])] : [];
  for (const part of incoming.parts ?? [incoming]) {
    const index = parts.findIndex(
      (existing) =>
        part.value !== undefined &&
        existing.sourceLens === part.sourceLens &&
        existing.value === part.value,
    );
    if (index >= 0) {
      if (mode === 'toggle') parts.splice(index, 1);
    } else if (part.ids.size) parts.push(part);
  }
  if (!parts.length) return null;
  if (parts.length === 1) return { ...parts[0], parts };
  const sameLens = parts.every(
    (part) =>
      part.sourceLens === parts[0].sourceLens && part.value !== undefined,
  );
  const nouns: Partial<Record<PaperGroupPart['sourceLens'], string>> = {
    keywords: 'keywords',
    publisher: 'publishers',
    journal: 'journals',
    bertopic: 'topics',
    bertopic_reduced: 'topics',
    lda: 'topics',
  };
  const noun = sameLens ? nouns[parts[0].sourceLens] : undefined;
  return {
    ids: new Set(parts.flatMap((part) => [...part.ids])),
    label: `${parts.length} ${noun ?? 'highlighted groups'}`,
    sourceLens: incoming.sourceLens,
    parts,
  };
}
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
    label:
      values.length === 1
        ? values[0]
        : `${values.length} ${lens === 'publisher' ? 'publishers' : lens === 'journal' ? 'journals' : 'keywords'}`,
    sourceLens: lens,
    value: values.length === 1 ? values[0] : undefined,
    parts:
      values.length > 1
        ? [...wanted].map((value) => facetGroup(points, lens, [value]))
        : undefined,
  };
}
export function groupFingerprint(ids: ReadonlySet<string>) {
  let hash = 2166136261;
  for (const id of [...ids].sort())
    for (const char of id + '\n')
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
