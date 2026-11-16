"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setWaitlist } from "@/app/actions";

export function WaitlistButton({
  localityId,
  joined,
  signedIn,
  next,
}: {
  localityId: number;
  joined: boolean;
  signedIn: boolean;
  next: string;
}) {
  const [isJoined, setJoined] = useState(joined);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary">
        Sign in to join the list
      </Link>
    );
  }

  return (
    <div>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setWaitlist(localityId, !isJoined);
            if (res && !res.ok) setError(res.error);
            else setJoined(!isJoined);
          })
        }
        className={isJoined ? "btn-outline" : "btn-primary"}
      >
        {isJoined ? "✓ You're on the list (leave)" : "Tell me when it opens"}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
