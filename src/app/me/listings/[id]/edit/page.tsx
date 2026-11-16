import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getCategories } from "@/lib/queries";
import type { Listing } from "@/lib/types";
import { ListingForm } from "../../ListingForm";

export const metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/me/listings/${id}/edit`);

  const supabase = await createClient();
  const { data } = await supabase.from("listings").select("*").eq("id", id).eq("owner_id", viewer.userId).maybeSingle();
  if (!data) notFound();

  return (
    <div>
      <Link href="/me/listings" className="btn-link">← My skills</Link>
      <h1 className="page-title mt-3">Edit listing</h1>
      <ListingForm categories={await getCategories()} listing={data as Listing} />
    </div>
  );
}
