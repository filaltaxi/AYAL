"use client";

import { useEffect, useState } from "react";
import { useGpsLocality } from "@/components/useGpsLocality";
import type { Locality } from "@/lib/types";

/**
 * Form field for choosing a HOME locality (onboarding, account).
 * GPS pre-selects it; the person can override. Sends lat/lng only so the
 * server can decide the "location verified" badge — it never stores them.
 */
export function HomeLocalityField({
  localities,
  initialId,
  autoLocate = true,
}: {
  localities: Locality[];
  initialId?: number;
  /** Ask for location on load (onboarding). On Account it waits for a tap instead. */
  autoLocate?: boolean;
}) {
  const open = localities.filter((l) => l.is_active);
  const { state, locate } = useGpsLocality();
  const [selected, setSelected] = useState<number | "">(initialId ?? "");

  useEffect(() => {
    if (autoLocate) locate();
  }, [autoLocate, locate]);

  useEffect(() => {
    if (state.kind === "found" && selected === "") {
      const firstOpen = state.candidates.find((c) => c.is_active);
      if (firstOpen) setSelected(firstOpen.id);
    }
  }, [state, selected]);

  const matches = state.kind === "found" && state.candidates.some((c) => c.id === selected);
  const coarse = state.kind === "found" && state.accuracy > 1000;
  const gpsNames = state.kind === "found" ? state.candidates.map((c) => c.name).join(" or ") : null;

  return (
    <div>
      <label className="label" htmlFor="locality_id">Home locality</label>
      <select
        id="locality_id"
        name="locality_id"
        required
        className="input"
        value={selected}
        onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">Choose…</option>
        {open.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      {matches && !coarse && state.kind === "found" && (
        <>
          <input type="hidden" name="lat" value={state.lat} />
          <input type="hidden" name="lng" value={state.lng} />
        </>
      )}

      <p className="hint">
        {state.kind === "idle" && (
          <button type="button" onClick={locate} className="btn-link text-xs">
            📍 Check my location for the “Location verified” badge
          </button>
        )}
        {state.kind === "locating" && "Checking your location…"}
        {state.kind === "found" && matches && !coarse && "✓ Your location matches. You'll get a “Location verified” badge."}
        {state.kind === "found" && matches && coarse && "Your location looks approximate (laptop?). Verify later from your phone for the badge."}
        {state.kind === "found" && !matches && `Your location looks like ${gpsNames}. Without a match you'll show as “Self-selected”.`}
        {state.kind === "outside" && "You're outside Ayal's areas right now, so you'll show as “Self-selected”."}
        {state.kind === "error" && (
          <>
            {state.message}{" "}
            <button type="button" onClick={locate} className="btn-link text-xs">Retry</button>
          </>
        )}
      </p>
      {open.length === 1 && (
        <p className="hint">Only {open[0]!.name} is open during the pilot. More localities soon.</p>
      )}
    </div>
  );
}
