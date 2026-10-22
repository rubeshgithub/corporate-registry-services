/**
 * A form event for the analytics `clicks` collection (client only; same session cookie and endpoint as
 * components/Analytics.tsx). Used for things that are not links — the registry-key answer on order forms
 * ("registry-access") and a click on a grey pay button ("pay-blocked"). docu10's Order-page visitors report
 * reads them. Never put anything the visitor typed in `label`: it holds only fixed codes.
 */
export function trackClick(target: string, label: string): void {
  try {
    if (typeof document === "undefined") return;
    const m = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/);
    if (!m) return;
    const body = JSON.stringify({ type: "click", path: location.pathname, target, label, sessionId: decodeURIComponent(m[1]) });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* analytics never breaks the page */
  }
}
