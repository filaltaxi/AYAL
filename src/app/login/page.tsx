import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { GoogleButton } from "./GoogleButton";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getViewer()) redirect(safe);

  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="page-title">Sign in to Ayal</h1>
      <p className="mt-2 text-muted">
        Browsing is open to everyone. Sign in to offer a skill or send a request to a neighbour.
      </p>
      <div className="card mt-6 p-5">
        <GoogleButton next={safe} />
        <p className="hint mt-3 text-center">
          We use your Google name and email. You&apos;ll verify your phone number before your first request or listing.
        </p>
      </div>
      {error && <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Sign-in didn&apos;t complete. Please try again.</p>}
    </div>
  );
}
