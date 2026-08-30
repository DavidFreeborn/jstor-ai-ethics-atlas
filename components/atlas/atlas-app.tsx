'use client';

import { useEffect, useState } from 'react';

import { ConceptsWorkspace } from '@/components/atlas/concepts-workspace';
import { DataError } from '@/components/atlas/data-state';
import { MethodologyDialog } from '@/components/atlas/methodology-dialog';
import { MethodsWorkspace } from '@/components/atlas/methods-workspace';
import { PapersWorkspace } from '@/components/atlas/papers-workspace';
import { PublishingWorkspace } from '@/components/atlas/publishing-workspace';
import { WorkspaceErrorBoundary } from '@/components/atlas/workspace-error-boundary';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { MapData, Workspace } from '@/lib/atlas-types';

const WORKSPACES: Array<{ id: Workspace; label: string }> = [
  { id: 'papers', label: 'Papers' },
  { id: 'methods', label: 'Method comparison' },
  { id: 'concepts', label: 'Keyword network' },
  { id: 'publishing', label: 'Publication networks' },
];

function initialWorkspace(): Workspace {
  if (typeof window === 'undefined') return 'papers';
  const view = new URLSearchParams(window.location.search).get('view');
  return WORKSPACES.some((item) => item.id === view) ? view as Workspace : 'papers';
}

export function AtlasApp() {
  const [map, setMap] = useState<MapData | null>(null);
  const [mapError, setMapError] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>('papers');

  useEffect(() => {
    const timer = window.setTimeout(() => setWorkspace(initialWorkspace()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let active = true;
    fetch('/data/map.json')
      .then((response) => { if (!response.ok) throw new Error(`Map data returned ${response.status}`); return response.json() as Promise<MapData>; })
      .then((payload) => active && setMap(payload))
      .catch((cause: Error) => active && setMapError(cause.message));
    return () => { active = false; };
  }, []);

  function changeWorkspace(next: Workspace) {
    setWorkspace(next);
    const url = new URL(window.location.href);
    if (next === 'papers') url.searchParams.delete('view'); else url.searchParams.set('view', next);
    window.history.replaceState({}, '', url);
  }

  return (
    <TooltipProvider delay={300}>
      <main className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-background text-foreground">
        <header className="grid min-h-16 grid-cols-[minmax(240px,1fr)_auto_minmax(240px,1fr)] items-center border-b border-border bg-background px-5 max-xl:grid-cols-[1fr_auto] max-sm:min-h-[58px] max-sm:px-3">
          <div className="flex min-w-0 items-baseline gap-3"><h1 className="truncate font-heading text-[22px] font-medium tracking-[-0.025em] max-sm:text-lg"><span className="max-sm:hidden">JSTOR AI Ethics Atlas</span><span className="hidden max-sm:inline">JSTOR Atlas</span></h1></div>
          <Tabs value={workspace} onValueChange={(value) => changeWorkspace(value as Workspace)} className="max-xl:hidden"><TabsList variant="line" aria-label="Atlas workspace">{WORKSPACES.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList></Tabs>
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="workspace-select">Atlas workspace</label>
            <select id="workspace-select" value={workspace} onChange={(event) => changeWorkspace(event.target.value as Workspace)} className="h-8 border border-border bg-background px-2 text-xs xl:hidden">{WORKSPACES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <MethodologyDialog />
          </div>
        </header>
        <WorkspaceErrorBoundary>
          {workspace === 'papers' ? (mapError ? <DataError message={mapError} /> : <PapersWorkspace data={map} />) : null}
          {workspace === 'methods' ? <MethodsWorkspace /> : null}
          {workspace === 'concepts' ? <ConceptsWorkspace /> : null}
          {workspace === 'publishing' ? <PublishingWorkspace /> : null}
        </WorkspaceErrorBoundary>
      </main>
    </TooltipProvider>
  );
}
