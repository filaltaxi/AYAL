import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
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
  const column = tab === "sent" ? "seeker_id" : "provider_id";
  const [{ data }, { count: pendingReceived }] = await Promise.all([
    supabase.from("requests").select(REQUEST_SELECT).eq(column, viewer.userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("provider_id", viewer.userId).eq("status", "pending"),
  ]);
  const requests = (data ?? []) as unknown as RequestFull[];

  // Seen the inbox: clear the badge.
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.userId).is("read_at", null);

  // Seeker signals for providers: how many jobs each person has completed.
  const completed = new Map<string, number>();
  if (tab === "received") {
    const ids = [...new Set(requests.map((r) => r.seeker_id))];
    const counts = await Promise.all(ids.map((id) => supabase.rpc("seeker_completed_count", { p_user: id })));
    ids.forEach((id, i) => completed.set(id, (counts[i]!.data as number) ?? 0));
  }

  return (
    <div>
      <h1 className="page-title">Requests</h1>
      <div className="mt-4 flex gap-2">
        <Link href="/requests" className={tab === "received" ? "chip-active" : "chip"}>
          Received{pendingReceived ? ` · ${pendingReceived} new` : ""}
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
            return (
              <li key={r.id} className="card p-4">
                <Link href={`/requests/${r.id}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-muted">{r.listing?.title ?? "Listing removed"}</p>
                    <StatusPill status={r.status} />
                  </div>
                  {other && (
                    <div className="mt-2 flex items-center gap-2.5">
                      <Avatar name={other.display_name} url={other.photo_url} size={36} />
                      <div className="min-w-0">
                        <p className="font-bold">{other.display_name}</p>
                        {tab === "received" ? (
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            Since {memberSince(other.created_at)} · {completed.get(other.id) ?? 0} jobs done
                            <VerifiedBadge verified={other.location_verified} />
                          </p>
                        ) : (
                          <p className="text-xs text-muted">Sent {timeAgo(r.created_at)}</p>
                        )}
                      </div>
                    </div>
                  )}
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
