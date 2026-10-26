/**
 * The visitor's analytics session (the crs_session_id cookie set by components/Analytics.tsx) as Stripe
 * metadata on every website checkout (owner, Oct 2026). docu10 uses it to put a declined card or a paid order
 * on the right row of Insights → Order-page visitors. Random and not tied to identity; omitted when absent.
 */
export function visitMeta(req: Request): { crs_session?: string } {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)crs_session_id=([^;]+)/);
  if (!m) return {};
  let v = "";
  try { v = decodeURIComponent(m[1]); } catch { return {}; }
  return /^[A-Za-z0-9-]{8,64}$/.test(v) ? { crs_session: v } : {};
}
