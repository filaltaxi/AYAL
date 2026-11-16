"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, getViewer } from "@/lib/viewer";
import { alertUser } from "@/lib/notify";
import { LOCALITY_COOKIE } from "@/lib/env";
import type { ActionResult, Message } from "@/lib/types";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => {
  const v = fd.get(key);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** Safe internal redirect target (no open redirects). */
function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

// ── Locality preference (browsing only, no account needed) ───────────────
export async function rememberLocality(slug: string) {
  const store = await cookies();
  store.set(LOCALITY_COOKIE, slug.slice(0, 60), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function setWaitlist(localityId: number, join: boolean): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in first." };
  const supabase = await createClient();
  const { error } = join
    ? await supabase.from("locality_interest").insert({ locality_id: localityId })
    : await supabase.from("locality_interest").delete().eq("locality_id", localityId).eq("user_id", viewer.userId);
  if (error && error.code !== "23505") return { ok: false, error: friendlyError(error) };
  revalidatePath("/l/[slug]", "page");
  return { ok: true };
}

// ── Onboarding ───────────────────────────────────────────────────────────
export async function completeOnboarding(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    p_display_name: str(fd, "display_name"),
    p_dob: str(fd, "dob") || null,
    p_locality_id: num(fd, "locality_id"),
    p_lat: num(fd, "lat"),
    p_lng: num(fd, "lng"),
  });
  if (error) {
    if (error.message.includes("display_name")) return { ok: false, error: "Name should be 2 to 40 characters." };
    return { ok: false, error: friendlyError(error) };
  }

  const photo = str(fd, "photo_url");
  if (photo.startsWith("https://")) {
    await supabase.from("profiles").update({ photo_url: photo.slice(0, 500) }).eq("id", viewer.userId);
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
  const areas = fd.getAll("areas").map(Number).filter(Number.isFinite);
  let id = str(fd, "id");

  if (id) {
    const { error } = await supabase.from("listings").update(fields).eq("id", id);
    if (error) return { ok: false, error: listingError(error) };
  } else {
    const { data, error } = await supabase
      .from("listings")
      .insert({ ...fields, owner_id: viewer.userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: listingError(error) };
    id = data.id;
  }

  const { error: areaError } = await supabase.rpc("set_listing_service_areas", {
    p_listing_id: id,
    p_localities: areas,
  });
  if (areaError) return { ok: false, error: `Saved, but the extra localities weren't: ${friendlyError(areaError)}` };

  revalidatePath("/me/listings");
  redirect("/me/listings");
}

function listingError(error: { message: string; code?: string }) {
  const msg = error.message;
  if (error.code === "23514" || error.code === "23502") {
    if (msg.includes("title")) return "Title should be 3 to 80 characters.";
    if (msg.includes("description")) return "Description should be 10 to 1000 characters.";
    if (msg.includes("price_text")) return "Add a price (up to 60 characters), e.g. ₹200/hr or 'Ask me'.";
    if (msg.includes("availability")) return "Keep availability under 120 characters.";
    if (msg.includes("category_id")) return "Pick a category.";
  }
  if (error.code === "23503") return "Pick a category.";
  return friendlyError(error);
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
async function partiesOf(requestId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("requests").select("seeker_id, provider_id").eq("id", requestId).single();
  return data as { seeker_id: string | null; provider_id: string | null } | null;
}

export async function createRequest(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const message = str(fd, "message");
  const { data: requestId, error } = await supabase.rpc("create_request", {
    p_listing_id: str(fd, "listing_id"),
    p_message: message,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const parties = await partiesOf(requestId as string);
  alertUser(parties?.provider_id, "request_new", { requestId: requestId as string, preview: message });
  redirect(`/requests/${requestId}`);
}

export async function respondRequest(requestId: string, accept: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_request", { p_request_id: requestId, p_accept: accept });
  if (error) return { ok: false, error: friendlyError(error) };

  const parties = await partiesOf(requestId);
  alertUser(parties?.seeker_id, accept ? "request_accepted" : "request_declined", { requestId });
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });
  if (error) return { ok: false, error: friendlyError(error) };

  const parties = await partiesOf(requestId);
  if (parties && viewer) {
    const other = parties.seeker_id === viewer.userId ? parties.provider_id : parties.seeker_id;
    alertUser(other, "request_cancelled", { requestId });
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function markRequestDone(requestId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_request_done", { p_request_id: requestId });
  if (error) return { ok: false, error: friendlyError(error) };

  const parties = await partiesOf(requestId);
  if (parties && viewer) {
    const other = parties.seeker_id === viewer.userId ? parties.provider_id : parties.seeker_id;
    alertUser(other, "request_done", { requestId });
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

// ── Chat ─────────────────────────────────────────────────────────────────
export async function sendMessage(
  requestId: string,
  body: string,
): Promise<{ ok: true; message: Message } | { ok: false; error: string }> {
  if (!isUuid(requestId)) return { ok: false, error: "Chat not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", { p_request_id: requestId, p_body: body });
  if (error) return { ok: false, error: friendlyError(error) };
  const result = data as { message: Message; alert_user: string | null };
  alertUser(result.alert_user, "message_new", { requestId });
  return { ok: true, message: result.message };
}

/** Clear a request's alerts (called when a new chat message is seen live). */
export async function markRequestSeen(requestId: string) {
  if (!isUuid(requestId)) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("request_id", requestId).is("read_at", null);
}

// ── Reviews and vouches ──────────────────────────────────────────────────
export async function leaveReview(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const requestId = str(fd, "request_id");
  const rating = num(fd, "rating");
  if (!rating) return { ok: false, error: "Tap the stars to pick a rating." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_review", {
    p_request_id: requestId,
    p_rating: rating,
    p_comment: str(fd, "comment") || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const parties = await partiesOf(requestId);
  alertUser(parties?.provider_id, "review_new", { url: parties?.provider_id ? `/u/${parties.provider_id}#reviews` : undefined });
  revalidatePath(`/requests/${requestId}`);
  return { ok: true, message: "Thanks, your review is up." };
}

export async function toggleVouch(
  providerId: string,
): Promise<{ ok: true; vouched: boolean } | { ok: false; error: string }> {
  if (!isUuid(providerId)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_vouch", { p_provider: providerId });
  if (error) return { ok: false, error: friendlyError(error) };
  if (data === true) alertUser(providerId, "vouch_new", { url: `/u/${providerId}` });
  revalidatePath(`/u/${providerId}`);
  return { ok: true, vouched: data === true };
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
  return { ok: true, message: "Thanks. The Ayal team will look into it." };
}

export async function blockUser(userId: string, back: string) {
  if (!isUuid(userId)) return;
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

// ── Admin (every function checks is_admin() in the database too) ─────────
async function adminCall(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminResolveReport(reportId: number, status: "actioned" | "dismissed" | "open") {
  return adminCall("admin_resolve_report", { p_report_id: reportId, p_status: status });
}

export async function adminSetListingHidden(listingId: string, hidden: boolean) {
  return adminCall("admin_set_listing_hidden", { p_listing_id: listingId, p_hidden: hidden });
}

export async function adminSetSuspended(userId: string, suspended: boolean, reason?: string) {
  return adminCall("admin_set_suspended", { p_user: userId, p_suspended: suspended, p_reason: reason ?? null });
}

export async function adminSetLocalityActive(localityId: number, active: boolean) {
  const res = await adminCall("admin_set_locality_active", { p_locality: localityId, p_active: active });
  revalidatePath("/", "layout");
  return res;
}
