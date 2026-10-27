import { parseRegistryDate } from "./dates";

/**
 * Jurisdiction-aware annual-return deadline calculator.
 *
 * Every result card in the inline lookup widget needs to answer "when does
 * this corporation's next annual return actually need to be filed?" The
 * math varies by jurisdiction — most use "anniversary of incorporation +
 * grace period", but Ontario and Quebec tie filing to the fiscal year,
 * which we can't derive from the registry lookup alone.
 *
 * For anniversary-based jurisdictions we compute the current period's
 * deadline. Past it, the status is "check", NEVER "overdue": no Canadian
 * registry feed we use says when a return was last filed, and calling a
 * client who filed on time "OVERDUE by 135 days" (owner, Oct 2026 — LISEGA,
 * INC., an emailed snapshot) confuses and alarms them. The wording says when
 * this year's return was due, when the next one is if it has been filed, and
 * that the Profile Report shows the filing history.
 */

export type DueStatus = "check" | "due_soon" | "on_track" | "unknown";

export type DueDateInfo = {
  dueDate:      Date | null;
  daysUntilDue: number | null;
  status:       DueStatus;
  label:        string;
  explanation?: string;
};

/** Grace period in days from the anniversary of incorporation, or "fiscal"
 *  when the jurisdiction ties filing to the corporation's fiscal year. */
const GRACE_DAYS: Record<string, number | "fiscal"> = {
  ab:      30,      // 1 month — the tightest window in Canada
  bc:      60,      // 2 months
  federal: 60,      // CBCA — within 60 days of anniversary
  mb:       0,      // on the anniversary
  nb:      60,
  nl:      60,
  nt:      60,
  ns:      30,      // 30-day window
  nu:      60,
  on:     "fiscal", // within 6 months of fiscal year-end, via the Ontario Business Registry
  pe:      60,
  qc:     "fiscal", // filed with the tax return
  sk:      90,      // 3 months
  yt:      60,
};

function fmt(d: Date): string {
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function calculateAnnualReturnDeadline(
  incorporationDateISO: string | undefined,
  provinceKey: string,
): DueDateInfo {
  const grace = GRACE_DAYS[provinceKey];

  if (grace === undefined) {
    return { dueDate: null, daysUntilDue: null, status: "unknown", label: "Deadline varies — check jurisdiction rules" };
  }
  if (grace === "fiscal" && provinceKey === "on") {
    /* Since Oct 2021 Ontario annual returns are filed on their own through
       the Ontario Business Registry — no longer with the T2. */
    return {
      dueDate:      null,
      daysUntilDue: null,
      status:       "unknown",
      label:        "Due within 6 months of the fiscal year-end",
      explanation:  "Ontario annual returns are filed through the Ontario Business Registry within six months after the corporation's fiscal year-end.",
    };
  }
  if (grace === "fiscal") {
    return {
      dueDate:      null,
      daysUntilDue: null,
      status:       "unknown",
      label:        "Filed with your corporate tax return",
      explanation:  "This jurisdiction ties the annual return to your corporation's fiscal year end, not the incorporation anniversary. Confirm with your accountant.",
    };
  }
  if (!incorporationDateISO) {
    return { dueDate: null, daysUntilDue: null, status: "unknown", label: "Unknown incorporation date" };
  }

  const incorp = parseRegistryDate(incorporationDateISO) ?? new Date(NaN);
  if (isNaN(incorp.getTime())) {
    return { dueDate: null, daysUntilDue: null, status: "unknown", label: "Unknown incorporation date" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // This year's deadline = this year's anniversary + grace days
  const currentYear = today.getFullYear();
  const anniv = new Date(currentYear, incorp.getMonth(), incorp.getDate());
  const thisYearDeadline = new Date(anniv);
  thisYearDeadline.setDate(thisYearDeadline.getDate() + grace);

  if (thisYearDeadline < today) {
    // Past this year's window. Whether it was filed is not in any public feed — say so, never "overdue".
    const daysPast = Math.floor((today.getTime() - thisYearDeadline.getTime()) / 86400000);
    const nextAnniv = new Date(currentYear + 1, incorp.getMonth(), incorp.getDate());
    const nextDeadline = new Date(nextAnniv);
    nextDeadline.setDate(nextDeadline.getDate() + grace);
    return {
      dueDate:      thisYearDeadline,
      daysUntilDue: -daysPast,
      status:       "check",
      label:        `${currentYear} return was due ${fmt(thisYearDeadline)} · next due ${fmt(nextDeadline)} if filed`,
      explanation:  "Public registry records don't show filing dates. Not sure it was filed? The Profile Report shows the corporation's filing history.",
    };
  }

  const daysUntilDue = Math.ceil((thisYearDeadline.getTime() - today.getTime()) / 86400000);
  const status: DueStatus = daysUntilDue <= 30 ? "due_soon" : "on_track";
  return {
    dueDate:      thisYearDeadline,
    daysUntilDue,
    status,
    label:        `Due ${fmt(thisYearDeadline)} · ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} away`,
  };
}
