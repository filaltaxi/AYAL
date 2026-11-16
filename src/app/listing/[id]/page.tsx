import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getLocalities, LISTING_CARD_SELECT, type ListingCard } from "@/lib/queries";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import { ReportForm } from "@/components/ReportForm";
import { memberSince } from "@/lib/format";
import { RequestForm } from "./RequestForm";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, viewer, localities] = await Promise.all([
    supabase.from("listings").select(LISTING_CARD_SELECT).eq("id", id).maybeSingle(),
    getViewer(),
    getLocalities(),
  ]);
  const listing = data as unknown as ListingCard | null;
  if (!listing) notFound();

  const locality = localities.find((l) => l.id === listing.locality_id);
  const owner = listing.owner!;
  const isOwner = viewer?.userId === listing.owner_id;

  let openRequestId: string | null = null;
  if (viewer && !isOwner) {
    const { data: open } = await supabase
      .from("requests")
      .select("id")
      .eq("listing_id", listing.id)
      .eq("seeker_id", viewer.userId)
      .in("status", ["pending", "accepted"])
      .maybeSingle();
    openRequestId = open?.id ?? null;
  }

  const back = `/listing/${listing.id}`;
  let gate: React.ReactNode = null;
  if (!viewer) {
    gate = <Gate text="Sign in to send a request." href={`/login?next=${encodeURIComponent(back)}`} cta="Sign in" />;
  } else if (!viewer.profile) {
    gate = <Gate text="Finish setting up your profile first." href={`/onboarding?next=${encodeURIComponent(back)}`} cta="Set up profile" />;
  } else if (isOwner) {
    gate = <Gate text="This is your listing." href={`/me/listings/${listing.id}/edit`} cta="Edit listing" />;
  } else if (openRequestId) {
    gate = <Gate text="You already have an open request for this." href={`/requests/${openRequestId}`} cta="Open request" />;
  } else if (!viewer.phoneVerified) {
    gate = <Gate text="Verify your phone number before your first request. It's never shown to anyone." href={`/verify-phone?next=${encodeURIComponent(back)}`} cta="Verify phone" />;
  } else if (viewer.profile.home_locality_id !== listing.locality_id) {
    gate = <p className="text-sm text-muted">You can only send requests to people in your home locality. This listing is in {locality?.name}.</p>;
  }

  return (
    <div>
      {locality && <Link href={`/l/${locality.slug}`} className="btn-link">← {locality.name}</Link>}
      <article className="card mt-3 p-5">
        <p className="text-sm font-semibold text-muted">{listing.category?.icon} {listing.category?.name}</p>
        <h1 className="page-title mt-1">{listing.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-accent-soft px-2.5 py-1 font-bold text-accent">{listing.price_text}</span>
          {listing.availability && <span className="rounded-lg bg-paper px-2.5 py-1 text-muted ring-1 ring-line">🕒 {listing.availability}</span>}
          {listing.is_paused && <span className="rounded-lg bg-paper px-2.5 py-1 text-muted ring-1 ring-line">Paused</span>}
        </div>
        <p className="mt-4 text-[16px] leading-relaxed whitespace-pre-line">{listing.description}</p>

        <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
          <Avatar name={owner.display_name} url={owner.photo_url} size={44} />
          <div>
            <p className="font-bold">{owner.display_name}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              Lives in {locality?.name} · on Ayal since {memberSince(owner.created_at)}
              <VerifiedBadge verified={owner.location_verified} />
            </p>
          </div>
        </div>
      </article>

      <section className="card mt-4 p-5">
        <h2 className="text-lg font-bold">Send a request</h2>
        <p className="mt-1 text-sm text-muted">
          {owner.display_name} sees your message and decides. Phone numbers are never shared; if they accept, you chat here.
        </p>
        <div className="mt-4">{gate ?? <RequestForm listingId={listing.id} ownerName={owner.display_name} />}</div>
      </section>

      {viewer && !isOwner && (
        <div className="mt-4 px-1"><ReportForm targetType="listing" targetId={listing.id} label="Report this listing" /></div>
      )}
    </div>
  );
}

function Gate({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">{text}</p>
      <Link href={href} className="btn-primary">{cta}</Link>
    </div>
  );
}
