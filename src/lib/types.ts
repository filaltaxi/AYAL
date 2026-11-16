export type Locality = {
  id: number;
  slug: string;
  name: string;
  city: string;
  is_active: boolean;
};

export type Category = { id: number; slug: string; name: string; icon: string };

export type Profile = {
  id: string;
  display_name: string;
  photo_url: string | null;
  home_locality_id: number;
  location_verified: boolean;
  locality_changed_at: string;
  created_at: string;
};

export type Listing = {
  id: string;
  owner_id: string;
  locality_id: number;
  category_id: number;
  title: string;
  description: string;
  price_text: string;
  availability: string;
  is_paused: boolean;
  created_at: string;
};

export type RequestStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled" | "done";

export type Message = {
  id: number;
  request_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type LocalityCandidate = {
  id: number;
  slug: string;
  name: string;
  distance_km?: number;
  distance_m?: number;
  is_active: boolean;
};

/** One person's track record (from people_stats). */
export type PersonStats = {
  user_id: string;
  rating_avg: number | null;
  rating_count: number;
  jobs_done: number;
  asked_done: number;
  vouch_count: number;
};

export type Review = {
  id: number;
  rating: number;
  comment: string | null;
  listing_title: string;
  created_at: string;
  reviewer_name: string;
};

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string } | null;
