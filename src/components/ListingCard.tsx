import Link from "next/link";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import type { ListingCard as Card } from "@/lib/queries";

export function ListingCard({ listing }: { listing: Card }) {
  const owner = listing.owner;
  return (
    <Link href={`/listing/${listing.id}`} className="card block p-4 transition hover:border-brand hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">
            {listing.category?.icon} {listing.category?.name}
          </p>
          <h3 className="mt-0.5 text-[17px] leading-snug font-bold">{listing.title}</h3>
        </div>
        <span className="shrink-0 rounded-lg bg-accent-soft px-2 py-1 text-sm font-bold text-accent">{listing.price_text}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[15px] text-muted">{listing.description}</p>
      {owner && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Avatar name={owner.display_name} url={owner.photo_url} size={26} />
          <span className="text-sm font-semibold">{owner.display_name}</span>
          <VerifiedBadge verified={owner.location_verified} />
        </div>
      )}
    </Link>
  );
}
