"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelRequest, markRequestDone, respondRequest } from "@/app/actions";
import type { RequestStatus } from "@/lib/types";

/** The buttons each side may press for a request's current status. */
export function RequestActions({ id, status, role }: { id: string; status: RequestStatus; role: "seeker" | "provider" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | null>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && !res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  };

  let buttons: React.ReactNode = null;
  if (status === "pending" && role === "provider") {
    buttons = (
      <>
        <button disabled={pending} onClick={() => run(() => respondRequest(id, true))} className="btn-primary flex-1">Accept</button>
        <button disabled={pending} onClick={() => run(() => respondRequest(id, false), "Decline this request?")} className="btn-outline flex-1">Decline</button>
      </>
    );
  } else if (status === "pending" && role === "seeker") {
    buttons = (
      <button disabled={pending} onClick={() => run(() => cancelRequest(id), "Withdraw this request?")} className="btn-outline">Withdraw request</button>
    );
  } else if (status === "accepted") {
    buttons = (
      <>
        <button disabled={pending} onClick={() => run(() => markRequestDone(id), "Mark this job as done? The chat will close.")} className="btn-primary flex-1">Mark as done</button>
        <button disabled={pending} onClick={() => run(() => cancelRequest(id), "Call this off? The chat will close.")} className="btn-outline flex-1">Call off</button>
      </>
    );
  }
  if (!buttons) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {error && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: RequestStatus }) {
  const styles: Record<RequestStatus, string> = {
    pending: "bg-accent-soft text-accent",
    accepted: "bg-brand-soft text-brand",
    done: "bg-brand text-white",
    declined: "bg-paper text-muted ring-1 ring-line",
    expired: "bg-paper text-muted ring-1 ring-line",
    cancelled: "bg-paper text-muted ring-1 ring-line",
  };
  const label: Record<RequestStatus, string> = {
    pending: "Waiting for reply",
    accepted: "Accepted",
    done: "Done",
    declined: "Declined",
    expired: "Expired",
    cancelled: "Cancelled",
  };
  return <span className={`badge ${styles[status]}`}>{label[status]}</span>;
}
