import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * Snapshots of Google Search Console data — one document per pull.
 * Kept as embedded arrays inside a single doc so the dashboard can render
 * the whole snapshot in one Mongo read, and so week-over-week deltas are
 * cheap to compute across two snapshot docs.
 *
 * Lives in the `crs_analytics` DB alongside pageviews / clicks / searches
 * (same Mongo connection).
 */

export type PageRow = {
  path:        string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
};

export type QueryRow = {
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
};

export type PageQueryRow = {
  path:        string;
  query:       string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
};

export type GscSnapshot = {
  _id:        string;              // ISO date like "2026-07-14" — one snapshot per day max
  pulledAt:   Date;
  rangeStart: string;              // YYYY-MM-DD
  rangeEnd:   string;
  windowDays: number;
  pages:      PageRow[];
  queries:    QueryRow[];
  pageQueries: PageQueryRow[];
};

export async function gscSnapshots(): Promise<Collection<GscSnapshot>> {
  return (await db()).collection<GscSnapshot>("gsc_snapshots");
}

/** Latest snapshot by pull date. Returns null if none exists. */
export async function latestSnapshot(): Promise<GscSnapshot | null> {
  const col = await gscSnapshots();
  return col.findOne({}, { sort: { pulledAt: -1 } });
}

/** Second-most-recent snapshot — for week-over-week delta comparisons. */
export async function previousSnapshot(latestId: string): Promise<GscSnapshot | null> {
  const col = await gscSnapshots();
  return col.findOne({ _id: { $ne: latestId } }, { sort: { pulledAt: -1 } });
}
