/**
 * Telling a corporation's own (home) registry record apart from its
 * extra-provincial registrations — the records other provinces keep when a
 * corporation formed elsewhere registers to do business there.
 *
 * Pure, so client components can import it. Registries label these records
 * differently, as seen in /api/company-search results:
 *   BC "Extraprovincial Company" (numbers start with A) · ON "FEDERAL CORP WITH
 *   SHARE" · MB "FEDERAL- SHARE CORPORATION" · SK "MRAS Corporation" /
 *   "NWP Corporation" · NS "Extra-provincial Corporation Federal" ·
 *   AB "Federal Corporation" / "Other Prov/Territory Corps", status "Registered".
 * Quebec lists extra-provincial companies under ordinary types, so they are
 * not detectable from a search hit.
 */

export type RegistryHitLike = {
  name:          string;
  registryId:    string;
  provinceKey:   string;
  jurisdiction:  string;
  entityType?:   string;
  status?:       string;
  statusNotes?:  string;
};

const EXTRA_PROVINCIAL_TYPE = /extra[- ]?provincial|other prov|foreign|\bmras\b|\bnwp\b/i;

export function isExtraProvincial(h: RegistryHitLike): boolean {
  if (h.provinceKey === "federal") return false;
  const type = h.entityType ?? "";
  if (EXTRA_PROVINCIAL_TYPE.test(type)) return true;
  // A provincial record typed "federal" is a federal corporation's registration there.
  if (/federal/i.test(type)) return true;
  if (h.provinceKey === "bc" && /^A\d/i.test(h.registryId)) return true;
  // Alberta corporations read "Incorporated" (or Amalgamated, Revived…); registrations read "Registered".
  if (h.provinceKey === "ab" && /^registered$/i.test((h.statusNotes ?? "").trim())) return true;
  return false;
}

/** The home jurisdiction, when the record states it. */
export function homeJurisdictionOf(h: RegistryHitLike): "federal" | null {
  return /federal/i.test(h.entityType ?? "") ? "federal" : null;
}

const LEGAL_SUFFIX = /\b(the|limited|ltd|incorporated|inc|corporation|corp|company|co|ltee|ltée)\b/g;
const normalizedName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();

/**
 * The same corporation's home record(s) among search results: same name, not
 * itself an extra-provincial registration, in the stated home jurisdiction
 * when there is one. Active records first; inactive ones (amalgamated
 * predecessors) only when no active record exists.
 */
export function homeRecordsFor<T extends RegistryHitLike>(hit: T, results: T[]): T[] {
  const name = normalizedName(hit.name);
  const home = homeJurisdictionOf(hit);
  const same = results.filter((r) =>
    r !== hit &&
    normalizedName(r.name) === name &&
    !isExtraProvincial(r) &&
    (!home || r.provinceKey === home),
  );
  const active = same.filter((r) => /^active$/i.test(r.status ?? ""));
  return (active.length ? active : same).slice(0, 3);
}
