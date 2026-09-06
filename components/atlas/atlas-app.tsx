'use client';

import { useEffect, useState } from 'react';

import { CorrelationWorkspace } from '@/components/atlas/correlation-workspace';
import { DataError } from '@/components/atlas/data-state';
import { MethodologyDialog } from '@/components/atlas/methodology-dialog';
import { PapersWorkspace } from '@/components/atlas/papers-workspace';
import { WorkspaceErrorBoundary } from '@/components/atlas/workspace-error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { MapData } from '@/lib/atlas-types';

export function AtlasApp() {
  const [workspace, setWorkspace] = useState<'papers' | 'correlations'>('papers');
  const [map, setMap] = useState<MapData | null>(null);
  const [mapError, setMapError] = useState('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(new URL('data/map.json', document.baseURI), {signal:controller.signal})
      .then((response) => { if (!response.ok) throw new Error(`Map data returned ${response.status}`); return response.json() as Promise<MapData>; })
      .then((payload) => active && setMap(payload))
      .catch((cause: Error) => active && setMapError(cause.message));
    return () => { active = false; controller.abort(); };
  }, []);

  return (
    <TooltipProvider delay={300}>
      <main className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-background text-foreground">
        <header className="grid min-h-[68px] grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] items-center border-b border-border bg-background px-5 max-md:grid-cols-[minmax(0,1fr)_auto_auto] max-sm:min-h-[58px] max-sm:px-3">
          <div className="flex min-w-0 items-baseline gap-3 max-sm:hidden"><h1 className="truncate font-heading text-[24px] font-medium tracking-[-0.025em]">JSTOR AI Ethics Atlas</h1></div>
          <nav className="flex self-stretch" aria-label="Atlas views">
            <button onClick={() => setWorkspace('papers')} className={`border-b-2 px-4 text-sm font-medium transition-colors ${workspace === 'papers' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Papers</button>
            <button onClick={() => setWorkspace('correlations')} className={`border-b-2 px-4 text-sm font-medium transition-colors ${workspace === 'correlations' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Correlation matrices</button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <MethodologyDialog />
          </div>
        </header>
        <WorkspaceErrorBoundary key={workspace}>
          {mapError ? <DataError message={mapError} /> : map ? workspace === 'papers' ? <PapersWorkspace data={map} /> : <CorrelationWorkspace data={map} /> : <PapersWorkspace data={null} />}
        </WorkspaceErrorBoundary>
      </main>
    </TooltipProvider>
  );
}
