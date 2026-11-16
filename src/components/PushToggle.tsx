"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

type State = "loading" | "unsupported" | "ios-install" | "off-config" | "denied" | "off" | "on";

/** Turns web push on or off for THIS browser/device. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!VAPID_PUBLIC_KEY) return setState("off-config");
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!supported) return setState(isIos && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await save(sub); // keeps the device linked to whoever is signed in now
        setState("on");
      } else setState("off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
      await save(sub);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await createClient().rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Checking this device…</p>;
  if (state === "off-config") return <p className="text-sm text-muted">Phone notifications aren&apos;t set up on this server yet.</p>;
  if (state === "unsupported") return <p className="text-sm text-muted">This browser can&apos;t show notifications. You&apos;ll still get emails.</p>;
  if (state === "ios-install")
    return (
      <p className="text-sm text-muted">
        On iPhone, first add Ayal to your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open
        Ayal from there and come back here.
      </p>
    );
  if (state === "denied")
    return <p className="text-sm text-muted">Notifications are blocked for Ayal in this browser&apos;s settings. Allow them there, then reload.</p>;

  return (
    <div>
      {state === "on" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-brand">✓ On for this device</p>
          <button onClick={disable} disabled={busy} className="btn-outline">Turn off</button>
        </div>
      ) : (
        <button onClick={enable} disabled={busy} className="btn-primary">
          {busy ? "Turning on…" : "🔔 Turn on notifications"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await createClient().rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
  });
  if (error) throw new Error(error.message);
}

function toBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
