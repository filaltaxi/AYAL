"use client";

import { useActionState } from "react";
import { completeOnboarding } from "@/app/actions";
import { HomeLocalityField } from "@/components/HomeLocalityField";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import type { Locality } from "@/lib/types";

export function OnboardingForm({
  localities,
  defaultName,
  photoUrl,
  next,
}: {
  localities: Locality[];
  defaultName: string;
  photoUrl: string;
  next: string;
}) {
  const [state, action] = useActionState(completeOnboarding, null);
  const maxDob = new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10);

  return (
    <form action={action} className="card mt-6 space-y-5 p-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="photo_url" value={photoUrl} />
      <div>
        <label className="label" htmlFor="display_name">Your name</label>
        <input id="display_name" name="display_name" className="input" defaultValue={defaultName} required minLength={2} maxLength={40} />
        <p className="hint">First name and initial is fine, e.g. “Anu S”.</p>
      </div>
      <div>
        <label className="label" htmlFor="dob">Date of birth</label>
        <input id="dob" name="dob" type="date" className="input" required max={maxDob} />
        <p className="hint">Only used to check you&apos;re 18+. Never shown to anyone.</p>
      </div>
      <HomeLocalityField localities={localities} />
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Continue</SubmitButton>
    </form>
  );
}
