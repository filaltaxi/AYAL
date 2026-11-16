import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getCategories } from "@/lib/queries";
import { ListingForm } from "../ListingForm";

export const metadata = { title: "Offer a skill" };

export default async function NewListingPage() {
  const viewer = await getViewer();
  const here = "/me/listings/new";
  if (!viewer) redirect(`/login?next=${here}`);
  if (!viewer.profile) redirect(`/onboarding?next=${here}`);
  if (!viewer.phoneVerified) redirect(`/verify-phone?next=${here}`);

  const supabase = await createClient();
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", viewer.userId);

  if ((count ?? 0) >= 3) {
    return (
      <div>
        <h1 className="page-title">You have 3 listings</h1>
        <p className="mt-2 text-muted">That&apos;s the limit for now. Edit or delete one to add something new.</p>
        <Link href="/me/listings" className="btn-outline mt-4">My skills</Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/me/listings" className="btn-link">← My skills</Link>
      <h1 className="page-title mt-3">Offer a skill</h1>
      <p className="mt-1 text-muted">Your listing appears in your home locality. People send you a request; you decide who to help.</p>
      <ListingForm categories={await getCategories()} />
    </div>
  );
}
