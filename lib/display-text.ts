const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00A0',
  quot: '"',
};

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity: string) => {
    const normalised = entity.toLowerCase();
    if (normalised.startsWith('#x')) return String.fromCodePoint(Number.parseInt(normalised.slice(2), 16));
    if (normalised.startsWith('#')) return String.fromCodePoint(Number.parseInt(normalised.slice(1), 10));
    return NAMED_ENTITIES[normalised] ?? match;
  });
}
