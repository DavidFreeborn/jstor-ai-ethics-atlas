'use client';

export function DataLoading({ label = 'Loading research data' }: { label?: string }) {
  return (
    <div className="grid h-full min-h-72 place-items-center text-sm text-muted-foreground">
      <div className="flex items-center gap-2"><span className="size-2 animate-pulse bg-primary" />{label}</div>
    </div>
  );
}

export function DataError({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-72 place-items-center p-8">
      <div className="max-w-md border border-border bg-card p-6">
        <h2 className="font-heading text-xl">This evidence view could not load</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
