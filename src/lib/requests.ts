import "server-only";
import type { RequestStatus } from "@/lib/types";

export const REQUEST_SELECT =
  "id, listing_id, listing_title, seeker_id, provider_id, message, status, created_at, responded_at, closed_at, expires_at," +
  " listing:listings(id, title, price_text)," +
  " seeker:profiles!requests_seeker_id_fkey(id, display_name, photo_url, location_verified, created_at)," +
  " provider:profiles!requests_provider_id_fkey(id, display_name, photo_url, location_verified, created_at)";

export type Person = {
  id: string;
  display_name: string;
  photo_url: string | null;
  location_verified: boolean;
  created_at: string;
};

export type RequestFull = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  seeker_id: string | null;
  provider_id: string | null;
  message: string;
  status: RequestStatus;
  created_at: string;
  responded_at: string | null;
  closed_at: string | null;
  expires_at: string;
  listing: { id: string; title: string; price_text: string } | null;
  seeker: Person | null;
  provider: Person | null;
};
