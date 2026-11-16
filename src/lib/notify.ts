import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, VAPID_PUBLIC_KEY } from "@/lib/env";

export type AlertKind =
  | "request_new"
  | "request_accepted"
  | "request_declined"
  | "request_cancelled"
  | "request_done"
  | "message_new"
  | "review_new"
  | "vouch_new";

/**
 * What each alert says. Push text stays generic on purpose: it shows on lock
 * screens, so it never includes names or message text.
 */
const COPY: Record<AlertKind, { title: string; body: string; email: boolean }> = {
  request_new: { title: "New request", body: "A neighbour sent you a request. Open Ayal to reply.", email: true },
  request_accepted: { title: "Request accepted", body: "Your request was accepted. You can chat now.", email: true },
  request_declined: { title: "Request declined", body: "Your request wasn't accepted this time.", email: true },
  request_cancelled: { title: "Request called off", body: "A request you were part of was called off.", email: true },
  request_done: { title: "Marked as done", body: "A job was marked done. Leave a review if you asked for it.", email: false },
  message_new: { title: "New message", body: "You have a new message on Ayal.", email: false },
  review_new: { title: "New review", body: "A neighbour left you a review.", email: false },
  vouch_new: { title: "Someone vouched for you", body: "A neighbour vouched for you on Ayal.", email: false },
};

type Options = { requestId?: string; url?: string; preview?: string };

/**
 * Sends push and (for some kinds) email AFTER the response has gone back,
 * so alerts never slow down an action. Never throws.
 */
export function alertUser(userId: string | null | undefined, kind: AlertKind, opts: Options = {}) {
  if (!userId) return;
  after(async () => {
    try {
      await deliver(userId, kind, opts);
    } catch (err) {
      console.error("[alert] failed", kind, err);
    }
  });
}

async function deliver(userId: string, kind: AlertKind, opts: Options) {
  const admin = createAdminClient();
  if (!admin) return;
  const path = opts.url ?? (opts.requestId ? `/requests/${opts.requestId}` : "/requests");
  const copy = COPY[kind];
  await Promise.allSettled([
    sendPush(admin, userId, copy.title, copy.body, path, kind),
    copy.email ? sendEmail(admin, userId, copy.title, copy.body, path, opts.preview) : Promise.resolve(),
  ]);
}

// ── Web push ─────────────────────────────────────────────────────────────
let vapidReady: boolean | null = null;
function pushConfigured() {
  if (vapidReady !== null) return vapidReady;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@example.com";
  vapidReady = Boolean(VAPID_PUBLIC_KEY && priv);
  if (vapidReady) webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, priv!);
  return vapidReady;
}

async function sendPush(admin: SupabaseClient, userId: string, title: string, body: string, path: string, tag: string) {
  if (!pushConfigured()) return;
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;

  const payload = JSON.stringify({ title, body, url: path, tag });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 24,
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser unsubscribed or the subscription expired: forget it.
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("[push] send failed", status);
      }
    }),
  );
}

// ── Email ────────────────────────────────────────────────────────────────
async function sendEmail(admin: SupabaseClient, userId: string, title: string, body: string, path: string, preview?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const { data: prefs } = await admin.from("profiles_private").select("notify_email").eq("id", userId).maybeSingle();
  if (prefs && prefs.notify_email === false) return;
  const { data } = await admin.auth.admin.getUserById(userId);
  const to = data.user?.email;
  if (!to) return;

  const link = `${SITE_URL}${path}`;
  const quote = preview ? escapeHtml(preview.slice(0, 300)) : "";
  await new Resend(apiKey).emails.send({
    from,
    to,
    subject: `${title} on Ayal`,
    text: `${body}${preview ? `\n\n"${preview.slice(0, 300)}"` : ""}\n\nOpen it: ${link}\n\nTurn off these emails in Ayal → Account.`,
    html: `<p>${body}</p>${quote ? `<p style="color:#555">“${quote}”</p>` : ""}
<p><a href="${link}">Open in Ayal</a></p>
<p style="color:#888;font-size:12px">Turn off these emails in Ayal → Account.</p>`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
