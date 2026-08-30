'use client';

import { useEffect, useState } from 'react';

import { DataError } from '@/components/atlas/data-state';
import { MethodologyDialog } from '@/components/atlas/methodology-dialog';
import { PapersWorkspace } from '@/components/atlas/papers-workspace';
import { WorkspaceErrorBoundary } from '@/components/atlas/workspace-error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { MapData } from '@/lib/atlas-types';

export function AtlasApp() {
  const [map, setMap] = useState<MapData | null>(null);
  const [mapError, setMapError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/data/map.json')
      .then((response) => { if (!response.ok) throw new Error(`Map data returned ${response.status}`); return response.json() as Promise<MapData>; })
      .then((payload) => active && setMap(payload))
      .catch((cause: Error) => active && setMapError(cause.message));
    return () => { active = false; };
  }, []);

  return (
    <TooltipProvider delay={300}>
      <main className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-background text-foreground">
        <header className="grid min-h-16 grid-cols-[minmax(240px,1fr)_auto] items-center border-b border-border bg-background px-5 max-sm:min-h-[58px] max-sm:px-3">
          <div className="flex min-w-0 items-baseline gap-3"><h1 className="truncate font-heading text-[22px] font-medium tracking-[-0.025em] max-sm:text-lg"><span className="max-sm:hidden">JSTOR AI Ethics Atlas</span><span className="hidden max-sm:inline">JSTOR Atlas</span></h1></div>
          <div className="ml-auto flex items-center gap-2">
            <MethodologyDialog />
          </div>
        </header>
        <WorkspaceErrorBoundary>
          {mapError ? <DataError message={mapError} /> : <PapersWorkspace data={map} />}
        </WorkspaceErrorBoundary>
      </main>
    </TooltipProvider>
  );
}
