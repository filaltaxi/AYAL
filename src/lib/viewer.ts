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
  isAdmin: boolean;
  profile: Profile | null;
};

/** The signed-in person, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  return {
    userId: user.id,
    email: user.email ?? null,
    googleName: (meta.full_name as string) ?? (meta.name as string) ?? null,
    googlePhoto: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
    phone: user.phone || null,
    phoneVerified: Boolean(user.phone_confirmed_at),
    isAdmin: isAdmin === true,
    profile: (profile as Profile) ?? null,
  };
});

type DbError = { message?: string; code?: string } | null | undefined;

/**
 * Turns a database error into a sentence for the person.
 * Only messages Ayal raises on purpose (code P0001) are shown as-is; anything
 * else is replaced, so internal details never reach the screen.
 */
export function friendlyError(error: DbError): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code === "P0001" && error.message) return error.message;
  const msg = error.message ?? "";
  if (error.code === "42501" || /permission denied|row-level security/i.test(msg)) return "You can't do that.";
  console.error("[db]", error);
  return "Something went wrong. Please try again.";
}
