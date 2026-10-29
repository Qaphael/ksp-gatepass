export default function DashboardLoading() {
  return <div role="status" aria-label="Loading page" aria-busy="true" className="flex motion-safe:animate-pulse flex-col gap-4">
    <div className="h-8 w-48 rounded bg-muted" />
    <div className="h-4 w-72 max-w-full rounded bg-muted" />
    <div className="h-12 w-full rounded-lg bg-muted" />
    <div className="grid gap-3 md:hidden">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-xl border bg-muted/40" />)}</div>
    <div className="hidden h-72 rounded-xl border bg-muted/40 md:block" />
  </div>;
}
