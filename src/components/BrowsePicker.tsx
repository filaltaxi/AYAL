"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGpsLocality } from "@/components/useGpsLocality";
import { rememberLocality } from "@/app/actions";
import type { Locality } from "@/lib/types";

/** Home screen: GPS suggests a locality to browse; anyone can pick another. */
export function BrowsePicker({ localities, autoLocate }: { localities: Locality[]; autoLocate: boolean }) {
  const { state, locate } = useGpsLocality();
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (autoLocate) locate();
  }, [autoLocate, locate]);

  const go = (slug: string) =>
    start(async () => {
      await rememberLocality(slug);
      router.push(`/l/${slug}`);
    });

  const nearest = state.kind === "found" ? state.candidates[0] : null;
  const alt = state.kind === "found" ? state.candidates[1] : null;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        {state.kind === "locating" && <p className="text-sm text-muted">Finding your locality…</p>}
        {state.kind === "idle" && (
          <button onClick={locate} className="btn-primary w-full">📍 Use my location</button>
        )}
        {nearest && (
          <div>
            <p className="text-sm text-muted">You seem to be in</p>
            <button onClick={() => go(nearest.slug)} disabled={pending} className="btn-primary mt-2 w-full text-base">
              {nearest.name} →
            </button>
            {alt && (
              <button onClick={() => go(alt.slug)} disabled={pending} className="btn-outline mt-2 w-full">
                Near the border? {alt.name} instead
              </button>
            )}
          </div>
        )}
        {state.kind === "outside" && (
          <p className="text-sm text-muted">You&apos;re outside the areas Ayal covers so far. You can still look around below.</p>
        )}
        {state.kind === "error" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{state.message}</p>
            <button onClick={locate} className="btn-link shrink-0">Try again</button>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">Or choose a locality in Kochi</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {localities.map((l) => (
            <li key={l.id}>
              <Link
                href={`/l/${l.slug}`}
                onClick={() => void rememberLocality(l.slug)}
                className="card flex items-center justify-between px-4 py-3 text-[15px] font-semibold hover:border-brand"
              >
                {l.name}
                {l.is_active ? (
                  <span className="badge bg-brand-soft text-brand">Open</span>
                ) : (
                  <span className="badge bg-paper text-muted ring-1 ring-line">Coming soon</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
