// Push notifications on this device. iPhones and iPads only allow them once Luex Life
// has been added to the home screen (an Apple rule).
import { supabase } from "@/lib/supabase";


export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

export type PushState = "unsupported" | "needs-home-screen" | "blocked" | "off" | "on";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "needs-home-screen" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function turnPushOn(): Promise<void> {
  const { data: publicKey } = await supabase.rpc("push_public_key");
  if (!publicKey) throw new Error("Notifications are still being set up. Please try again in a few minutes");
  if (!("serviceWorker" in navigator)) throw new Error("This browser can't show notifications");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed. You can allow them in your browser settings");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: j.endpoint ?? "",
    p_p256dh: j.keys?.p256dh ?? "",
    p_auth: j.keys?.auth ?? "",
    p_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
}

/** Stop notifications on this device (also used when signing out) */
export async function turnPushOff(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
