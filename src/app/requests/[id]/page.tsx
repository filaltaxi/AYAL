import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getPeopleStats } from "@/lib/queries";
import { REQUEST_SELECT, type RequestFull } from "@/lib/requests";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import { RequestActions, StatusPill } from "@/components/RequestActions";
import { ReportForm } from "@/components/ReportForm";
import { StarRow, TrustLine } from "@/components/Trust";
import { blockUser } from "@/app/actions";
import { memberSince, timeAgo, timeLeft } from "@/lib/format";
import type { Message } from "@/lib/types";
import { Chat } from "./Chat";
import { ReviewForm } from "./ReviewForm";

export const metadata = { title: "Request" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/requests/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  await supabase.rpc("expire_my_stale_requests");
  const { data } = await supabase.from("requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  const req = data as unknown as RequestFull | null;
  if (!req) notFound();

  const role = req.provider_id === viewer.userId ? "provider" : "seeker";
  const other = role === "provider" ? req.seeker : req.provider;
  const otherId = role === "provider" ? req.seeker_id : req.provider_id;
  const otherName = other?.display_name ?? "Former member";

  const [{ data: msgs }, stats, { data: review }] = await Promise.all([
    supabase.from("messages").select("*").eq("request_id", id).order("id"),
    getPeopleStats([otherId]),
    supabase.from("reviews").select("rating, comment, created_at").eq("request_id", id).maybeSingle(),
    // Opened it: clear its alerts.
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("request_id", id).is("read_at", null),
  ]);
  const messages = (msgs ?? []) as Message[];
  const otherStats = otherId ? stats.get(otherId) : undefined;
  const showChat = req.status === "accepted" || messages.length > 0;
  const reviewWindowOpen =
    req.closed_at !== null && Date.now() - new Date(req.closed_at).getTime() < 30 * 864e5;
  const canReview = role === "seeker" && req.status === "done" && !review && Boolean(req.provider_id) && reviewWindowOpen;

  return (
    <div>
      <Link href={role === "provider" ? "/requests" : "/requests?tab=sent"} className="btn-link">← Requests</Link>

      <section className="card mt-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{role === "provider" ? "Request for your listing" : "Your request for"}</p>
            {req.listing ? (
              <Link href={`/listing/${req.listing.id}`} className="text-lg font-bold hover:text-brand">{req.listing_title}</Link>
            ) : (
              <p className="text-lg font-bold">
                {req.listing_title} <span className="text-sm font-normal text-muted">(listing removed)</span>
              </p>
            )}
          </div>
          <StatusPill status={req.status} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={otherName} url={other?.photo_url} size={44} />
          <div className="min-w-0">
            {other ? (
              <Link href={`/u/${other.id}`} className="font-bold hover:text-brand">{otherName} →</Link>
            ) : (
              <p className="font-bold">{otherName}</p>
            )}
            {other && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                On Ayal since {memberSince(other.created_at)}
                {role === "provider" && (
                  <> · {otherStats?.asked_done ?? 0} job{otherStats?.asked_done === 1 ? "" : "s"} done</>
                )}
                <VerifiedBadge verified={other.location_verified} />
              </p>
            )}
            {other && role === "seeker" && <div className="mt-1"><TrustLine stats={otherStats} /></div>}
          </div>
        </div>

        <blockquote className="mt-4 rounded-xl bg-paper px-4 py-3 text-[15px] whitespace-pre-line ring-1 ring-line">
          {req.message}
          <span className="mt-1 block text-xs text-muted">Sent {timeAgo(req.created_at)}</span>
        </blockquote>

        {req.status === "pending" && (
          <p className="mt-3 text-sm text-accent">
            {role === "provider" ? `Reply within ${timeLeft(req.expires_at)}.` : `They have ${timeLeft(req.expires_at)} to reply.`}
          </p>
        )}

        <div className="mt-4">
          <RequestActions id={req.id} status={req.status} role={role} />
        </div>
      </section>

      {req.status === "accepted" && (
        <section className="mt-4 rounded-2xl bg-accent-soft p-4 text-sm">
          <p className="font-bold">Before you meet</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink/80">
            <li>Agree the time, place and price here in the chat.</li>
            <li>For a first meeting, meet at the door or a common area.</li>
            <li>Tell someone at home who you&apos;re meeting and when.</li>
            <li>If anything feels wrong, leave, then report it below.</li>
          </ul>
        </section>
      )}

      {canReview && (
        <section className="card mt-4 p-5">
          <h2 className="text-lg font-bold">How did it go?</h2>
          <p className="mt-1 text-sm text-muted">
            Your review helps neighbours decide. It shows your name and stays on {otherName}&apos;s profile.
          </p>
          <ReviewForm requestId={req.id} />
        </section>
      )}
      {review && (
        <section className="card mt-4 p-5">
          <p className="text-sm text-muted">{role === "seeker" ? "Your review" : `${otherName}'s review of you`}</p>
          <p className="mt-1"><StarRow rating={review.rating} /></p>
          {review.comment && <p className="mt-2 text-[15px]">{review.comment}</p>}
        </section>
      )}

      {showChat && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Chat with {otherName}</h2>
          <Chat
            requestId={req.id}
            meId={viewer.userId}
            otherName={otherName.split(" ")[0]!}
            initial={messages}
            open={req.status === "accepted"}
          />
        </section>
      )}

      {other && otherId && (
        <section className="mt-6 space-y-3 px-1">
          <ReportForm targetType="user" targetId={otherId} label={`Report ${otherName}`} />
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-muted hover:text-danger">
              ⊘ Block {otherName}
            </summary>
            <form action={blockUser.bind(null, otherId, "/requests")} className="mt-2">
              <p className="text-xs text-muted">
                You&apos;ll stop seeing each other&apos;s listings, and no more messages can be sent between you. You can unblock
                from Account.
              </p>
              <button className="btn-danger mt-2">Block {otherName}</button>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}
