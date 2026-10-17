'use client';

import { useEffect, useState } from 'react';

import { CorrelationWorkspace } from '@/components/atlas/correlation-workspace';
import { DataError } from '@/components/atlas/data-state';
import { MethodologySection } from '@/components/atlas/methodology-section';
import { PapersWorkspace } from '@/components/atlas/papers-workspace';
import { WorkspaceErrorBoundary } from '@/components/atlas/workspace-error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { MapData } from '@/lib/atlas-types';

export function AtlasApp() {
  const [workspace, setWorkspaceState] = useState<'papers' | 'correlations' | 'methodology'>(
    'papers',
  );
  const setWorkspace = (next: 'papers' | 'correlations' | 'methodology') => {setWorkspaceState(next);window.location.hash=next==='papers'?'map':next==='correlations'?'associations':next;};
  useEffect(()=>{const sync=()=>setWorkspaceState(window.location.hash==='#associations'?'correlations':window.location.hash==='#methodology'?'methodology':'papers');sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
  const [map, setMap] = useState<MapData | null>(null);
  const [mapError, setMapError] = useState('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(new URL('data/map.json', document.baseURI), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Map data returned ${response.status}`);
        return response.json() as Promise<MapData>;
      })
      .then((payload) => active && setMap(payload))
      .catch((cause: Error) => active && setMapError(cause.message));
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <TooltipProvider delay={300}>
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header className="grid min-h-[68px] shrink-0 grid-cols-[minmax(220px,1fr)_auto] items-center border-b border-border bg-background px-5 max-md:grid-cols-[minmax(0,1fr)_auto] max-sm:min-h-[100px] max-sm:px-3">
          <div className="flex min-w-0 items-baseline gap-3 max-sm:col-span-full max-sm:py-2">
            <h1 className="font-heading text-[24px] font-medium tracking-[-0.025em]">
              JSTOR AI Ethics Atlas
            </h1>
          </div>
          <nav className="flex self-stretch" aria-label="Atlas views">
            <button
              onClick={() => setWorkspace('papers')}
              className={`border-b-2 px-4 text-sm font-medium transition-colors ${workspace === 'papers' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Map
            </button>
            <button
              onClick={() => setWorkspace('correlations')}
              className={`border-b-2 px-4 text-sm font-medium transition-colors ${workspace === 'correlations' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Associations
            </button>
          <button className="px-4 text-sm" onClick={() => setWorkspace('methodology')}>Methodology</button></nav>
        </header>
        <div className="min-h-0 flex-1 flex flex-col" style={{display:workspace==='papers'?'flex':'none'}}><WorkspaceErrorBoundary>{mapError?<DataError message={mapError}/>:<PapersWorkspace data={map}/>}</WorkspaceErrorBoundary></div>
        {workspace==='correlations' && map && <WorkspaceErrorBoundary><CorrelationWorkspace data={map}/></WorkspaceErrorBoundary>}
        {workspace==='methodology' && <article className="atlas-method-page"><h2>Methodology</h2><MethodologySection/></article>}
      </main>
    </TooltipProvider>
  );
}
