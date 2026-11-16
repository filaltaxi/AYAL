import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getCategories, getLocalities, LISTING_CARD_SELECT, type ListingCard as Card } from "@/lib/queries";
import { ListingCard } from "@/components/ListingCard";
import { PAGE_SIZE } from "@/lib/env";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loc = (await getLocalities()).find((l) => l.slug === slug);
  return { title: loc ? `Skills in ${loc.name}` : "Locality" };
}

export default async function LocalityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string; page?: string }>;
}) {
  const { slug } = await params;
  const { c, page: pageParam } = await searchParams;
  const [localities, categories, viewer] = await Promise.all([getLocalities(), getCategories(), getViewer()]);
  const locality = localities.find((l) => l.slug === slug);
  if (!locality) notFound();

  const isHome = viewer?.profile?.home_locality_id === locality.id;
  const homeName = viewer?.profile && localities.find((l) => l.id === viewer.profile!.home_locality_id)?.name;

  if (!locality.is_active) {
    return (
      <div className="pt-6">
        <Link href="/?pick=1" className="btn-link">← Change locality</Link>
        <h1 className="page-title mt-3">{locality.name} is coming soon</h1>
        <p className="mt-2 text-muted">
          Ayal is starting in Kaloor first. If you live in {locality.name}, we&apos;ll open it once enough neighbours are ready to
          offer skills.
        </p>
        <Link href="/l/kaloor" className="btn-outline mt-5">Look around Kaloor</Link>
      </div>
    );
  }

  const category = categories.find((x) => x.slug === c);
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("listings")
    .select(LISTING_CARD_SELECT, { count: "exact" })
    .eq("locality_id", locality.id)
    .eq("is_paused", false)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (category) query = query.eq("category_id", category.id);
  const { data, count } = await query;
  const listings = (data ?? []) as unknown as Card[];
  const total = count ?? 0;

  const href = (params: { c?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params.c) q.set("c", params.c);
    if (params.page && params.page > 1) q.set("page", String(params.page));
    const s = q.toString();
    return `/l/${slug}${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand">{locality.city}</p>
          <h1 className="page-title">Skills in {locality.name}</h1>
        </div>
        <Link href="/?pick=1" className="btn-link shrink-0">Change</Link>
      </div>

      {viewer?.profile && !isHome && (
        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">
          You&apos;re looking around. Requests can only go to people in your home locality{homeName ? ` (${homeName})` : ""}.
        </p>
      )}

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({})} className={category ? "chip" : "chip-active"}>All</Link>
        {categories.map((cat) => (
          <Link key={cat.id} href={href({ c: cat.slug })} className={category?.id === cat.id ? "chip-active" : "chip"}>
            <span aria-hidden>{cat.icon}</span> {cat.name}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <div className="card mt-5 p-6 text-center">
          <p className="text-lg font-bold">No one here yet{category ? ` for ${category.name.toLowerCase()}` : ""}.</p>
          <p className="mt-1 text-muted">Be the first neighbour to offer it.</p>
          <Link href="/me/listings/new" className="btn-primary mt-4">Offer a skill</Link>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            {total} {total === 1 ? "listing" : "listings"}{category ? ` in ${category.name.toLowerCase()}` : ""}
          </p>
          <ul className="mt-2 space-y-3">
            {listings.map((l) => (
              <li key={l.id}><ListingCard listing={l} /></li>
            ))}
          </ul>
          {(page > 1 || from + PAGE_SIZE < total) && (
            <div className="mt-5 flex justify-between">
              {page > 1 ? <Link href={href({ c, page: page - 1 })} className="btn-outline">← Newer</Link> : <span />}
              {from + PAGE_SIZE < total && <Link href={href({ c, page: page + 1 })} className="btn-outline">Older →</Link>}
            </div>
          )}
        </>
      )}

      <div className="card mt-8 flex items-center justify-between gap-4 bg-brand-soft p-4">
        <div>
          <p className="font-bold">Good at something?</p>
          <p className="text-sm text-muted">Tutoring, cooking, fixing, errands. Your neighbours need it.</p>
        </div>
        <Link href="/me/listings/new" className="btn-primary shrink-0">Offer a skill</Link>
      </div>
    </div>
  );
}
