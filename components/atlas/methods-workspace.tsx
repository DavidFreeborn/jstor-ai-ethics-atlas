'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';

import { DataError, DataLoading } from '@/components/atlas/data-state';
import { Button } from '@/components/ui/button';
import type { ContingencyCell, MethodsData, ModelTopic } from '@/lib/atlas-types';

type MatrixMode = 'models' | 'length' | 'lda';

function MatrixCanvas({ cells, rows, columns, mode, selected, onSelect }: { cells: ContingencyCell[]; rows: ModelTopic[]; columns: ModelTopic[]; mode: MatrixMode; selected: ContingencyCell | null; onSelect: (cell: ContingencyCell | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 480 });
  const rowIds = useMemo(() => rows.filter((topic) => topic.id >= 0).map((topic) => topic.id), [rows]);
  const columnIds = useMemo(() => columns.filter((topic) => topic.id >= 0).map((topic) => topic.id), [columns]);
  const lookup = useMemo(() => new Map(cells.map((cell) => [`${mode === 'models' ? cell.bertopic : cell.abstract}:${mode === 'models' ? cell.lda : cell.fulltext}`, cell])), [cells, mode]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(420, Math.floor(entry.contentRect.width)), height: Math.max(360, Math.floor(entry.contentRect.height)) }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    const margin = { left: 44, right: 14, top: 14, bottom: 38 };
    const width = size.width - margin.left - margin.right;
    const height = size.height - margin.top - margin.bottom;
    const cellW = width / columnIds.length;
    const cellH = height / rowIds.length;
    const max = Math.max(1, ...cells.map((cell) => cell.count));
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#f8f6f1';
    ctx.fillRect(margin.left, margin.top, width, height);
    rowIds.forEach((row, r) => columnIds.forEach((column, c) => {
      const cell = lookup.get(`${row}:${column}`);
      if (!cell) return;
      const intensity = Math.sqrt(cell.count / max);
      ctx.fillStyle = `rgba(37,82,112,${0.08 + intensity * 0.88})`;
      ctx.fillRect(margin.left + c * cellW + 0.35, margin.top + r * cellH + 0.35, Math.max(0.5, cellW - 0.7), Math.max(0.5, cellH - 0.7));
    }));
    if (selected) {
      const row = mode === 'models' ? selected.bertopic : selected.abstract;
      const column = mode === 'models' ? selected.lda : selected.fulltext;
      const r = rowIds.indexOf(row ?? -999);
      const c = columnIds.indexOf(column ?? -999);
      if (r >= 0 && c >= 0) { ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.5; ctx.strokeRect(margin.left + c * cellW, margin.top + r * cellH, cellW, cellH); }
    }
    ctx.fillStyle = '#697078';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    columnIds.forEach((id, index) => { if (index % Math.max(1, Math.ceil(columnIds.length / 12)) === 0) ctx.fillText(String(id), margin.left + (index + 0.5) * cellW, size.height - 18); });
    ctx.textAlign = 'right';
    rowIds.forEach((id, index) => { if (index % Math.max(1, Math.ceil(rowIds.length / 12)) === 0) ctx.fillText(String(id), margin.left - 8, margin.top + (index + 0.65) * cellH); });
    ctx.textAlign = 'center';
    ctx.fillText(mode === 'models' ? 'LDA topic' : 'Full-text topic', margin.left + width / 2, size.height - 3);
    ctx.save();
    ctx.translate(11, margin.top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(mode === 'models' ? 'BERTopic topic' : 'Abstract topic', 0, 0);
    ctx.restore();
  }, [cells, columnIds, lookup, mode, rowIds, selected, size]);

  function locate(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const margin = { left: 44, right: 14, top: 14, bottom: 38 };
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < margin.left || x > size.width - margin.right || y < margin.top || y > size.height - margin.bottom) return null;
    const column = columnIds[Math.floor(((x - margin.left) / (size.width - margin.left - margin.right)) * columnIds.length)];
    const row = rowIds[Math.floor(((y - margin.top) / (size.height - margin.top - margin.bottom)) * rowIds.length)];
    return lookup.get(`${row}:${column}`) ?? null;
  }

  return <div ref={wrapRef} className="min-h-0 flex-1"><canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" aria-label="Interactive topic contingency matrix" onPointerMove={(event) => { const cell = locate(event); event.currentTarget.title = cell ? `${cell.count} papers` : ''; }} onClick={(event) => onSelect(locate(event))} /></div>;
}

