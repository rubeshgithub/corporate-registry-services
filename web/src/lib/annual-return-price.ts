/**
 * Which catalogue price an annual return uses. British Columbia has its own
 * (Sep 2026): BC Registries' own fee is $43.39 and filing online is easy for
 * anyone with a login, so BC is priced lower — $99 + GST including the
 * registry fee, filed with the company's password (access code), no BCeID or
 * BC Services Card app. Everywhere else uses "annual-return".
 * Professional corporations keep their own PC price (proCorpPriceCentsLive).
 */
export function annualReturnPriceKey(provinceKey: string | null | undefined): "annual-return" | "annual-return-bc" {
  return (provinceKey ?? "").toLowerCase() === "bc" ? "annual-return-bc" : "annual-return";
}

/** One line for BC checkouts: what the price covers and what it assumes. */
export const BC_ANNUAL_RETURN_NOTE =
  "Includes the BC Registries fee. No BCeID or BC Services Card app needed — we file with your company password (access code).";
