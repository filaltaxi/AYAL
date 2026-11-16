import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getLocalities } from "@/lib/queries";
import { signOut, unblockUser } from "@/app/actions";
import { Avatar, VerifiedBadge } from "@/components/Avatar";
import { ProfileForm, LocalityForm, DeleteAccountForm } from "./AccountForms";
import { PushToggle } from "@/components/PushToggle";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/account");
  if (!viewer.profile) redirect("/onboarding?next=/account");
  const profile = viewer.profile;

  const supabase = await createClient();
  const [{ data: priv }, { data: blocks }, localities] = await Promise.all([
    supabase.from("profiles_private").select("notify_email").eq("id", viewer.userId).single(),
    supabase.from("blocks").select("blocked_id"),
    getLocalities(),
  ]);
  const blockedIds = (blocks ?? []).map((b) => b.blocked_id as string);
  const { data: visibleBlocked } = blockedIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", blockedIds)
    : { data: [] as { id: string; display_name: string }[] };
  // Someone you blocked may no longer be visible to you; still let you unblock them.
  const blockedProfiles = blockedIds.map((bid) => ({
    id: bid,
    display_name: (visibleBlocked ?? []).find((p) => p.id === bid)?.display_name ?? "Hidden profile",
  }));

  const home = localities.find((l) => l.id === profile.home_locality_id);
  const nextChange = new Date(new Date(profile.locality_changed_at).getTime() + 30 * 864e5);
  const canChange = nextChange <= new Date();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={profile.display_name} url={profile.photo_url} size={52} />
        <div>
          <h1 className="page-title">{profile.display_name}</h1>
          <p className="text-sm text-muted">{viewer.email}</p>
          <Link href={`/u/${viewer.userId}`} className="btn-link">See your public profile</Link>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Profile</h2>
        <ProfileForm name={profile.display_name} notifyEmail={priv?.notify_email ?? true} />
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Home locality</h2>
          <VerifiedBadge verified={profile.location_verified} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {home?.name}. You list skills and send requests here.{" "}
          {canChange
            ? "You can change it once every 30 days. Changing pauses your listings and closes open requests."
            : `You can move to another locality after ${nextChange.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. You can still re-check your location for the badge.`}
        </p>
        <LocalityForm localities={localities} currentId={profile.home_locality_id} />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Phone notifications</h2>
        <p className="mt-1 text-sm text-muted">
          Get an alert on this device for new requests, replies and chat messages. Alerts never show names or message text.
        </p>
        <div className="mt-3">
          <PushToggle />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Phone</h2>
        {viewer.phoneVerified ? (
          <p className="mt-1 text-sm text-muted">✓ Verified ending {viewer.phone?.slice(-4)}. Never shown to anyone.</p>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">Not verified yet. Needed before your first request or listing.</p>
            <Link href="/verify-phone?next=/account" className="btn-primary">Verify</Link>
          </div>
        )}
      </section>

      {blockedProfiles.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold">Blocked</h2>
          <ul className="mt-2 divide-y divide-line">
            {blockedProfiles.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <span>{b.display_name}</span>
                <form action={unblockUser.bind(null, b.id)}>
                  <button className="btn-link">Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3">
        <form action={signOut}>
          <button className="btn-outline">Sign out</button>
        </form>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
