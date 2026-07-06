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
 * deadline. If today is past that deadline, we assume the corporation is
 * overdue (the registry doesn't tell us whether they've already filed —
 * the customer can decide whether to ignore the alert).
 */

export type DueStatus = "overdue" | "due_soon" | "on_track" | "unknown";

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
  on:     "fiscal", // filed with the T2 corporate tax return
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

  const incorp = new Date(incorporationDateISO);
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
    // Past this year's window — assume overdue.
    const daysOverdue = Math.floor((today.getTime() - thisYearDeadline.getTime()) / 86400000);
    const nextAnniv = new Date(currentYear + 1, incorp.getMonth(), incorp.getDate());
    const nextDeadline = new Date(nextAnniv);
    nextDeadline.setDate(nextDeadline.getDate() + grace);
    return {
      dueDate:      thisYearDeadline,
      daysUntilDue: -daysOverdue,
      status:       "overdue",
      label:        `OVERDUE by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} — was due ${fmt(thisYearDeadline)}`,
      explanation:  `If already filed for this period, your next deadline is ${fmt(nextDeadline)}.`,
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
