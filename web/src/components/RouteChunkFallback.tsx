/** Lightweight placeholder while a dynamically imported route chunk loads (server-safe). */
export function RouteChunkFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/25 border-t-cyan-400"
          aria-hidden
        />
        <p className="text-sm text-zinc-500">{label}</p>
      </div>
    </div>
  );
}
