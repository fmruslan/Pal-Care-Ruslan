export default function DashboardLoading() {
  return (
    <main
      id="main-content"
      aria-busy="true"
      className="mx-auto max-w-6xl px-5 py-12"
    >
      <p
        role="status"
        className="mb-8 text-sm font-medium text-muted-foreground"
      >
        Loading your care space…
      </p>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-10 w-2/3 rounded-xl bg-secondary" />
        <div className="h-5 w-1/2 rounded-lg bg-neutral" />
        <div className="grid gap-5 sm:grid-cols-3">
          {[1, 2, 3].map((value) => (
            <div key={value} className="h-72 rounded-3xl border bg-card p-5">
              <div className="h-40 rounded-2xl bg-secondary" />
              <div className="mt-5 h-4 w-3/4 rounded bg-neutral" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