function labelFor(topics: ModelTopic[], id?: number) { return topics.find((topic) => topic.id === id)?.label ?? `Topic ${id}`; }

function LdaDiagnostics({ data }: { data: MethodsData }) {
  const topics = [...data.topics.lda].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...topics.map((topic) => topic.count));
  const stabilityCount = topics.filter((topic) => topic.stability).length;
  const weightedDominance = topics.reduce((sum, topic) => sum + (topic.mean_dominance ?? 0) * topic.count, 0) / topics.reduce((sum, topic) => sum + topic.count, 0);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6 max-sm:p-4">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-3 gap-px border border-border bg-border max-sm:grid-cols-1">
          <div className="bg-background p-4"><p className="data-kicker">Model cohort</p><p className="mt-1 font-mono text-2xl">2,052</p><p className="mt-1 text-xs text-muted-foreground">abstracts with LDA assignments</p></div>
          <div className="bg-background p-4"><p className="data-kicker">Selected resolution</p><p className="mt-1 font-mono text-2xl">37</p><p className="mt-1 text-xs text-muted-foreground">mixed-membership topics</p></div>
          <div className="bg-background p-4"><p className="data-kicker">Mean dominant share</p><p className="mt-1 font-mono text-2xl">{Math.round(weightedDominance * 100)}%</p><p className="mt-1 text-xs text-muted-foreground">the model is intentionally diffuse</p></div>
        </div>
        <div className="mt-5 overflow-hidden border border-border">
          <div className="grid grid-cols-[minmax(180px,1.5fr)_80px_110px_120px] gap-4 border-b border-border bg-[var(--panel-background)] px-4 py-2 text-[9px] font-semibold uppercase tracking-[.1em] text-muted-foreground max-sm:grid-cols-[minmax(140px,1fr)_60px_80px]"><span>Automated descriptor</span><span>Papers</span><span>Mean focus</span><span className="max-sm:hidden">Seed recurrence</span></div>
          {topics.map((topic) => <div key={topic.id} className="grid grid-cols-[minmax(180px,1.5fr)_80px_110px_120px] items-center gap-4 border-b border-border/70 px-4 py-2.5 text-xs last:border-b-0 max-sm:grid-cols-[minmax(140px,1fr)_60px_80px]"><div className="min-w-0"><p className="truncate font-medium">{topic.id}. {topic.label}</p><p className="mt-0.5 truncate text-[9px] text-muted-foreground">{topic.terms?.slice(0, 6).join(' · ')}</p><div className="mt-1 h-1 bg-muted"><div className="h-full bg-primary/65" style={{ width: `${(topic.count / maxCount) * 100}%` }} /></div></div><span className="font-mono">{topic.count}</span><span className="font-mono">{Math.round((topic.mean_dominance ?? 0) * 100)}%</span><span className="font-mono text-muted-foreground max-sm:hidden">{topic.stability ? topic.stability.recurrence.toFixed(2) : '—'}</span></div>)}
        </div>
        <p className="mt-4 text-[10px] leading-4 text-muted-foreground">Topic descriptors combine the most probable term with a relevance-weighted distinctive term; they are navigation labels, not substantive definitions. Seed recurrence is available for {stabilityCount} published topic diagnostics only, so missing values are shown rather than imputed. The selected model used α=0.01.</p>
      </div>
    </div>
  );
}

