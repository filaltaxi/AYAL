import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getLocalities, getPeopleStats, getProviderReviews } from "@/lib/queries";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import { StarRow, Stars } from "@/components/Trust";
import { ReportForm } from "@/components/ReportForm";
import { memberSince, timeAgo } from "@/lib/format";
import { VouchButton } from "./VouchButton";

export const metadata = { title: "Neighbour" };

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: person }, viewer, localities] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, photo_url, location_verified, created_at, home_locality_id")
      .eq("id", id)
      .maybeSingle(),
    getViewer(),
    getLocalities(),
  ]);
  // Profiles are visible only with a live listing, or to people who share a request with them.
  if (!person) notFound();

  const [statsMap, reviews, { data: listings }, vouched] = await Promise.all([
    getPeopleStats([person.id]),
    getProviderReviews(person.id, 20),
    supabase
      .from("listings")
      .select("id, title, price_text, is_paused, category:categories(icon, name)")
      .eq("owner_id", person.id)
      .order("created_at", { ascending: false }),
    viewer
      ? supabase.from("vouches").select("provider_id").eq("voucher_id", viewer.userId).eq("provider_id", person.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const stats = statsMap.get(person.id);
  const home = localities.find((l) => l.id === person.home_locality_id);
  const isMe = viewer?.userId === person.id;
  const sameLocality = viewer?.profile?.home_locality_id === person.home_locality_id;
  const live = ((listings ?? []) as unknown as {
    id: string;
    title: string;
    price_text: string;
    is_paused: boolean;
    category: { icon: string; name: string } | null;
  }[]).filter((l) => isMe || !l.is_paused);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <Avatar name={person.display_name} url={person.photo_url} size={64} />
          <div className="min-w-0">
            <h1 className="page-title">{person.display_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              Lives in {home?.name} · on Ayal since {memberSince(person.created_at)}
              <VerifiedBadge verified={person.location_verified} />
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Rating" value={stats?.rating_count ? `★ ${Number(stats.rating_avg).toFixed(1)}` : "—"} />
          <Stat label="Jobs done" value={String(stats?.jobs_done ?? 0)} />
          <Stat label="Vouches" value={String(stats?.vouch_count ?? 0)} />
        </dl>

        {!isMe && viewer?.profile && sameLocality && (
          <div className="mt-4 border-t border-line pt-4">
            <VouchButton providerId={person.id} vouched={Boolean(vouched.data)} name={person.display_name} />
          </div>
        )}
        {isMe && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            This is how neighbours see you. <Link href="/account" className="btn-link">Edit profile</Link>
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Skills offered</h2>
        {live.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No live listings right now.</p>
        ) : (
          <ul className="space-y-2">
            {live.map((l) => (
              <li key={l.id}>
                <Link href={`/listing/${l.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-brand">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-muted">{l.category?.icon} {l.category?.name}</span>
                    <span className="font-bold">{l.title}</span>
                    {l.is_paused && <span className="ml-2 text-xs text-muted">(paused)</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-accent">{l.price_text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="reviews">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Reviews</h2>
          <Stars avg={stats?.rating_avg} count={stats?.rating_count} />
        </div>
        {reviews.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No reviews yet. Reviews come from neighbours after a finished job.</p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <StarRow rating={r.rating} />
                  <span className="text-xs text-muted">{timeAgo(r.created_at)}</span>
                </div>
                {r.comment && <p className="mt-2 text-[15px]">{r.comment}</p>}
                <p className="mt-2 text-xs text-muted">
                  {r.reviewer_name} · for “{r.listing_title}”
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewer && !isMe && (
        <div className="px-1">
          <ReportForm targetType="user" targetId={person.id} label={`Report ${person.display_name}`} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper px-2 py-3 ring-1 ring-line">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold">{value}</dd>
    </div>
  );
}
