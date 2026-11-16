"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Links a phone number to the signed-in Google account via a one-time code. */
export function PhoneOtpForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"number" | "code">("number");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = `+91${digits}`;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ phone });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("already")
          ? "This number is already linked to another Ayal account."
          : error.message.toLowerCase().includes("rate")
            ? "Too many tries. Wait a few minutes and try again."
            : error.message,
      );
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ phone, token: code.trim(), type: "phone_change" });
    if (error) {
      setBusy(false);
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return step === "number" ? (
    <form onSubmit={sendCode} className="card mt-6 space-y-4 p-5">
      <div>
        <label className="label" htmlFor="phone">Mobile number</label>
        <div className="flex gap-2">
          <span className="input w-auto shrink-0 bg-paper font-semibold text-muted">+91</span>
          <input
            id="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            className="input"
            placeholder="98765 43210"
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        </div>
      </div>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
    </form>
  ) : (
    <form onSubmit={verify} className="card mt-6 space-y-4 p-5">
      <div>
        <label className="label" htmlFor="code">6-digit code sent to {phone}</label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="input text-center text-xl tracking-[0.4em]"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Verify"}</button>
      <button type="button" className="btn-link w-full" onClick={() => { setStep("number"); setCode(""); setError(null); }}>
        Change number or resend
      </button>
    </form>
  );
}
