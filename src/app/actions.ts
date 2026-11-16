"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, getViewer } from "@/lib/viewer";
import { sendRequestAlert } from "@/lib/email";
import { LOCALITY_COOKIE } from "@/lib/env";
import type { ActionResult } from "@/lib/types";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => {
  const v = fd.get(key);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Safe internal redirect target (no open redirects). */
function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

// ── Locality preference (browsing only, no account needed) ───────────────
export async function rememberLocality(slug: string) {
  const store = await cookies();
  store.set(LOCALITY_COOKIE, slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

// ── Onboarding ───────────────────────────────────────────────────────────
export async function completeOnboarding(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    p_display_name: str(fd, "display_name"),
    p_dob: str(fd, "dob") || null,
    p_locality_id: num(fd, "locality_id"),
    p_lat: num(fd, "lat"),
    p_lng: num(fd, "lng"),
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const photo = str(fd, "photo_url");
  if (photo.startsWith("https://")) {
    await supabase.from("profiles").update({ photo_url: photo.slice(0, 500) }).eq("id", (await getViewer())!.userId);
  }
  redirect(`/verify-phone?next=${encodeURIComponent(safeNext(str(fd, "next"), "/"))}`);
}

// ── Listings ─────────────────────────────────────────────────────────────
export async function saveListing(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "Finish setting up your profile first." };
  const supabase = await createClient();

  const fields = {
    category_id: num(fd, "category_id"),
    title: str(fd, "title"),
    description: str(fd, "description"),
    price_text: str(fd, "price_text"),
    availability: str(fd, "availability"),
  };
  const id = str(fd, "id");

  const { error } = id
    ? await supabase.from("listings").update(fields).eq("id", id)
    : await supabase.from("listings").insert({ ...fields, owner_id: viewer.userId });
  if (error) return { ok: false, error: friendlyListingError(error.message) };

  revalidatePath("/me/listings");
  redirect("/me/listings");
}

function friendlyListingError(msg: string) {
  if (msg.includes("title")) return "Title should be 3 to 80 characters.";
  if (msg.includes("description")) return "Description should be 10 to 1000 characters.";
  if (msg.includes("price_text")) return "Add a price (up to 60 characters), e.g. ₹200/hr or 'Ask me'.";
  if (msg.includes("category_id")) return "Pick a category.";
  return friendlyError({ message: msg });
}

export async function setListingPaused(id: string, paused: boolean) {
  const supabase = await createClient();
  await supabase.from("listings").update({ is_paused: paused }).eq("id", id);
  revalidatePath("/me/listings");
}

export async function deleteListing(id: string) {
  const supabase = await createClient();
  await supabase.from("listings").delete().eq("id", id);
  revalidatePath("/me/listings");
}

// ── Requests ─────────────────────────────────────────────────────────────
export async function createRequest(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const message = str(fd, "message");
  const { data: requestId, error } = await supabase.rpc("create_request", {
    p_listing_id: str(fd, "listing_id"),
    p_message: message,
  });
  if (error) {
    if (error.message.includes("message")) return { ok: false, error: "Write a message of 5 to 500 characters." };
    return { ok: false, error: friendlyError(error) };
  }

  const { data: req } = await supabase.from("requests").select("provider_id").eq("id", requestId).single();
  if (req) await sendRequestAlert(req.provider_id, "request_new", requestId as string, message);

  redirect(`/requests/${requestId}`);
}

export async function respondRequest(requestId: string, accept: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_request", { p_request_id: requestId, p_accept: accept });
  if (error) return { ok: false, error: friendlyError(error) };

  const { data: req } = await supabase.from("requests").select("seeker_id").eq("id", requestId).single();
  if (req) await sendRequestAlert(req.seeker_id, accept ? "request_accepted" : "request_declined", requestId);

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { ok: false, error: friendlyError(error) };

  const { data: req } = await supabase
    .from("requests")
    .select("seeker_id, provider_id")
    .eq("id", requestId)
    .single();
  if (req && viewer) {
    const other = req.seeker_id === viewer.userId ? req.provider_id : req.seeker_id;
    await sendRequestAlert(other, "request_cancelled", requestId);
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function markRequestDone(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_request_done", { p_request_id: requestId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

// ── Safety: report and block ─────────────────────────────────────────────
export async function fileReport(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    target_type: str(fd, "target_type"),
    target_id: str(fd, "target_id"),
    reason: str(fd, "reason"),
  });
  if (error) {
    if (error.message.includes("reason")) return { ok: false, error: "Tell us what happened (5 to 500 characters)." };
    return { ok: false, error: friendlyError(error) };
  }
  return { ok: true, message: "Thanks. We'll look into it." };
}

export async function blockUser(userId: string, back: string) {
  const supabase = await createClient();
  await supabase.from("blocks").insert({ blocked_id: userId });
  revalidatePath("/", "layout");
  redirect(safeNext(back, "/requests"));
}

export async function unblockUser(userId: string) {
  const viewer = await getViewer();
  if (!viewer) return;
  const supabase = await createClient();
  await supabase.from("blocks").delete().eq("blocker_id", viewer.userId).eq("blocked_id", userId);
  revalidatePath("/account");
}

// ── Account ──────────────────────────────────────────────────────────────
export async function updateAccount(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "Finish setting up your profile first." };
  const supabase = await createClient();

  const { error: e1 } = await supabase
    .from("profiles")
    .update({ display_name: str(fd, "display_name") })
    .eq("id", viewer.userId);
  if (e1) return { ok: false, error: "Name should be 2 to 40 characters." };

  const { error: e2 } = await supabase
    .from("profiles_private")
    .update({ notify_email: fd.get("notify_email") === "on" })
    .eq("id", viewer.userId);
  if (e2) return { ok: false, error: friendlyError(e2) };

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function changeHomeLocality(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_home_locality", {
    p_locality_id: num(fd, "locality_id"),
    p_lat: num(fd, "lat"),
    p_lng: num(fd, "lng"),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Home locality updated." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function deleteAccount(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (str(fd, "confirm").toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { ok: false, error: friendlyError(error) };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
