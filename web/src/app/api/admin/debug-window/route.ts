import { NextResponse } from "next/server";
import { resolveWindow, OPERATOR_TZ } from "@/lib/analytics";

export async function GET() {
  const now = new Date();

  // Calculate what "today" resolves to
  const cfg = resolveWindow("today");
  const startOfToday = new Date(cfg.sinceMs);

  // Helper to format date in Mountain Time
  const formatMT = (d: Date) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: OPERATOR_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  };

  return NextResponse.json({
    currentTimeUTC: now.toISOString(),
    currentTimeMT: formatMT(now),
    todayWindowStart: startOfToday.toISOString(),
    todayWindowStartMT: formatMT(startOfToday),
    todayWindowLabel: cfg.label,
    sinceUnixTimestamp: Math.floor(cfg.sinceMs / 1000),
    hoursFromStartToNow: (now.getTime() - startOfToday.getTime()) / (3600 * 1000),
  });
}
