import Stripe from "stripe";
import { db } from "./mongo";
import { OPERATOR_TZ, type WindowToken } from "./analytics";

/**
 * Read-side aggregator for the 4 inbound-lead collections the admin analytics
 * page needs but that aren't part of the core analytics pipeline:
 *
 *   - search_leads                       (soft email capture on search results)
 *   - order_drafts                       (cart-abandonment beacon)
 *   - inbound_messages                   (contact form + wizard submits)
 *   - incorporation_consultation_requests + nfp_consultation_requests
 *
 * Each returns a small, ready-to-render summary — count + recent rows.
 * Kept intentionally separate from analytics.ts so a schema change on
 * either side doesn't ripple through the whole dashboard.
 */

export type SearchLeadRow      = {
  email:         string;
  query:         string;
  province:      string;
  resultCount:   number;
  createdAt:     string;
  intent?:       "save-search" | "unlock-profile";
  registryId?:   string;
  jurisdiction?: string;
};
export type OrderDraftRow      = {
  sessionId:   string;
  service:     string;
  path:        string;
  contactName: string;
  email:       string;
  phone:       string;
  company:     string;
  jurisdiction: string;
  updatedAt:   string;
  createdAt:   string;
  paid:        boolean;    // true if a Stripe session for this sessionId exists
};
export type InboundMessageRow  = { source: "contact" | "wizard"; name: string; email: string; phone: string; subject: string; message: string; createdAt: string };
export type ConsultationRow    = { kind: "incorp" | "nfp"; name: string; email: string; phone: string; jurisdiction: string; summary: string; explorationMode: boolean; createdAt: string };

export type InboundInsights = {
  windowLabel:            string;
  searchLeadsCount:       number;
  searchLeadsRecent:      SearchLeadRow[];
  orderDraftsCount:       number;   // drafts unmatched by a Stripe paid session
  orderDraftsRecent:      OrderDraftRow[];
  inboundMessagesCount:   number;
  inboundMessagesRecent:  InboundMessageRow[];
  consultationCount:      number;
  consultationRecent:     ConsultationRow[];
};

/** Same window derivation as analytics.ts — keeps every card on the same
 *  clock so the tabs at the top refresh the entire dashboard consistently. */
