import { type Collection } from "mongodb";
import { registrarDb } from "@/lib/registrar-mongo";

/**
 * Alberta non-profit directory — the monthly "Non Profit Name list" export
 * from Alberta's Open Data Portal (the dataset behind the Alberta Non-profit
 * Listing Dashboard on alberta.ca).
 *
 * Why a separate collection from `crs.companies`: the registrar corpus is
 * event-driven (gazette periodicals), so it only holds the ~18k societies
 * that had a gazette event since the archive begins — the open-data list is
 * the COMPLETE register (~70k rows: Alberta Societies, Religious Societies,
 * Agricultural Societies, non-profit companies, extra-provincial NPOs).
 * The list carries NO corporate access numbers, so rows here can't be merged
 * into `companies` docs (whose _id is the corp number) without fabricating
 * ids; they surface in search as name-keyed directory entries instead.
 *
 * Refresh: the operator downloads the new month's xlsx from alberta.ca and
 * drops it on /admin/nonprofits. The upload tags every row with its run id
 * and deletes rows from older runs once the new load succeeds, so the
 * collection always mirrors exactly one monthly export.
 */

export type NonprofitDoc = {
  _id:              string;   // "<nameNorm>|<entityType>" — the export has no registry numbers
  name:             string;
  nameNorm:         string;   // normalizeName() — same convention as crs.companies
  entityType:       string;   // "Alberta Society", "Religious Society", ...
  status:           string;   // raw list status: Active, Struck, Dissolved, Amalgamated, ...
  registrationDate: string;   // "YYYY-MM-DD" ("" when the export cell was blank)
  city:             string;
  postal:           string;
  importRun:        string;   // ISO timestamp of the upload that wrote this row
};

export type NonprofitMetaDoc = {
  _id:        "latest-import";
  importRun:  string;
  importedAt: Date;
  filename:   string;
  rows:       number;
  byType:     Record<string, number>;
  byStatus:   Record<string, number>;
};

export async function nonprofits(): Promise<Collection<NonprofitDoc>> {
  return (await registrarDb()).collection<NonprofitDoc>("nonprofits");
}

export async function nonprofitsMeta(): Promise<Collection<NonprofitMetaDoc>> {
  return (await registrarDb()).collection<NonprofitMetaDoc>("nonprofits_meta");
}

/** Same normalization as scripts/bulk_load_master.mjs, so nameNorm values
 *  here compare 1:1 against `crs.companies.nameNorm` for dedup at search
 *  time. Keep the two in lockstep. */
export function normalizeNonprofitName(s: string): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort index creation — idempotent, first call per app lifetime. */
let indexesEnsured = false;
export async function ensureNonprofitsIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const c = await nonprofits();
    await c.createIndex({ nameNorm: 1 }, { name: "name_norm" });
    await c.createIndex({ importRun: 1 }, { name: "import_run" });
    await c.createIndex({ name: "text" }, { name: "name_text", default_language: "english" });
  } catch (e) {
    indexesEnsured = false;
    console.error("[nonprofits-mongo] failed to ensure indexes:", e);
  }
}
