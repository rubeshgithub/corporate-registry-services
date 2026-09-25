/**
 * Parse a registry date. Registries return date-only strings ("2025-01-29"),
 * which `new Date()` reads as UTC midnight — so in Mountain time the page
 * showed Jan 28 and anniversary deadlines landed a day early. Date-only
 * strings are built as local calendar dates instead.
 */
export function parseRegistryDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
