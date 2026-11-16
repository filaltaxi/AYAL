import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/env";

type AlertKind = "request_new" | "request_accepted" | "request_declined" | "request_cancelled";

const COPY: Record<AlertKind, { subject: string; line: string }> = {
  request_new: { subject: "New request on Ayal", line: "A neighbour sent you a request." },
  request_accepted: { subject: "Your request was accepted", line: "Your request was accepted. You can now chat." },
  request_declined: { subject: "Your request was declined", line: "Your request wasn't accepted this time." },
  request_cancelled: { subject: "A request was cancelled", line: "A request you were part of was cancelled." },
};

/**
 * Emails one person about a request. Skips quietly if email isn't configured
 * or the person turned alerts off. Never throws: an alert must not break the action.
 */
export async function sendRequestAlert(userId: string, kind: AlertKind, requestId: string, extra?: string) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const admin = createAdminClient();
    if (!apiKey || !from || !admin) return;

    const { data: prefs } = await admin
      .from("profiles_private")
      .select("notify_email")
      .eq("id", userId)
      .maybeSingle();
    if (prefs && prefs.notify_email === false) return;

    const { data } = await admin.auth.admin.getUserById(userId);
    const to = data.user?.email;
    if (!to) return;

    const link = `${SITE_URL}/requests/${requestId}`;
    const { subject, line } = COPY[kind];
    const safeExtra = extra ? escapeHtml(extra) : "";

    await new Resend(apiKey).emails.send({
      from,
      to,
      subject,
      text: `${line}${extra ? `\n\n"${extra}"` : ""}\n\nOpen it: ${link}\n\nTurn off these emails in Ayal → Account.`,
      html: `<p>${line}</p>${safeExtra ? `<p style="color:#555">“${safeExtra}”</p>` : ""}
<p><a href="${link}">Open in Ayal</a></p>
<p style="color:#888;font-size:12px">Turn off these emails in Ayal → Account.</p>`,
    });
  } catch (err) {
    console.error("[email] alert failed", err);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
