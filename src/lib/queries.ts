import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Category, Locality, PersonStats, Review } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/env";

/** A listing with its owner, category and home locality (for detail and "my skills"). */
export const LISTING_DETAIL_SELECT =
  "id, title, description, price_text, availability, is_paused, created_at, owner_id, locality_id, category_id," +
  " owner:profiles!listings_owner_id_fkey(id, display_name, photo_url, location_verified, created_at, home_locality_id)," +
  " category:categories(id, slug, name, icon)," +
  " service_areas:listing_service_areas(locality:localities(id, slug, name))";

export type ListingDetail = {
  id: string;
  title: string;
  description: string;
  price_text: string;
  availability: string;
  is_paused: boolean;
  created_at: string;
  owner_id: string;
  locality_id: number;
  category_id: number;
  owner: {
    id: string;
    display_name: string;
    photo_url: string | null;
    location_verified: boolean;
    created_at: string;
    home_locality_id: number;
  } | null;
  category: Category | null;
  service_areas: { locality: { id: number; slug: string; name: string } | null }[];
};

/** One card on a browse page (shape returned by browse_listings). */
export type BrowseItem = {
  id: string;
  title: string;
  description: string;
  price_text: string;
  availability: string;
  created_at: string;
  is_local: boolean;
  home_locality: string;
  category: Category;
  owner: { id: string; display_name: string; photo_url: string | null; location_verified: boolean } | null;
  stats: { rating_avg: number | null; rating_count: number; jobs_done: number; vouch_count: number };
};

export async function getLocalities(): Promise<Locality[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("localities").select("id, slug, name, city, is_active").order("sort");
  return (data ?? []) as Locality[];
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, slug, name, icon").eq("is_active", true).order("sort");
  return (data ?? []) as Category[];
}

export async function browseListings(localityId: number, categoryId: number | null, query: string | null, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("browse_listings", {
    p_locality: localityId,
    p_category: categoryId,
    p_query: query,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  return data as { total: number; items: BrowseItem[] };
}

/** Track records for several people in one call. */
export async function getPeopleStats(ids: (string | null | undefined)[]): Promise<Map<string, PersonStats>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, PersonStats>();
  if (!unique.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("people_stats", { p_ids: unique });
  for (const row of (data ?? []) as PersonStats[]) map.set(row.user_id, row);
  return map;
}

export async function getProviderReviews(providerId: string, limit = 20): Promise<Review[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("provider_reviews", { p_provider: providerId, p_limit: limit });
  return (data ?? []) as Review[];
}

/** Open localities within 5 km of a home locality (for "also serves"). */
export async function getNearbyOpenLocalities(localityId: number) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("nearby_localities", { p_locality: localityId, p_km: 5 });
  return ((data ?? []) as { id: number; slug: string; name: string; distance_km: number; is_active: boolean }[]).filter(
    (l) => l.is_active,
  );
}
