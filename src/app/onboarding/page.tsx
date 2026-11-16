import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Locality } from "@/lib/types";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Set up your profile" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile) redirect(viewer.phoneVerified ? next : `/verify-phone?next=${encodeURIComponent(next)}`);

  const supabase = await createClient();
  const { data: localities } = await supabase
    .from("localities")
    .select("id, slug, name, city, is_active")
    .order("sort");

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-semibold text-brand">Step 1 of 2</p>
      <h1 className="page-title mt-1">Tell your neighbours who you are</h1>
      <p className="mt-2 text-muted">This is what people see on your requests and listings. Ayal is for people 18 and over.</p>
      <OnboardingForm
        localities={(localities ?? []) as Locality[]}
        defaultName={viewer.googleName ?? ""}
        photoUrl={viewer.googlePhoto ?? ""}
        next={next}
      />
    </div>
  );
}
