import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8'));
const SEP = '\u001f';

function correctedV(observations) {
  const cells = new Map();
  const rows = new Map();
  const columns = new Map();
  for (const [row, column] of observations) {
    const key = `${row}${SEP}${column}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
    rows.set(row, (rows.get(row) ?? 0) + 1);
    columns.set(column, (columns.get(column) ?? 0) + 1);
  }
  const n = observations.length;
  if (n <= 1 || rows.size <= 1 || columns.size <= 1) return 0;
  let weightedSquares = 0;
  for (const [key, observed] of cells) {
    const [row, column] = key.split(SEP);
    weightedSquares += observed ** 2 / (rows.get(row) * columns.get(column));
  }
  const phi2 = Math.max(0, n * weightedSquares - n) / n;
  const correctedPhi2 = Math.max(0, phi2 - ((columns.size - 1) * (rows.size - 1)) / (n - 1));
  const correctedRows = rows.size - ((rows.size - 1) ** 2) / (n - 1);
  const correctedColumns = columns.size - ((columns.size - 1) ** 2) / (n - 1);
  const denominator = Math.min(correctedRows - 1, correctedColumns - 1);
  return denominator > 0 ? Math.sqrt(correctedPhi2 / denominator) : 0;
}

function values(paper, lens) {
  if (lens === 'bertopic') return paper.bertopic >= 0 ? [`${paper.bertopic}`] : [];
  if (lens === 'lda') return paper.lda_topic === undefined ? [] : [`${paper.lda_topic}`];
  if (lens === 'publisher') return paper.publisher ? [paper.publisher] : [];
  if (lens === 'journal') return paper.journal ? [paper.journal] : [];
  if (lens === 'keywords') return paper.keywords;
  if (lens === 'coauthorship') {
    if (!paper.authors.length) return [];
    const n = paper.coauthor_count;
    return [n === 0 ? '0' : n === 1 ? '1' : n <= 4 ? '2–4' : n <= 9 ? '5–9' : n <= 24 ? '10–24' : '25+'];
  }
  throw new Error(`Unknown lens ${lens}`);
}

function realPair(left, right) {
  const observations = [];
  let papers = 0;
  for (const paper of data.points) {
    const leftValues = values(paper, left);
    const rightValues = values(paper, right);
    if (!leftValues.length || !rightValues.length) continue;
    papers += 1;
    for (const row of leftValues) for (const column of rightValues) observations.push([row, column]);
  }
  return { left, right, papers, contributions: observations.length, v: correctedV(observations) };
}

const perfect = correctedV([['a', 'x'], ['a', 'x'], ['b', 'y'], ['b', 'y']]);
const independent = correctedV([['a', 'x'], ['a', 'y'], ['b', 'x'], ['b', 'y']]);
if (Math.abs(perfect - 1) > 1e-12) throw new Error(`Perfect table returned ${perfect}`);
if (Math.abs(independent) > 1e-12) throw new Error(`Independent table returned ${independent}`);

const pairs = [
  realPair('bertopic', 'lda'),
  realPair('coauthorship', 'bertopic'),
  realPair('keywords', 'lda'),
  realPair('publisher', 'journal'),
];
if (pairs[0].papers !== 1810) throw new Error(`BERTopic × LDA expected 1,810 papers, found ${pairs[0].papers}`);
for (const pair of pairs) {
  if (!Number.isFinite(pair.v) || pair.v < 0 || pair.v > 1) throw new Error(`Invalid V for ${pair.left} × ${pair.right}: ${pair.v}`);
  if (pair.papers <= 0 || pair.contributions < pair.papers) throw new Error(`Invalid coverage for ${pair.left} × ${pair.right}`);
}

console.log(JSON.stringify({ status: 'pass', synthetic: { perfect, independent }, pairs }, null, 2));
