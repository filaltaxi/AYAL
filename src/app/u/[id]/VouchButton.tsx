"use client";

import { useState, useTransition } from "react";
import { toggleVouch } from "@/app/actions";

export function VouchButton({ providerId, vouched, name }: { providerId: string; vouched: boolean; name: string }) {
  const [on, setOn] = useState(vouched);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = name.split(" ")[0];

  return (
    <div>
      <p className="text-sm text-muted">
        {on
          ? `You vouched for ${first}. Neighbours see the count, not who vouched.`
          : `Know ${first} personally? Vouching tells neighbours you'd trust them.`}
      </p>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await toggleVouch(providerId);
            if (!res.ok) setError(res.error);
            else setOn(res.vouched);
          })
        }
        className={`mt-2 ${on ? "btn-outline" : "btn-primary"}`}
      >
        {on ? "✓ Vouched (take back)" : `🤝 Vouch for ${first}`}
      </button>
      {error && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