function sinceForToken(token: WindowToken): { since: Date; label: string } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (token) {
    case "1h":    return { since: new Date(now - 60 * 60 * 1000), label: "Past 1 hour" };
    case "today": {
      /* Start-of-day in Mountain Time — mirror analytics.ts behaviour. */
      const nowStr = new Date().toLocaleString("en-CA", { timeZone: OPERATOR_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
      const [y, m, d] = nowStr.split(/[-,\s]/).filter(Boolean).map(Number);
      const startLocal = new Date(Date.UTC(y, m - 1, d, 6, 0, 0)); // MDT UTC-6; close enough for daily bucketing
      return { since: startLocal, label: "Today (MST)" };
    }
    case "7d":    return { since: new Date(now -   7 * day), label: "Last 7 days"  };
    case "30d":   return { since: new Date(now -  30 * day), label: "Last 30 days" };
    case "90d":   return { since: new Date(now -  90 * day), label: "Last 90 days" };
    case "1y":    return { since: new Date(now - 365 * day), label: "Last 1 year"  };
  }
}

export async function getInboundInsights(token: WindowToken = "30d"): Promise<InboundInsights> {
  const { since, label: windowLabel } = sinceForToken(token);
  const database = await db();

  /* Search leads — soft email capture from /canada-corporations-search */
  const searchLeadsCol = database.collection("search_leads");
  const searchLeadsCount = await searchLeadsCol.countDocuments({ createdAt: { $gte: since } });
  const searchLeadsRaw  = await searchLeadsCol
    .find(
      { createdAt: { $gte: since } },
      { projection: { email: 1, query: 1, province: 1, resultCount: 1, createdAt: 1, intent: 1, registryId: 1, jurisdiction: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(15)
    .toArray();
  const searchLeadsRecent: SearchLeadRow[] = searchLeadsRaw.map((d) => ({
    email:        String(d.email ?? ""),
    query:        String(d.query ?? ""),
    province:     String(d.province ?? "all"),
    resultCount:  Number(d.resultCount ?? 0),
    createdAt:    (d.createdAt as Date).toISOString(),
    intent:       d.intent === "unlock-profile" ? "unlock-profile"
               :  d.intent === "save-search"    ? "save-search"
               :  undefined,
    registryId:   d.registryId   ? String(d.registryId)   : undefined,
    jurisdiction: d.jurisdiction ? String(d.jurisdiction) : undefined,
  }));

  /* Consultation requests (both types merged for admin convenience) */
  const incConsulCol = database.collection("incorporation_consultation_requests");
  const nfpConsulCol = database.collection("nfp_consultation_requests");
  const [incRows, nfpRows] = await Promise.all([
    incConsulCol.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(30).toArray(),
    nfpConsulCol.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(30).toArray(),
  ]);
  const consultationRecent: ConsultationRow[] = [
    ...incRows.map((d): ConsultationRow => {
      const c = d.contact as { fullName?: string; email?: string; phone?: string } | undefined;
      const corp = d.corporation as { jurisdictionLabel?: string; jurisdictionKey?: string; name1?: string; nameType?: string } | null | undefined;
      return {
        kind:            "incorp",
        name:            c?.fullName ?? "",
        email:           c?.email ?? "",
        phone:           c?.phone ?? "",
        jurisdiction:    corp?.jurisdictionLabel ?? corp?.jurisdictionKey ?? "—",
        summary:         corp
          ? (corp.nameType === "numbered" ? "Numbered incorporation" : `Named: ${corp.name1 ?? "—"}`)
          : "Just wants to talk (exploration mode)",
        explorationMode: d.explorationMode === true,
        createdAt:       (d.createdAt as Date).toISOString(),
      };
    }),
    ...nfpRows.map((d): ConsultationRow => {
      const c = d.contact as { fullName?: string; email?: string; phone?: string } | undefined;
      const org = d.organization as { jurisdictionLabel?: string; jurisdictionKey?: string; name1?: string } | null | undefined;
      return {
        kind:            "nfp",
        name:            c?.fullName ?? "",
        email:           c?.email ?? "",
        phone:           c?.phone ?? "",
        jurisdiction:    org?.jurisdictionLabel ?? org?.jurisdictionKey ?? "—",
        summary:         org ? `NFP: ${org.name1 ?? "—"}` : "NFP exploration",
        explorationMode: d.explorationMode === true,
        createdAt:       (d.createdAt as Date).toISOString(),
      };
    }),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15);
  const consultationCount = incRows.length + nfpRows.length;

  /* Inbound messages (contact + wizard) */
  const inboundCol = database.collection("inbound_messages");
  const inboundCount = await inboundCol.countDocuments({ createdAt: { $gte: since } });
  const inboundRaw = await inboundCol
    .find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(15)
    .toArray();
  const inboundMessagesRecent: InboundMessageRow[] = inboundRaw.map((d) => ({
    source:    (d.source as "contact" | "wizard") ?? "contact",
    name:      String(d.name ?? ""),
    email:     String(d.email ?? ""),
    phone:     String(d.phone ?? ""),
    subject:   String(d.subject ?? ""),
    message:   String(d.message ?? "").slice(0, 260),
    createdAt: (d.createdAt as Date).toISOString(),
  }));

  /* Order drafts — cart-abandonment. Need to cross-reference with paid
     Stripe sessions to determine "did they end up paying?" — cheap check
     using Stripe list since Stripe is the source of truth for payments. */
  const draftsCol   = database.collection("order_drafts");
  const draftsRaw   = await draftsCol
    .find({ updatedAt: { $gte: since } })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();

  /* Cross-reference against paid Stripe sessions to flag drafts that
     actually converted (so they don't clutter the abandonment view).
     Email is the most reliable join key — sessionId cookies can be
     cleared, but the visitor rarely changes email mid-flow. */
  const paidEmails = new Set<string>();
  const secret = process.env.STRIPE_SECRET_KEY;
  if (secret && draftsRaw.length > 0) {
    try {
      const stripe = new Stripe(secret);
      const it = stripe.checkout.sessions.list({
        limit:   100,
        created: { gte: Math.floor(since.getTime() / 1000) },
      });
      for await (const s of it) {
        if (s.payment_status === "paid") {
          const email = s.customer_details?.email?.toLowerCase().trim();
          if (email) paidEmails.add(email);
        }
      }
    } catch (e) {
      console.error("[inbound-insights] Stripe list failed, skipping paid-flag:", e instanceof Error ? e.message : e);
    }
  }

  const orderDraftsRecent: OrderDraftRow[] = draftsRaw.map((d) => {
    const contact = (d.contact ?? {}) as { name?: string; email?: string; phone?: string };
    const company = (d.company ?? {}) as { name?: string; jurisdiction?: string };
    const email   = (contact.email ?? "").toLowerCase().trim();
    return {
      sessionId:    String(d.sessionId ?? ""),
      service:      String(d.service ?? ""),
      path:         String(d.path ?? ""),
      contactName:  contact.name  ?? "",
      email,
      phone:        contact.phone ?? "",
      company:      company.name          ?? "",
      jurisdiction: company.jurisdiction  ?? "",
      updatedAt:    (d.updatedAt as Date).toISOString(),
      createdAt:    (d.createdAt as Date).toISOString(),
      paid:         !!email && paidEmails.has(email),
    };
  });
  const orderDraftsCount = orderDraftsRecent.filter((d) => !d.paid).length;

  return {
    windowLabel,
    searchLeadsCount,      searchLeadsRecent,
    orderDraftsCount,      orderDraftsRecent,
    inboundMessagesCount:  inboundCount,
    inboundMessagesRecent,
    consultationCount,     consultationRecent,
  };
}

/** Format an ISO datetime for the operator's timezone. */
export function fmtLocal(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: OPERATOR_TZ,
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
