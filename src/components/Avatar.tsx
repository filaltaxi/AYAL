import { initials } from "@/lib/format";

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover ring-1 ring-line" style={style} />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand ring-1 ring-line" style={style}>
      {initials(name) || "?"}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="badge bg-brand-soft text-brand" title="Their GPS location matched this locality">
      ✓ Location verified
    </span>
  ) : (
    <span className="badge bg-paper text-muted ring-1 ring-line" title="They chose this locality themselves">
      Self-selected
    </span>
  );
}
