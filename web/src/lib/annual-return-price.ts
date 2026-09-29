/**
 * Which catalogue price an annual return uses. Some provinces have their own
 * (owner, Sep 2026), each all-in with that province's government fee:
 *   British Columbia  annual-return-bc  $99  — BC Registries' fee is $43.39 and
 *                     filing is easy for anyone with a login, so BC is lower;
 *                     filed with the company password, no BCeID / BC Services Card app.
 *   Alberta           annual-return-ab  $159 — Alberta's government fee (~$77)
 *                     is most of the old $129; Alberta filings must go through
 *                     a registry agent anyway.
 * Everywhere else uses "annual-return". Professional corporations keep their
 * own PC price (proCorpPriceCentsLive).
 */
export type AnnualReturnKey = "annual-return" | "annual-return-bc" | "annual-return-ab";

const BY_PROVINCE: Record<string, AnnualReturnKey> = { bc: "annual-return-bc", ab: "annual-return-ab" };

export function annualReturnPriceKey(provinceKey: string | null | undefined): AnnualReturnKey {
  return BY_PROVINCE[(provinceKey ?? "").toLowerCase()] ?? "annual-return";
}

/** One line for BC checkouts: what the price covers and what it assumes. */
export const BC_ANNUAL_RETURN_NOTE =
  "Includes the BC Registries fee. No BCeID or BC Services Card app needed — we file with your company password (access code).";

export const AB_ANNUAL_RETURN_NOTE =
  "Includes the Alberta government filing fee. Filed with the Alberta Corporate Registry by a CORES-certified agent.";

/** The checkout note for a province with its own annual-return price. */
export function annualReturnNote(provinceKey: string | null | undefined): string {
  const k = (provinceKey ?? "").toLowerCase();
  return k === "bc" ? BC_ANNUAL_RETURN_NOTE : k === "ab" ? AB_ANNUAL_RETURN_NOTE : "";
}
