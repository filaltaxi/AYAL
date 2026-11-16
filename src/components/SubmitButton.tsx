"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "btn-primary w-full",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; error?: string; message?: string } | null }) {
  if (!state) return null;
  if (!state.ok) return <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">{state.message}</p>;
  return null;
}
