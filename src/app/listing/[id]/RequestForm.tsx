"use client";

import { useActionState } from "react";
import { createRequest } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";

export function RequestForm({ listingId, ownerName }: { listingId: string; ownerName: string }) {
  const [state, action] = useActionState(createRequest, null);
  const first = ownerName.split(" ")[0];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="listing_id" value={listingId} />
      <textarea
        name="message"
        required
        minLength={5}
        maxLength={500}
        rows={4}
        className="input"
        placeholder={`Hi ${first}, I'm in the same locality. I need help with… When would suit you?`}
      />
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…">Send request</SubmitButton>
      <p className="hint text-center">They have 48 hours to reply before the request expires.</p>
    </form>
  );
}
