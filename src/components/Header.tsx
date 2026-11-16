import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";

export async function Header() {
  const viewer = await getViewer();
  let unread = 0;
  if (viewer) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    unread = count ?? 0;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Ayal home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          {viewer ? (
            <>
              {viewer.isAdmin && (
                <Link href="/admin" className="rounded-lg px-2.5 py-1.5 text-accent hover:bg-accent-soft">
                  Admin
                </Link>
              )}
              <Link href="/me/listings" className="rounded-lg px-2.5 py-1.5 hover:bg-brand-soft">
                My skills
              </Link>
              <Link href="/requests" className="relative rounded-lg px-2.5 py-1.5 hover:bg-brand-soft">
                Requests
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[10px] text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/account" className="ml-1" aria-label="Account">
                <Avatar name={viewer.profile?.display_name ?? viewer.googleName ?? "You"} url={viewer.profile?.photo_url ?? viewer.googlePhoto} size={32} />
              </Link>
            </>
          ) : (
            <Link href="/login" className="btn-primary px-3.5 py-2">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
