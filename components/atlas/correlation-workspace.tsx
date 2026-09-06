'use client';

import { useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import {
  ASSOCIATION_LENSES,
  associationCellKey,
  buildAssociation,
  type AssociationLensId,
  type AssociationResult,
} from '@/lib/association-analysis';
import type { MapData } from '@/lib/atlas-types';

const RESIDUAL_LIMIT = 4;

function mix(left: [number, number, number], right: [number, number, number], amount: number) {
  return `rgb(${left.map((value, index) => Math.round(value + (right[index] - value) * amount)).join(',')})`;
}

function residualColour(value: number) {
  const magnitude = Math.min(1, Math.abs(value) / RESIDUAL_LIMIT);
  return value < 0
    ? mix([246, 247, 248], [19, 78, 145], magnitude)
    : mix([246, 247, 248], [190, 35, 46], magnitude);
}

function associationColour(value: number) {
  return mix([241, 244, 246], [21, 58, 91], Math.min(1, value / 0.65));
}

function lensLabel(id: AssociationLensId) {
  return ASSOCIATION_LENSES.find((lens) => lens.id === id)?.label ?? id;
}

function PairwiseOverview({
  data,
  left,
  right,
  onPair,
  onClose,
}: {
  data: MapData;
  left: AssociationLensId;
  right: AssociationLensId;
  onPair: (left: AssociationLensId, right: AssociationLensId) => void;
  onClose: () => void;
}) {
  const overview = useMemo(() => {
    const values = new Map<string, number>();
    ASSOCIATION_LENSES.forEach((rowLens, rowIndex) => {
      ASSOCIATION_LENSES.forEach((columnLens, columnIndex) => {
        if (rowIndex === columnIndex) values.set(`${rowLens.id}:${columnLens.id}`, 1);
        else if (rowIndex > columnIndex) {
          const value = buildAssociation(data, rowLens.id, columnLens.id, false).cramersV;
          values.set(`${rowLens.id}:${columnLens.id}`, value);
          values.set(`${columnLens.id}:${rowLens.id}`, value);
        }
      });
    });
    return values;
  }, [data]);

  return (
    <section id="pairwise-association" className="border-b border-border p-5 lg:border-b-0 lg:border-r" aria-labelledby="association-overview-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="association-overview-title" className="font-heading text-lg font-medium">Pairwise association</h2>
        <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Minimise pairwise association" title="Minimise pairwise association"><PanelLeftClose className="size-4" /></button>
      </div>
      <div className="mt-5 overflow-x-auto pb-2">
        <div className="grid w-max grid-cols-[100px_repeat(8,42px)] gap-px bg-border p-px">
          <div className="bg-[var(--panel-background)]" />
          {ASSOCIATION_LENSES.map((lens) => <div key={lens.id} className="flex h-16 items-end justify-center bg-[var(--panel-background)] pb-1"><span className="origin-bottom-left -rotate-55 translate-x-1 whitespace-nowrap font-mono text-xs text-muted-foreground" title={lens.label}>{lens.shortLabel}</span></div>)}
          {ASSOCIATION_LENSES.flatMap((rowLens, rowIndex) => [
            <div key={`${rowLens.id}-label`} className="flex h-[42px] items-center truncate bg-[var(--panel-background)] px-2 font-mono text-xs text-muted-foreground" title={rowLens.label}>{rowLens.shortLabel}</div>,
            ...ASSOCIATION_LENSES.map((columnLens, columnIndex) => {
              const value = overview.get(`${rowLens.id}:${columnLens.id}`) ?? 0;
              const diagonal = rowIndex === columnIndex;
              const active = (left === rowLens.id && right === columnLens.id) || (left === columnLens.id && right === rowLens.id);
              return <button key={`${rowLens.id}:${columnLens.id}`} disabled={diagonal} aria-label={diagonal ? rowLens.label : `${rowLens.label} by ${columnLens.label}: ${value.toFixed(2)}`} title={diagonal ? rowLens.label : `${rowLens.label} × ${columnLens.label}: V = ${value.toFixed(3)}`} onClick={() => onPair(rowLens.id, columnLens.id)} className={`flex size-[42px] items-center justify-center font-mono text-xs tabular-nums outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring ${active ? 'ring-2 ring-foreground' : ''}`} style={{ background: diagonal ? '#D7DCE0' : associationColour(value), color: value > 0.34 ? '#FFFFFF' : '#17212A' }}>{diagonal ? '—' : value.toFixed(2).replace(/^0/, '')}</button>;
            }),
          ])}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 font-mono text-xs text-muted-foreground"><span>0</span><span className="h-1.5 flex-1" style={{ background: 'linear-gradient(90deg,#f1f4f6,#153a5b)' }} /><span>≥ .65</span></div>
      <p className="mt-1 text-center font-mono text-xs text-muted-foreground">Bias-corrected Cramér&apos;s V</p>
    </section>
  );
}

function Heatmap({ result, limit }: { result: AssociationResult; limit: number }) {
  const rows = result.rows.slice(0, limit);
  const columns = result.columns.slice(0, limit);
  const cellSize = 36;
  const left = 255;
  const top = 195;
  const width = left + columns.length * cellSize + 18;
  const height = top + rows.length * cellSize + 18;
  return (
    <div className="min-h-0 flex-1 overflow-auto border-t border-border bg-[#f6f7f8]">
      <svg width={width} height={height} aria-label={`${lensLabel(result.left)} by ${lensLabel(result.right)} Pearson residual matrix`}>
        <title>{`${lensLabel(result.left)} by ${lensLabel(result.right)} Pearson residual matrix`}</title>
        <rect width={width} height={height} fill="#f6f7f8" />
        {columns.map((column, columnIndex) => <text key={column.label} x={left + columnIndex * cellSize + 18} y={top - 9} transform={`rotate(-52 ${left + columnIndex * cellSize + 18} ${top - 9})`} textAnchor="start" className="fill-[#59636c] text-xs font-medium"><title>{column.label} · n={column.count.toLocaleString()}</title>{column.label.length > 30 ? `${column.label.slice(0, 29)}…` : column.label}</text>)}
        {rows.map((row, rowIndex) => <text key={row.label} x={left - 9} y={top + rowIndex * cellSize + 22} textAnchor="end" className="fill-[#59636c] text-xs font-medium"><title>{row.label} · n={row.count.toLocaleString()}</title>{row.label.length > 33 ? `${row.label.slice(0, 32)}…` : row.label}</text>)}
        {rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => {
          const cell = result.cells.get(associationCellKey(row.label, column.label));
          const residual = cell?.residual ?? 0;
          const strong = Math.abs(residual) >= 2.35;
          return <g key={`${row.label}:${column.label}`}><rect x={left + columnIndex * cellSize} y={top + rowIndex * cellSize} width={cellSize - 1} height={cellSize - 1} fill={residualColour(residual)}><title>{`${row.label} × ${column.label}\nObserved ${cell?.observed.toLocaleString() ?? 0}; expected ${cell?.expected.toFixed(1) ?? '0.0'}; Pearson residual ${residual.toFixed(2)}`}</title></rect><text x={left + columnIndex * cellSize + 17.5} y={top + rowIndex * cellSize + 21.5} textAnchor="middle" className="pointer-events-none font-mono text-xs tabular-nums" fill={strong ? '#FFFFFF' : '#202A32'}>{Math.abs(residual) >= 9.95 ? residual.toFixed(0) : residual.toFixed(1)}</text></g>;
        }))}
      </svg>
    </div>
  );
}

