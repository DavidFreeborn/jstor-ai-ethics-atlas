import type { MapData, PaperPoint } from '@/lib/atlas-types';

export type AssociationLensId =
  | 'bertopic'
  | 'bertopic_reduced'
  | 'lda'
  | 'agreement'
  | 'publisher'
  | 'journal'
  | 'keywords'
  | 'coauthorship';

export type AssociationLens = {
  id: AssociationLensId;
  label: string;
  shortLabel: string;
  multiResponse?: boolean;
};

export type AssociationCategory = { label: string; count: number };
export type AssociationCell = {
  row: string;
  column: string;
  observed: number;
  expected: number;
  residual: number;
};

export type AssociationResult = {
  left: AssociationLensId;
  right: AssociationLensId;
  cramersV: number;
  eligiblePapers: number;
  contributions: number;
  rows: AssociationCategory[];
  columns: AssociationCategory[];
  cells: Map<string, AssociationCell>;
  usesMultiResponse: boolean;
};

export const ASSOCIATION_LENSES: AssociationLens[] = [
  { id: 'bertopic', label: 'BERTopic — 26 topics', shortLabel: 'BT26' },
  { id: 'bertopic_reduced', label: 'BERTopic — 9 topics', shortLabel: 'BT9' },
  { id: 'lda', label: 'LDA — 37 topics', shortLabel: 'LDA' },
  { id: 'agreement', label: 'Neighbourhood agreement', shortLabel: 'Agree.' },
  { id: 'publisher', label: 'Publisher', shortLabel: 'Publ.' },
  { id: 'journal', label: 'Journal', shortLabel: 'Journal' },
  { id: 'keywords', label: 'Keywords', shortLabel: 'Keywords', multiResponse: true },
  { id: 'coauthorship', label: 'Coauthorship level', shortLabel: 'Coauth.' },
];

const CELL_SEPARATOR = '\u001f';

function topicLabels(data: MapData) {
  return {
    bertopic: new Map(data.topics.bertopic.map((topic) => [topic.id, `T${topic.id} · ${topic.label}`])),
    bertopic_reduced: new Map(data.topics.bertopic_reduced.map((topic) => [topic.id, `T${topic.id} · ${topic.label}`])),
    lda: new Map(data.topics.lda.map((topic) => [topic.id, `T${topic.id} · ${topic.label}`])),
  };
}

function agreementBand(value: number) {
  if (value === 0) return '0';
  if (value < 0.1) return '0.01–0.09';
  if (value < 0.2) return '0.10–0.19';
  if (value < 0.4) return '0.20–0.39';
  return '0.40–1.00';
}

function coauthorshipBand(value: number) {
  if (value === 0) return '0 connections';
  if (value === 1) return '1 connection';
  if (value <= 4) return '2–4 connections';
  if (value <= 9) return '5–9 connections';
  if (value <= 24) return '10–24 connections';
  return '25+ connections';
}

function lensValues(
  paper: PaperPoint,
  lens: AssociationLensId,
  labels: ReturnType<typeof topicLabels>,
): string[] {
  if (lens === 'bertopic') {
    return paper.bertopic !== undefined && paper.bertopic >= 0
      ? [labels.bertopic.get(paper.bertopic) ?? `T${paper.bertopic}`]
      : [];
  }
  if (lens === 'bertopic_reduced') {
    return paper.bertopic_reduced !== undefined && paper.bertopic_reduced >= 0
      ? [labels.bertopic_reduced.get(paper.bertopic_reduced) ?? `T${paper.bertopic_reduced}`]
      : [];
  }
  if (lens === 'lda') {
    return paper.lda_topic !== undefined
      ? [labels.lda.get(paper.lda_topic) ?? `T${paper.lda_topic}`]
      : [];
  }
  if (lens === 'agreement') {
    return paper.neighbour_agreement === null ? [] : [agreementBand(paper.neighbour_agreement)];
  }
  if (lens === 'publisher') return paper.publisher ? [paper.publisher] : [];
  if (lens === 'journal') return paper.journal ? [paper.journal] : [];
  if (lens === 'keywords') return [...new Set(paper.keywords)];
  return paper.authors.length ? [coauthorshipBand(paper.coauthor_count)] : [];
}

function correctedCramersV(
  counts: Map<string, number>,
  rowMargins: Map<string, number>,
  columnMargins: Map<string, number>,
  total: number,
) {
  const rowCount = rowMargins.size;
  const columnCount = columnMargins.size;
  if (total <= 1 || rowCount <= 1 || columnCount <= 1) return 0;
  let weightedSquares = 0;
  for (const [key, observed] of counts) {
    const [row, column] = key.split(CELL_SEPARATOR);
    weightedSquares += (observed * observed) / (rowMargins.get(row)! * columnMargins.get(column)!);
  }
  const chiSquare = Math.max(0, total * weightedSquares - total);
  const phiSquared = chiSquare / total;
  const correction = ((columnCount - 1) * (rowCount - 1)) / (total - 1);
  const correctedPhiSquared = Math.max(0, phiSquared - correction);
  const correctedRows = rowCount - ((rowCount - 1) ** 2) / (total - 1);
  const correctedColumns = columnCount - ((columnCount - 1) ** 2) / (total - 1);
  const denominator = Math.min(correctedRows - 1, correctedColumns - 1);
  return denominator > 0 ? Math.sqrt(correctedPhiSquared / denominator) : 0;
}

export function buildAssociation(
  data: MapData,
  left: AssociationLensId,
  right: AssociationLensId,
  includeCells = true,
): AssociationResult {
  const labels = topicLabels(data);
  const counts = new Map<string, number>();
  const rowMargins = new Map<string, number>();
  const columnMargins = new Map<string, number>();
  let eligiblePapers = 0;
  let contributions = 0;

  for (const paper of data.points) {
    const leftValues = lensValues(paper, left, labels);
    const rightValues = lensValues(paper, right, labels);
    if (!leftValues.length || !rightValues.length) continue;
    eligiblePapers += 1;
    for (const row of leftValues) {
      for (const column of rightValues) {
        const key = `${row}${CELL_SEPARATOR}${column}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        rowMargins.set(row, (rowMargins.get(row) ?? 0) + 1);
        columnMargins.set(column, (columnMargins.get(column) ?? 0) + 1);
        contributions += 1;
      }
    }
  }

  const rows = [...rowMargins].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const columns = [...columnMargins].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const cells = new Map<string, AssociationCell>();
  for (const row of includeCells ? rows.slice(0, 30) : []) {
    for (const column of columns.slice(0, 30)) {
      const key = `${row.label}${CELL_SEPARATOR}${column.label}`;
      const observed = counts.get(key) ?? 0;
      const expected = contributions ? (row.count * column.count) / contributions : 0;
      cells.set(key, {
        row: row.label,
        column: column.label,
        observed,
        expected,
        residual: expected > 0 ? (observed - expected) / Math.sqrt(expected) : 0,
      });
    }
  }

  const leftLens = ASSOCIATION_LENSES.find((lens) => lens.id === left);
  const rightLens = ASSOCIATION_LENSES.find((lens) => lens.id === right);
  return {
    left,
    right,
    cramersV: correctedCramersV(counts, rowMargins, columnMargins, contributions),
    eligiblePapers,
    contributions,
    rows,
    columns,
    cells,
    usesMultiResponse: Boolean(leftLens?.multiResponse || rightLens?.multiResponse),
  };
}

export function associationCellKey(row: string, column: string) {
  return `${row}${CELL_SEPARATOR}${column}`;
}
