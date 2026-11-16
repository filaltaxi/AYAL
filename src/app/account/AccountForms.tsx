"use client";

import { useActionState } from "react";
import { changeHomeLocality, deleteAccount, updateAccount } from "@/app/actions";
import { HomeLocalityField } from "@/components/HomeLocalityField";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import type { Locality } from "@/lib/types";

export function ProfileForm({ name, notifyEmail }: { name: string; notifyEmail: boolean }) {
  const [state, action] = useActionState(updateAccount, null);
  return (
    <form action={action} className="mt-3 space-y-4">
      <div>
        <label className="label" htmlFor="display_name">Name shown to neighbours</label>
        <input id="display_name" name="display_name" className="input" defaultValue={name} required minLength={2} maxLength={40} />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="notify_email" defaultChecked={notifyEmail} className="mt-0.5 size-4 accent-brand" />
        <span>
          <span className="font-semibold">Email me about requests</span>
          <span className="block text-muted">New requests, and when yours are accepted or declined.</span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary">Save</SubmitButton>
    </form>
  );
}

export function LocalityForm({ localities, currentId }: { localities: Locality[]; currentId: number }) {
  const [state, action] = useActionState(changeHomeLocality, null);
  return (
    <form action={action} className="mt-4 space-y-4">
      <HomeLocalityField localities={localities} initialId={currentId} autoLocate={false} />
      <FormMessage state={state} />
      <SubmitButton className="btn-outline" pendingText="Updating…">Update home locality</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, null);
  return (
    <details className="text-right">
      <summary className="cursor-pointer list-none text-sm font-semibold text-muted hover:text-danger">Delete account</summary>
      <form action={action} className="card mt-2 space-y-3 p-4 text-left">
        <p className="text-sm">
          This permanently removes your profile, listings and messages. Requests stay with the other person, showing you as “Former member”. Type <strong>DELETE</strong> to confirm.
        </p>
        <input name="confirm" className="input" autoComplete="off" />
        <FormMessage state={state} />
        <SubmitButton className="btn-danger w-full" pendingText="Deleting…">Delete my account</SubmitButton>
      </form>
    </details>
  );
}
