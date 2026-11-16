"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LocalityCandidate } from "@/lib/types";

export type GpsState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "found"; candidates: LocalityCandidate[]; lat: number; lng: number; accuracy: number }
  | { kind: "outside"; lat: number; lng: number }
  | { kind: "error"; message: string };

/**
 * Asks the browser for a GPS fix and maps it to a locality.
 * The coordinates stay in memory only; the server re-checks them and never stores them.
 */
export function useGpsLocality() {
  const [state, setState] = useState<GpsState>({ kind: "idle" });

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "This browser can't share location. Pick your locality below." });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const { data, error } = await createClient().rpc("locality_for_point", { p_lat: lat, p_lng: lng });
        if (error) {
          setState({ kind: "error", message: "Couldn't check your location. Pick your locality below." });
          return;
        }
        const candidates = (data ?? []) as LocalityCandidate[];
        setState(candidates.length ? { kind: "found", candidates, lat, lng, accuracy } : { kind: "outside", lat, lng });
      },
      (err) => {
        setState({
          kind: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Location is off for this site. Pick your locality below."
              : "Couldn't get your location. Pick your locality below.",
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  return { state, locate };
}
