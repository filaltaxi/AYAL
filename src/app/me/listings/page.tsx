import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { LISTING_DETAIL_SELECT, type ListingDetail } from "@/lib/queries";
import { ListingRowActions } from "./ListingRowActions";

export const metadata = { title: "My skills" };

export default async function MyListingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/me/listings");
  if (!viewer.profile) redirect("/onboarding?next=/me/listings");

  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const [{ data }, { data: viewRows }] = await Promise.all([
    supabase.from("listings").select(LISTING_DETAIL_SELECT).eq("owner_id", viewer.userId).order("created_at", { ascending: false }),
    supabase.from("listing_daily_views").select("listing_id, views").gte("day", weekAgo),
  ]);
  const listings = (data ?? []) as unknown as ListingDetail[];
  const views = new Map<string, number>();
  for (const r of viewRows ?? []) views.set(r.listing_id, (views.get(r.listing_id) ?? 0) + r.views);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h1 className="page-title">My skills</h1>
        {listings.length < 3 && <Link href="/me/listings/new" className="btn-primary">+ New</Link>}
      </div>
      <p className="mt-1 text-sm text-muted">
        You can have up to 3 listings. Pause one anytime you&apos;re busy.{" "}
        <Link href={`/u/${viewer.userId}`} className="btn-link">See your public profile</Link>
      </p>

      {listings.length === 0 ? (
        <div className="card mt-5 p-6 text-center">
          <p className="text-lg font-bold">What are you good at?</p>
          <p className="mt-1 text-muted">Teaching, cooking, fixing, errands, tech help. Neighbours pay for everyday skills.</p>
          <Link href="/me/listings/new" className="btn-primary mt-4">Offer your first skill</Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {listings.map((l) => {
            const areas = l.service_areas.map((s) => s.locality?.name).filter(Boolean);
            const seen = views.get(l.id) ?? 0;
            return (
              <li key={l.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted">{l.category?.icon} {l.category?.name}</p>
                    <Link href={`/listing/${l.id}`} className="text-[17px] font-bold hover:text-brand">{l.title}</Link>
                    <p className="text-sm text-muted">{l.price_text}</p>
                    {areas.length > 0 && <p className="mt-1 text-xs text-muted">Also serves {areas.join(", ")}</p>}
                  </div>
                  {l.is_paused ? (
                    <span className="badge bg-paper text-muted ring-1 ring-line">Paused</span>
                  ) : (
                    <span className="badge bg-brand-soft text-brand">Live</span>
                  )}
                </div>
                <p className="mt-2 text-sm">
                  👀 <strong>{seen}</strong> neighbour{seen === 1 ? "" : "s"} viewed this in the last 7 days
                </p>
                <ListingRowActions id={l.id} paused={l.is_paused} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