export function CorrelationWorkspace({ data }: { data: MapData }) {
  const [left, setLeft] = useState<AssociationLensId>('bertopic');
  const [right, setRight] = useState<AssociationLensId>('lda');
  const [limit, setLimit] = useState(20);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const result = useMemo(() => buildAssociation(data, left, right), [data, left, right]);
  const setPair = (nextLeft: AssociationLensId, nextRight: AssociationLensId) => {
    if (nextLeft === nextRight) return;
    setLeft(nextLeft);
    setRight(nextRight);
  };
  const chooseLeft = (next: AssociationLensId) => setPair(next, next === right ? left : right);
  const chooseRight = (next: AssociationLensId) => setPair(next === left ? right : left, next);

  return (
    <div className={`grid min-h-0 flex-1 grid-cols-1 bg-background max-lg:overflow-auto ${overviewOpen ? 'lg:grid-cols-[500px_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
      {overviewOpen ? <PairwiseOverview data={data} left={left} right={right} onPair={setPair} onClose={() => setOverviewOpen(false)} /> : null}
      <section className="flex min-h-0 min-w-0 flex-col" aria-labelledby="association-detail-title">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            {!overviewOpen ? <button type="button" onClick={() => setOverviewOpen(true)} className="flex h-8 items-center gap-2 border border-input bg-background px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-expanded="false" aria-controls="pairwise-association"><PanelLeftOpen className="size-4" />Pairwise association</button> : null}
            <label className="grid gap-1"><span className="data-kicker">Rows</span><select value={left} onChange={(event) => chooseLeft(event.target.value as AssociationLensId)} className="h-8 min-w-48 border border-input bg-background px-2 text-xs outline-none focus:border-ring">{ASSOCIATION_LENSES.map((lens) => <option key={lens.id} value={lens.id}>{lens.label}</option>)}</select></label>
            <label className="grid gap-1"><span className="data-kicker">Columns</span><select value={right} onChange={(event) => chooseRight(event.target.value as AssociationLensId)} className="h-8 min-w-48 border border-input bg-background px-2 text-xs outline-none focus:border-ring">{ASSOCIATION_LENSES.map((lens) => <option key={lens.id} value={lens.id}>{lens.label}</option>)}</select></label>
            <label className="grid gap-1"><span className="data-kicker">Display</span><select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="h-8 border border-input bg-background px-2 text-xs outline-none focus:border-ring"><option value={10}>Top 10</option><option value={20}>Top 20</option><option value={30}>Top 30</option></select></label>
            <div className="ml-auto border-l border-border pl-4 font-mono text-xs tabular-nums text-muted-foreground max-xl:ml-0"><span><strong className="text-base font-medium text-foreground">{result.eligiblePapers.toLocaleString()}</strong> papers</span></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <h2 id="association-detail-title" className="font-medium text-foreground">Pearson residuals</h2>
            <span>blue fewer than expected</span><span className="h-1.5 w-24" style={{ background: 'linear-gradient(90deg,#134e91,#f6f7f8,#be232e)' }} /><span>red more than expected</span><span>scale ±4</span>
          </div>
        </div>
        <Heatmap result={result} limit={limit} />
      </section>
    </div>
  );
}
