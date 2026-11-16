import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { getLocalities } from "@/lib/queries";
import { LOCALITY_COOKIE } from "@/lib/env";
import { BrowsePicker } from "@/components/BrowsePicker";

export default async function Home({ searchParams }: { searchParams: Promise<{ pick?: string; deleted?: string }> }) {
  const { pick, deleted } = await searchParams;
  const localities = await getLocalities();

  if (!pick) {
    const viewer = await getViewer();
    if (viewer && !viewer.profile) redirect("/onboarding");
    const home = viewer?.profile && localities.find((l) => l.id === viewer.profile!.home_locality_id);
    if (home) redirect(`/l/${home.slug}`);
    const saved = (await cookies()).get(LOCALITY_COOKIE)?.value;
    if (saved && localities.some((l) => l.slug === saved)) redirect(`/l/${saved}`);
  }

  return (
    <div>
      {deleted && (
        <p className="mb-4 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">Your account has been deleted.</p>
      )}
      <section className="pt-4 pb-6">
        <h1 className="font-display text-[34px] leading-[1.1] font-bold tracking-tight">
          Skills from people <span className="text-brand">next door.</span>
        </h1>
        <p className="mt-3 max-w-lg text-[17px] text-muted">
          A college student who tutors maths. A neighbour who cooks lunch. A retired uncle who fixes things. Find them in your own
          locality, or offer what you&apos;re good at.
        </p>
      </section>
      <BrowsePicker localities={localities} autoLocate={!pick} />
    </div>
  );
}
