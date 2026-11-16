/** Small, consistent trust signals: stars, vouches, jobs done. */

export function Stars({ avg, count, size = "sm" }: { avg: number | null | undefined; count: number | undefined; size?: "sm" | "lg" }) {
  if (!count) return <span className={`text-muted ${size === "lg" ? "text-sm" : "text-xs"}`}>No reviews yet</span>;
  const value = Number(avg ?? 0);
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${size === "lg" ? "text-sm" : "text-xs"}`}>
      <span aria-hidden className="text-accent">★</span>
      <span>{value.toFixed(1)}</span>
      <span className="font-normal text-muted">({count} review{count === 1 ? "" : "s"})</span>
      <span className="sr-only">
        rated {value.toFixed(1)} out of 5 from {count} reviews
      </span>
    </span>
  );
}

export function StarRow({ rating }: { rating: number }) {
  return (
    <span className="text-accent" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-line">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function TrustLine({
  stats,
}: {
  stats: { rating_avg: number | null; rating_count: number; jobs_done: number; vouch_count: number } | undefined;
}) {
  if (!stats) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Stars avg={stats.rating_avg} count={stats.rating_count} />
      {stats.vouch_count > 0 && (
        <span className="text-xs font-semibold text-brand">
          🤝 Vouched by {stats.vouch_count} neighbour{stats.vouch_count === 1 ? "" : "s"}
        </span>
      )}
      {stats.jobs_done > 0 && (
        <span className="text-xs text-muted">
          {stats.jobs_done} job{stats.jobs_done === 1 ? "" : "s"} done
        </span>
      )}
    </span>
  );
}
