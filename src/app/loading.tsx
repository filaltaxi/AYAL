export default function Loading() {
  return (
    <div className="space-y-3 pt-2" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-line/60" />
      <div className="h-24 animate-pulse rounded-2xl bg-line/40" />
      <div className="h-24 animate-pulse rounded-2xl bg-line/40" />
      <div className="h-24 animate-pulse rounded-2xl bg-line/40" />
    </div>
  );
}
