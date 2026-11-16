"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/types";

const STYLE = { primary: "btn-primary", outline: "btn-outline", danger: "btn-danger" } as const;

export function AdminButton({
  action,
  label,
  variant = "outline",
  confirmText,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  variant?: keyof typeof STYLE;
  confirmText?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        disabled={pending}
        className={`${STYLE[variant]} px-3 py-1.5`}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => {
            setError(null);
            const res = await action();
            if (res && !res.ok) setError(res.error);
            router.refresh();
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {error && <span className="mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}

export function SuspendForm({
  action,
  userId,
  name,
}: {
  action: (userId: string, suspended: boolean, reason?: string) => Promise<ActionResult>;
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-danger px-3 py-1.5" onClick={() => setOpen(true)}>
        Suspend {name}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        className="input max-w-sm"
        placeholder="Reason (only admins see this)"
        aria-label="Suspension reason"
      />
      <button
        disabled={pending}
        className="btn-danger px-3 py-1.5"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await action(userId, true, reason.trim() || undefined);
            if (res && !res.ok) setError(res.error);
            else setOpen(false);
            router.refresh();
          })
        }
      >
        {pending ? "Suspending…" : "Confirm suspend"}
      </button>
      <button className="btn-link" onClick={() => setOpen(false)}>Cancel</button>
      <p className="w-full text-xs text-muted">
        Hides their listings and profile, closes their open requests and stops them messaging. You can undo it below.
      </p>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
