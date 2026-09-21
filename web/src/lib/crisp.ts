/**
 * Talking to the Crisp chat widget.
 *
 * ── Why this helper exists ───────────────────────────────────────────────
 * The obvious readiness check — `Array.isArray(window.$crisp)` — is wrong,
 * and it silently broke every chat entry point on the site.
 *
 * CrispLoader seeds `window.$crisp = []` as a command queue. But once
 * client.crisp.chat finishes booting it REPLACES that array with its own
 * instance object (from Crisp's client bundle):
 *
 *     window.$__CRISP_INSTANCE = e;  window.$crisp = e;
 *
 * `e` is not an array. So `Array.isArray(window.$crisp)` is true only during
 * the brief window BEFORE Crisp is ready, and false forever after — exactly
 * backwards from what the call sites assumed. A visitor who clicked "chat"
 * after the widget had loaded (i.e. essentially everyone) hit the dead
 * fallback branch instead of opening the chat.
 *
 * Both states accept `.push([...])`: the pre-boot array queues commands and
 * Crisp replays them via its `pending_actions` spool, and the booted instance
 * executes them directly. That is exactly why Crisp documents `$crisp.push()`
 * as the public API. So probe for a callable `push`, never for an array.
 */

type CrispCommandSink = {
  push: (command: unknown[]) => void;
};

declare global {
  interface Window {
    $crisp?:           CrispCommandSink;
    CRISP_WEBSITE_ID?: string;
  }
}

/** The empty command queue CrispLoader installs before the script boots. */
export function newCrispQueue(): CrispCommandSink {
  return [] as unknown[][];
}

/** True when a command can be handed to Crisp — queued or executed. */
export function isCrispReady(): boolean {
  return typeof window !== "undefined" && typeof window.$crisp?.push === "function";
}

/**
 * Opens the Crisp chat, maximized. Returns false when Crisp is genuinely
 * unreachable (script blocked by an extension, offline, no website id) so
 * callers can fall back to a phone number or email rather than doing nothing.
 */
export function openCrispChat(): boolean {
  if (!isCrispReady()) return false;
  window.$crisp!.push(["do", "chat:open"]);
  return true;
}