export function MethodsWorkspace() {
  const [data, setData] = useState<MethodsData | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<MatrixMode>('models');
  const [selected, setSelected] = useState<ContingencyCell | null>(null);
  const [rowChoice, setRowChoice] = useState('');
  const [columnChoice, setColumnChoice] = useState('');
  useEffect(() => { let active = true; fetch('/data/methods.json').then((response) => { if (!response.ok) throw new Error(`Methods data returned ${response.status}`); return response.json() as Promise<MethodsData>; }).then((payload) => active && setData(payload)).catch((cause: Error) => active && setError(cause.message)); return () => { active = false; }; }, []);
  const changeMode = (next: MatrixMode) => { setMode(next); setSelected(null); setRowChoice(''); setColumnChoice(''); };
  if (error) return <DataError message={error} />;
  if (!data) return <DataLoading label="Loading comparison evidence" />;
  const crossRows = data.topics.abstract.filter((topic) => topic.id >= 0);
  const crossColumns = data.topics.lda.filter((topic) => topic.id >= 0).map((topic) => ({ id: topic.id, label: topic.label, terms: topic.terms ?? [] }));
  const rows = mode === 'models' ? crossRows : data.paired.abstract_topics.filter((topic) => topic.id >= 0);
  const columns = mode === 'models' ? crossColumns : data.paired.fulltext_topics.filter((topic) => topic.id >= 0);
  const cells = mode === 'models' ? data.cross_method.cells : data.paired.cells;
  const metric = mode === 'models' ? { n: data.cross_method.n, ari: data.cross_method.ari, ami: data.cross_method.ami } : { n: data.paired.both_non_outlier_n, ari: data.paired.ari_non_outliers, ami: data.paired.ami_non_outliers };
  const topCells = [...cells].sort((a, b) => b.count - a.count).slice(0, 6);
  const chooseIntersection = (nextRow: string, nextColumn: string) => {
    setRowChoice(nextRow); setColumnChoice(nextColumn);
    if (!nextRow || !nextColumn) { setSelected(null); return; }
    const row = Number(nextRow); const column = Number(nextColumn);
    const match = cells.find((cell) => (mode === 'models' ? cell.bertopic === row && cell.lda === column : cell.abstract === row && cell.fulltext === column));
    setSelected(match ?? (mode === 'models' ? { bertopic: row, lda: column, count: 0 } : { abstract: row, fulltext: column, count: 0 }));
  };
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background" aria-labelledby="methods-title">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-b border-border px-6 py-4 max-sm:grid-cols-1 max-sm:px-4">
        <div><p className="data-kicker">Method comparison</p><h2 id="methods-title" className="mt-1 font-heading text-2xl font-medium">Agreement is evidence, not a verdict</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">The same records can form different partitions under different models or text sources. The matrix makes those overlaps inspectable without treating either solution as ground truth.</p></div>
        <div className="flex items-center gap-1 self-center border border-border p-0.5 max-sm:grid max-sm:w-full max-sm:grid-cols-3">
          <Button size="sm" variant={mode === 'models' ? 'default' : 'ghost'} className="rounded-none max-sm:px-1 max-sm:text-[10px]" onClick={() => changeMode('models')}>BERTopic ↔ LDA</Button>
          <Button size="sm" variant={mode === 'length' ? 'default' : 'ghost'} className="rounded-none max-sm:px-1 max-sm:text-[10px]" onClick={() => changeMode('length')}>Abstract ↔ full text</Button>
          <Button size="sm" variant={mode === 'lda' ? 'default' : 'ghost'} className="rounded-none max-sm:px-1 max-sm:text-[10px]" onClick={() => changeMode('lda')}>LDA diagnostics</Button>
        </div>
      </div>
      {mode === 'lda' ? <LdaDiagnostics data={data} /> : <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_310px] max-lg:grid-cols-1 max-lg:grid-rows-[minmax(300px,1fr)_220px]">
        <div className="flex min-h-[340px] flex-col border-r border-border p-4 lg:min-h-[430px] max-lg:border-b max-lg:border-r-0"><MatrixCanvas cells={cells} rows={rows} columns={columns} mode={mode} selected={selected} onSelect={setSelected} /></div>
        <aside className="min-h-0 overflow-auto bg-[var(--panel-background)] p-5">
          <div className="grid grid-cols-3 gap-3 border-b border-border pb-5"><div><p className="data-kicker">Cohort</p><p className="mt-1 font-mono text-lg">{metric.n.toLocaleString()}</p></div><div><p className="data-kicker">ARI</p><p className="mt-1 font-mono text-lg">{metric.ari.toFixed(3)}</p></div><div><p className="data-kicker">AMI</p><p className="mt-1 font-mono text-lg">{metric.ami.toFixed(3)}</p></div></div>
          {selected ? <div className="border-b border-border py-5"><p className="data-kicker">Selected intersection</p><div className="mt-3 flex items-center gap-2 text-sm"><span>{labelFor(rows, mode === 'models' ? selected.bertopic : selected.abstract)}</span><ArrowRight className="size-3 shrink-0 text-muted-foreground" /><span>{labelFor(columns, mode === 'models' ? selected.lda : selected.fulltext)}</span></div><p className="mt-3 font-mono text-2xl">{selected.count}</p><p className="text-xs text-muted-foreground">papers in this cell</p></div> : <div className="border-b border-border py-5 text-xs leading-5 text-muted-foreground"><Info className="mb-2 size-4" />Select a cell to read an intersection. Darker cells contain more papers; blank cells contain none.</div>}
          <div className="border-b border-border py-5"><p className="data-kicker">Keyboard matrix</p><div className="mt-2 grid gap-2"><label className="text-[10px] text-muted-foreground">{mode === 'models' ? 'BERTopic topic' : 'Abstract topic'}<select value={rowChoice} onChange={(event) => chooseIntersection(event.target.value, columnChoice)} className="mt-1 h-8 w-full border border-border bg-background px-2 text-xs text-foreground"><option value="">Choose a row</option>{rows.map((topic) => <option key={topic.id} value={topic.id}>{topic.id}. {topic.label}</option>)}</select></label><label className="text-[10px] text-muted-foreground">{mode === 'models' ? 'LDA topic' : 'Full-text topic'}<select value={columnChoice} onChange={(event) => chooseIntersection(rowChoice, event.target.value)} className="mt-1 h-8 w-full border border-border bg-background px-2 text-xs text-foreground"><option value="">Choose a column</option>{columns.map((topic) => <option key={topic.id} value={topic.id}>{topic.id}. {topic.label}</option>)}</select></label></div></div>
          <div className="py-5"><p className="data-kicker">Largest intersections</p><ol className="mt-3 space-y-3">{topCells.map((cell, index) => <li key={index}><button className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 text-left text-xs hover:text-primary" onClick={() => { const row = mode === 'models' ? cell.bertopic : cell.abstract; const column = mode === 'models' ? cell.lda : cell.fulltext; setRowChoice(String(row)); setColumnChoice(String(column)); setSelected(cell); }}><span className="truncate">{labelFor(rows, mode === 'models' ? cell.bertopic : cell.abstract)} → {labelFor(columns, mode === 'models' ? cell.lda : cell.fulltext)}</span><span className="font-mono">{cell.count}</span></button></li>)}</ol></div>
          <p className="border-t border-border pt-4 text-[10px] leading-4 text-muted-foreground">{mode === 'models' ? 'Comparison is restricted to records with non-outlier BERTopic and LDA assignments.' : `${data.paired.eligible_n} records have both text forms; ${data.paired.both_non_outlier_n} are non-outliers in both selected fits.`}</p>
        </aside>
      </div>}
    </section>
  );
}
