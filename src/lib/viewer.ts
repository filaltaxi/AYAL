import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Viewer = {
  userId: string;
  email: string | null;
  googleName: string | null;
  googlePhoto: string | null;
  phone: string | null;
  phoneVerified: boolean;
  profile: Profile | null;
};

/** The signed-in person, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  return {
    userId: user.id,
    email: user.email ?? null,
    googleName: (meta.full_name as string) ?? (meta.name as string) ?? null,
    googlePhoto: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
    phone: user.phone || null,
    phoneVerified: Boolean(user.phone_confirmed_at),
    profile: (profile as Profile) ?? null,
  };
});

/** Turns a Postgres function error into a short sentence for the person. */
export function friendlyError(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("permission denied") || msg.includes("row-level security")) {
    return "You can't do that.";
  }
  return msg;
}
