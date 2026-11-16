import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import {
  adminResolveReport,
  adminSetListingHidden,
  adminSetLocalityActive,
  adminSetSuspended,
} from "@/app/actions";
import { timeAgo } from "@/lib/format";
import { AdminButton, SuspendForm } from "./AdminControls";

export const metadata = { title: "Admin" };

type Overview = {
  users: number;
  users_7d: number;
  phone_verified: number;
  listings_live: number;
  requests_7d: number;
  requests_30d: Record<string, number>;
  reviews: number;
  rating_avg: number | null;
  open_reports: number;
  suspended: number;
};
type ReportRow = {
  id: number;
  target_type: "user" | "listing" | "message" | "request";
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter: string | null;
  target: {
    title?: string;
    body?: string;
    is_hidden?: boolean;
    request_id?: string;
    user_id?: string | null;
    user_name?: string | null;
    suspended?: boolean;
  } | null;
};
type LocalityRow = {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
  has_boundary: boolean;
  residents: number;
  listings_live: number;
  waitlist: number;
};
type Suspended = { user_id: string; user_name: string; suspended_at: string; reason: string | null };

const STATUSES = ["open", "actioned", "dismissed"] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ reports?: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();
  const { reports: statusParam } = await searchParams;
  const status = STATUSES.find((s) => s === statusParam) ?? "open";

  const supabase = await createClient();
  const [ov, rp, lc, su] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_reports", { p_status: status }),
    supabase.rpc("admin_localities"),
    supabase.rpc("admin_suspended_users"),
  ]);
  const overview = ov.data as Overview;
  const reports = (rp.data ?? []) as ReportRow[];
  const localities = (lc.data ?? []) as LocalityRow[];
  const suspended = (su.data ?? []) as Suspended[];
  const r30 = overview?.requests_30d ?? {};
  const decided = (r30.accepted ?? 0) + (r30.done ?? 0) + (r30.declined ?? 0);
  const acceptRate = decided ? Math.round((((r30.accepted ?? 0) + (r30.done ?? 0)) / decided) * 100) : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold text-accent">Admin</p>
        <h1 className="page-title">Pilot dashboard</h1>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">At a glance</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="People" value={overview.users} note={`+${overview.users_7d} this week`} />
          <Stat label="Phone verified" value={overview.phone_verified} />
          <Stat label="Live listings" value={overview.listings_live} />
          <Stat label="Requests, 7 days" value={overview.requests_7d} />
          <Stat label="Accepted (30 days)" value={acceptRate === null ? "—" : `${acceptRate}%`} note="of answered requests" />
          <Stat
            label="Reviews"
            value={overview.reviews}
            note={overview.rating_avg ? `avg ★ ${Number(overview.rating_avg).toFixed(1)}` : undefined}
          />
          <Stat label="Open reports" value={overview.open_reports} warn={overview.open_reports > 0} />
          <Stat label="Suspended" value={overview.suspended} />
        </dl>
        <p className="mt-2 text-xs text-muted">
          Requests in the last 30 days:{" "}
          {Object.keys(r30).length
            ? Object.entries(r30)
                .map(([k, v]) => `${v} ${k}`)
                .join(" · ")
            : "none yet"}
        </p>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted">Reports</h2>
          <div className="flex gap-1.5">
            {STATUSES.map((s) => (
              <Link key={s} href={s === "open" ? "/admin" : `/admin?reports=${s}`} className={s === status ? "chip-active" : "chip"}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </Link>
            ))}
          </div>
        </div>
        {reports.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No {status} reports.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="badge bg-danger-soft text-danger">{r.target_type}</span>
                  <span className="text-xs text-muted">
                    by {r.reporter ?? "former member"} · {timeAgo(r.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-[15px]">“{r.reason}”</p>
                <div className="mt-3 rounded-xl bg-paper p-3 text-sm ring-1 ring-line">
                  {!r.target ? (
                    <span className="text-muted">The reported item no longer exists.</span>
                  ) : (
                    <>
                      {r.target.title && <p className="font-semibold">{r.target.title}</p>}
                      {r.target.body && <p className="mt-1 whitespace-pre-line">{r.target.body}</p>}
                      {r.target.user_id && (
                        <p className="mt-1 text-muted">
                          Person:{" "}
                          <Link href={`/u/${r.target.user_id}`} className="btn-link">
                            {r.target.user_name ?? "unknown"}
                          </Link>
                          {r.target.suspended && <span className="ml-2 badge bg-danger-soft text-danger">suspended</span>}
                        </p>
                      )}
                      {r.target_type === "listing" && (
                        <Link href={`/listing/${r.target_id}`} className="btn-link mt-1 inline-block">Open listing</Link>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.target_type === "listing" && r.target && (
                    <AdminButton
                      action={adminSetListingHidden.bind(null, r.target_id, !r.target.is_hidden)}
                      label={r.target.is_hidden ? "Unhide listing" : "Hide listing"}
                      variant={r.target.is_hidden ? "outline" : "danger"}
                    />
                  )}
                  {r.target?.user_id && !r.target.suspended && (
                    <SuspendForm action={adminSetSuspended} userId={r.target.user_id} name={r.target.user_name ?? "this person"} />
                  )}
                  {r.status !== "actioned" && (
                    <AdminButton action={adminResolveReport.bind(null, r.id, "actioned")} label="Mark actioned" variant="primary" />
                  )}
                  {r.status !== "dismissed" && (
                    <AdminButton action={adminResolveReport.bind(null, r.id, "dismissed")} label="Dismiss" variant="outline" />
                  )}
                  {r.status !== "open" && (
                    <AdminButton action={adminResolveReport.bind(null, r.id, "open")} label="Reopen" variant="outline" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Localities</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="p-3">Locality</th>
                <th className="p-3 text-right">Residents</th>
                <th className="p-3 text-right">Live listings</th>
                <th className="p-3 text-right">Waiting</th>
                <th className="p-3">Map</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {localities.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-semibold">
                    <Link href={`/l/${l.slug}`} className="hover:text-brand">{l.name}</Link>
                    {l.is_active && <span className="ml-2 badge bg-brand-soft text-brand">open</span>}
                  </td>
                  <td className="p-3 text-right">{l.residents}</td>
                  <td className="p-3 text-right">{l.listings_live}</td>
                  <td className="p-3 text-right">{l.waitlist}</td>
                  <td className="p-3 text-xs text-muted">{l.has_boundary ? "boundary" : "radius"}</td>
                  <td className="p-3 text-right">
                    <AdminButton
                      action={adminSetLocalityActive.bind(null, l.id, !l.is_active)}
                      label={l.is_active ? "Close" : "Open"}
                      variant={l.is_active ? "outline" : "primary"}
                      confirmText={
                        l.is_active
                          ? `Close ${l.name}? People there keep their accounts, but nobody new can join it.`
                          : `Open ${l.name} to everyone?`
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Plan was to open a locality once it has about 30 listings ready. Draw boundaries in geojson.io (see README) so GPS
          matching is exact.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Suspended people</h2>
        {suspended.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Nobody is suspended.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {suspended.map((s) => (
              <li key={s.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <span className="font-semibold">{s.user_name}</span>
                  <span className="block text-xs text-muted">
                    {timeAgo(s.suspended_at)}
                    {s.reason ? ` · ${s.reason}` : ""}
                  </span>
                </span>
                <AdminButton action={adminSetSuspended.bind(null, s.user_id, false, undefined)} label="Unsuspend" variant="outline" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: number | string; note?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ring-1 ${warn ? "bg-danger-soft ring-danger/30" : "bg-card ring-line"}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-bold">{value}</dd>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
