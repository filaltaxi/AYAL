import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Category, Locality } from "@/lib/types";

export const LISTING_CARD_SELECT =
  "id, title, description, price_text, availability, is_paused, created_at, owner_id, locality_id, category_id," +
  " owner:profiles!listings_owner_id_fkey(id, display_name, photo_url, location_verified, created_at)," +
  " category:categories(id, slug, name, icon)";

export type ListingCard = {
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
  owner: { id: string; display_name: string; photo_url: string | null; location_verified: boolean; created_at: string } | null;
  category: Category | null;
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
