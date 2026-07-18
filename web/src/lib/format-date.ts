/**
 * Format an ISO date (YYYY-MM-DD) as "Reviewed <Month YYYY>" — used for the
 * `lastUpdated` freshness indicator on NFP cluster pages. The pages are
 * fact-checked against government sources and the visible date signals
 * that to readers + Google's E-E-A-T signals.
 */
export function formatReviewedDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return "Reviewed " + d.toLocaleDateString("en-CA", {
    timeZone: "UTC",
    month: "long",
    year:  "numeric",
  });
}
