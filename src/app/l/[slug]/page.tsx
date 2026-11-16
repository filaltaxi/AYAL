import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { browseListings, getCategories, getLocalities } from "@/lib/queries";
import { ListingCard } from "@/components/ListingCard";
import { WaitlistButton } from "@/components/WaitlistButton";
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
  searchParams: Promise<{ c?: string; page?: string; q?: string }>;
}) {
  const { slug } = await params;
  const { c, page: pageParam, q: rawQ } = await searchParams;
  const [localities, categories, viewer] = await Promise.all([getLocalities(), getCategories(), getViewer()]);
  const locality = localities.find((l) => l.slug === slug);
  if (!locality) notFound();

  const isHome = viewer?.profile?.home_locality_id === locality.id;
  const homeName = viewer?.profile && localities.find((l) => l.id === viewer.profile!.home_locality_id)?.name;

  if (!locality.is_active) {
    const supabase = await createClient();
    const { data: wait } = await supabase.rpc("locality_waitlist", { p_locality: locality.id });
    const waiting = (wait ?? { count: 0, joined: false }) as { count: number; joined: boolean };
    return (
      <div className="pt-6">
        <Link href="/?pick=1" className="btn-link">← Change locality</Link>
        <h1 className="page-title mt-3">{locality.name} is coming soon</h1>
        <p className="mt-2 text-muted">
          Ayal is starting in Kaloor first. We open a new locality once enough neighbours are ready to offer skills there.
        </p>
        <div className="card mt-5 p-5">
          <p className="font-bold">
            {waiting.count > 0
              ? `${waiting.count} neighbour${waiting.count === 1 ? " is" : "s are"} waiting for ${locality.name}`
              : `Be the first to ask for ${locality.name}`}
          </p>
          <p className="mt-1 text-sm text-muted">Join the list and we&apos;ll know where to open next.</p>
          <div className="mt-3">
            <WaitlistButton
              localityId={locality.id}
              joined={waiting.joined}
              signedIn={Boolean(viewer)}
              next={`/l/${locality.slug}`}
            />
          </div>
        </div>
        <Link href="/l/kaloor" className="btn-outline mt-5">Look around Kaloor</Link>
      </div>
    );
  }

  const category = categories.find((x) => x.slug === c);
  const q = (rawQ ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(pageParam) || 1);
  const { total, items } = await browseListings(locality.id, category?.id ?? null, q || null, page);
  const from = (page - 1) * PAGE_SIZE;

  const href = (p: { c?: string; page?: number; q?: string }) => {
    const sp = new URLSearchParams();
    if (p.c) sp.set("c", p.c);
    if (p.q) sp.set("q", p.q);
    if (p.page && p.page > 1) sp.set("page", String(p.page));
    const s = sp.toString();
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
          You&apos;re looking around. Requests go only to people who live in or serve your home locality
          {homeName ? ` (${homeName})` : ""}.
        </p>
      )}

      <form action={`/l/${slug}`} className="mt-4 flex gap-2" role="search">
        {category && <input type="hidden" name="c" value={category.slug} />}
        <input
          name="q"
          defaultValue={q}
          maxLength={60}
          className="input"
          placeholder={`Search ${locality.name}: "maths", "tiffin", "fan repair"…`}
          aria-label="Search listings"
        />
        <button className="btn-outline shrink-0">Search</button>
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ q })} className={category ? "chip" : "chip-active"}>All</Link>
        {categories.map((cat) => (
          <Link key={cat.id} href={href({ c: cat.slug, q })} className={category?.id === cat.id ? "chip-active" : "chip"}>
            <span aria-hidden>{cat.icon}</span> {cat.name}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card mt-5 p-6 text-center">
          <p className="text-lg font-bold">
            {q ? `Nothing matches "${q}"` : `No one here yet${category ? ` for ${category.name.toLowerCase()}` : ""}.`}
          </p>
          <p className="mt-1 text-muted">{q ? "Try a shorter word, or clear the search." : "Be the first neighbour to offer it."}</p>
          {q ? (
            <Link href={href({ c: category?.slug })} className="btn-outline mt-4">Clear search</Link>
          ) : (
            <Link href="/me/listings/new" className="btn-primary mt-4">Offer a skill</Link>
          )}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            {total} {total === 1 ? "listing" : "listings"}
            {category ? ` in ${category.name.toLowerCase()}` : ""}
            {q ? ` matching "${q}"` : ""} · neighbours first
          </p>
          <ul className="mt-2 space-y-3">
            {items.map((l) => (
              <li key={l.id}><ListingCard listing={l} here={locality.name} /></li>
            ))}
          </ul>
          {(page > 1 || from + PAGE_SIZE < total) && (
            <div className="mt-5 flex justify-between">
              {page > 1 ? <Link href={href({ c, q, page: page - 1 })} className="btn-outline">← Previous</Link> : <span />}
              {from + PAGE_SIZE < total && <Link href={href({ c, q, page: page + 1 })} className="btn-outline">More →</Link>}
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
