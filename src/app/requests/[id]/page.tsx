import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { REQUEST_SELECT, type RequestFull } from "@/lib/requests";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import { RequestActions, StatusPill } from "@/components/RequestActions";
import { ReportForm } from "@/components/ReportForm";
import { blockUser } from "@/app/actions";
import { memberSince, timeAgo, timeLeft } from "@/lib/format";
import type { Message } from "@/lib/types";
import { Chat } from "./Chat";

export const metadata = { title: "Request" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/requests/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  const req = data as unknown as RequestFull | null;
  if (!req) notFound();

  const role = req.provider_id === viewer.userId ? "provider" : "seeker";
  const other = role === "provider" ? req.seeker : req.provider;
  const otherId = role === "provider" ? req.seeker_id : req.provider_id;
  const otherName = other?.display_name ?? "Former member";

  const [{ data: msgs }, completedRes] = await Promise.all([
    supabase.from("messages").select("*").eq("request_id", id).order("id"),
    role === "provider" ? supabase.rpc("seeker_completed_count", { p_user: req.seeker_id }) : Promise.resolve({ data: null }),
  ]);
  const messages = (msgs ?? []) as Message[];
  const completed = completedRes.data as number | null;
  const showChat = req.status === "accepted" || messages.length > 0;

  return (
    <div>
      <Link href={role === "provider" ? "/requests" : "/requests?tab=sent"} className="btn-link">← Requests</Link>

      <section className="card mt-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{role === "provider" ? "Request for your listing" : "Your request for"}</p>
            {req.listing ? (
              <Link href={`/listing/${req.listing.id}`} className="text-lg font-bold hover:text-brand">{req.listing.title}</Link>
            ) : (
              <p className="text-lg font-bold">Listing removed</p>
            )}
          </div>
          <StatusPill status={req.status} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={otherName} url={other?.photo_url} size={44} />
          <div>
            <p className="font-bold">{otherName}</p>
            {other && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                On Ayal since {memberSince(other.created_at)}
                {completed !== null && <> · {completed} jobs done</>}
                <VerifiedBadge verified={other.location_verified} />
              </p>
            )}
          </div>
        </div>

        <blockquote className="mt-4 rounded-xl bg-paper px-4 py-3 text-[15px] whitespace-pre-line ring-1 ring-line">
          {req.message}
          <span className="mt-1 block text-xs text-muted">Sent {timeAgo(req.created_at)}</span>
        </blockquote>

        {req.status === "pending" && (
          <p className="mt-3 text-sm text-accent">
            {role === "provider" ? "Reply within " : "They have "} {timeLeft(req.expires_at)}
            {role === "provider" ? "." : " to reply."}
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

      {showChat && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Chat with {otherName}</h2>
          <Chat requestId={req.id} meId={viewer.userId} otherName={otherName.split(" ")[0]!} initial={messages} open={req.status === "accepted"} />
        </section>
      )}

      {other && (
        <section className="mt-6 space-y-3 px-1">
          <ReportForm targetType="user" targetId={otherId} label={`Report ${otherName}`} />
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-muted hover:text-danger">⊘ Block {otherName}</summary>
            <form action={blockUser.bind(null, otherId, "/requests")} className="mt-2">
              <p className="text-xs text-muted">You&apos;ll stop seeing each other&apos;s listings, and no more messages can be sent between you. You can unblock from Account.</p>
              <button className="btn-danger mt-2">Block {otherName}</button>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}
