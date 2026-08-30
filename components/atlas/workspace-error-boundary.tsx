'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type State = { error: Error | null; resetKey: number };

export class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Atlas workspace error', error, info.componentStack);
  }

  private reset = () => {
    this.setState((current) => ({ error: null, resetKey: current.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <section className="grid min-h-0 flex-1 place-items-center p-6" role="alert">
          <div className="w-full max-w-sm border border-border bg-background p-5">
            <h2 className="font-heading text-xl">Workspace error</h2>
            <p className="mt-2 text-sm text-muted-foreground">The current view was stopped before it could affect the rest of the atlas.</p>
            <Button className="mt-4 rounded-none" onClick={this.reset}>Reset workspace</Button>
          </div>
        </section>
      );
    }

    return <div key={this.state.resetKey} className="contents">{this.props.children}</div>;
  }
}
