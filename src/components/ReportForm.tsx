"use client";

import { useActionState } from "react";
import { fileReport } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";

export function ReportForm({ targetType, targetId, label = "Report" }: { targetType: "user" | "listing" | "message" | "request"; targetId: string; label?: string }) {
  const [state, action] = useActionState(fileReport, null);
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-semibold text-muted hover:text-danger">⚑ {label}</summary>
      {state?.ok ? (
        <div className="mt-2"><FormMessage state={state} /></div>
      ) : (
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="target_type" value={targetType} />
          <input type="hidden" name="target_id" value={targetId} />
          <textarea name="reason" required minLength={5} maxLength={500} rows={3} className="input" placeholder="What happened? Only the Ayal team sees this." />
          <FormMessage state={state} />
          <SubmitButton className="btn-danger" pendingText="Sending…">Send report</SubmitButton>
        </form>
      )}
    </details>
  );
}
