import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getPeopleStats } from "@/lib/queries";
import { REQUEST_SELECT, type RequestFull } from "@/lib/requests";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import { RequestActions, StatusPill } from "@/components/RequestActions";
import { memberSince, timeAgo, timeLeft } from "@/lib/format";

export const metadata = { title: "Requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/requests");
  if (!viewer.profile) redirect("/onboarding?next=/requests");
  const tab = tabParam === "sent" ? "sent" : "received";

  const supabase = await createClient();
  // Fix any requests past their 48 hours, even if the scheduler isn't running.
  await supabase.rpc("expire_my_stale_requests");

  const column = tab === "sent" ? "seeker_id" : "provider_id";
  const [{ data }, { count: pendingReceived }, { data: unread }] = await Promise.all([
    supabase.from("requests").select(REQUEST_SELECT).eq(column, viewer.userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("provider_id", viewer.userId).eq("status", "pending"),
    supabase.from("notifications").select("request_id, type").is("read_at", null),
  ]);
  const requests = (data ?? []) as unknown as RequestFull[];
  const unreadByRequest = new Set((unread ?? []).filter((n) => n.request_id).map((n) => n.request_id as string));

  // Seen the inbox: clear everything except unread chat messages (those clear when the chat is opened).
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", viewer.userId)
    .is("read_at", null)
    .neq("type", "message_new");

  // Seeker signals for providers, in one call.
  const stats = tab === "received" ? await getPeopleStats(requests.map((r) => r.seeker_id)) : new Map();

  return (
    <div>
      <h1 className="page-title">Requests</h1>
      <div className="mt-4 flex gap-2">
        <Link href="/requests" className={tab === "received" ? "chip-active" : "chip"}>
          Received{pendingReceived ? ` · ${pendingReceived} waiting` : ""}
        </Link>
        <Link href="/requests?tab=sent" className={tab === "sent" ? "chip-active" : "chip"}>Sent</Link>
      </div>

      {requests.length === 0 ? (
        <div className="card mt-5 p-6 text-center text-muted">
          {tab === "received" ? (
            <>No requests yet. <Link href="/me/listings" className="btn-link">Check your listings</Link> are live.</>
          ) : (
            <>You haven&apos;t sent any requests. <Link href="/" className="btn-link">Browse your locality</Link></>
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {requests.map((r) => {
            const other = tab === "received" ? r.seeker : r.provider;
            const otherDone = other ? stats.get(other.id)?.asked_done ?? 0 : 0;
            const isNew = unreadByRequest.has(r.id);
            return (
              <li key={r.id} className={`card p-4 ${isNew ? "border-brand" : ""}`}>
                <Link href={`/requests/${r.id}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-muted">
                      {isNew && <span className="mr-1.5 inline-block size-2 rounded-full bg-accent align-middle" aria-label="New" />}
                      {r.listing_title}
                    </p>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <Avatar name={other?.display_name ?? "Former member"} url={other?.photo_url} size={36} />
                    <div className="min-w-0">
                      <p className="font-bold">{other?.display_name ?? "Former member"}</p>
                      {other && tab === "received" ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          Since {memberSince(other.created_at)} · {otherDone} job{otherDone === 1 ? "" : "s"} done
                          <VerifiedBadge verified={other.location_verified} />
                        </p>
                      ) : (
                        <p className="text-xs text-muted">Sent {timeAgo(r.created_at)}</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[15px]">{r.message}</p>
                  {r.status === "pending" && <p className="mt-1 text-xs text-accent">{timeLeft(r.expires_at)} to reply</p>}
                </Link>
                {r.status === "pending" && (
                  <div className="mt-3 border-t border-line pt-3">
                    <RequestActions id={r.id} status={r.status} role={tab === "received" ? "provider" : "seeker"} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
