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
    if (normalised.startsWith('#')) {
      const code = Number.parseInt(normalised.slice(normalised.startsWith('#x') ? 2 : 1), normalised.startsWith('#x') ? 16 : 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\uFFFD';
    }
    return NAMED_ENTITIES[normalised] ?? match;
  });
}
