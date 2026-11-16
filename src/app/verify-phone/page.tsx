import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { PhoneOtpForm } from "./PhoneOtpForm";

export const metadata = { title: "Verify your phone" };

export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile) redirect(`/onboarding?next=${encodeURIComponent(safe)}`);
  if (viewer.phoneVerified) redirect(safe);

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-semibold text-brand">Step 2 of 2</p>
      <h1 className="page-title mt-1">Verify your phone number</h1>
      <p className="mt-2 text-muted">
        One real number per person keeps Ayal free of fake accounts. Your number is <strong>never shown</strong> to anyone. All
        contact happens in the app.
      </p>
      <PhoneOtpForm next={safe} />
    </div>
  );
}
