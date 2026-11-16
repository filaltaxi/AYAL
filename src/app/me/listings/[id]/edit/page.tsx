import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getCategories, getLocalities, getNearbyOpenLocalities } from "@/lib/queries";
import type { Listing } from "@/lib/types";
import { ListingForm } from "../../ListingForm";

export const metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/me/listings/${id}/edit`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: areaRows }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", viewer.userId).maybeSingle(),
    supabase.from("listing_service_areas").select("locality_id").eq("listing_id", id),
  ]);
  if (!data) notFound();
  const listing = data as Listing;
  const [categories, nearby, localities] = await Promise.all([
    getCategories(),
    getNearbyOpenLocalities(listing.locality_id),
    getLocalities(),
  ]);
  const home = localities.find((l) => l.id === listing.locality_id);

  return (
    <div>
      <Link href="/me/listings" className="btn-link">← My skills</Link>
      <h1 className="page-title mt-3">Edit listing</h1>
      <ListingForm
        categories={categories}
        listing={listing}
        nearby={nearby}
        selectedAreas={(areaRows ?? []).map((r) => r.locality_id as number)}
        homeName={home?.name ?? "your locality"}
      />
    </div>
  );
}
