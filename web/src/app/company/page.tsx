import type { Metadata } from "next";
import { ArrowRight, BadgeCheck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SnapshotCapture from "@/components/SnapshotCapture";
import CompanyProfileUnlock, { type ProfileHit } from "@/components/CompanyProfileUnlock";
import { searchCompanies } from "@/lib/company-search-core";
import { getPrices } from "@/lib/pricing";
import { formatCents } from "@/lib/price-catalogue";
import { annualReturnPriceKey } from "@/lib/annual-return-price";
import { isProfessionalCorporation } from "@/lib/professional-corp";

/**
 * /company?p=<province key>&id=<registry number>&n=<name>
 *
 * Flow A (owner, Nov 10 2026): a search result's "View profile" lands here. Free snapshot from the same live
 * registry search the result came from (looked up again on the server — nothing the browser sent is shown as a
 * fact), then the Corporate Profile Report as a locked placeholder with "Unlock", then the other services.
 *
 * Built from a live search, not a stored record, so it is never indexed.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title:  "Company profile | CRS",
  robots: { index: false, follow: false },
};

/* What the registry's profile report contains, by jurisdiction. Shareholders are listed only on Alberta,
   Saskatchewan and Quebec reports (owner confirmed, Nov 10 2026) — never blur a section the report will not have. */
const WITH_SHAREHOLDERS = new Set(["ab", "sk", "qc"]);
function reportSections(provinceKey: string): string[] {
  return [
    "Directors",
    ...(WITH_SHAREHOLDERS.has(provinceKey) ? ["Shareholders"] : []),
    "Registered office address",
    "Mailing address",
    "Filing history",
  ];
}

async function lookUp(p: string, id: string, n: string): Promise<ProfileHit | null> {
  const q = id || n;
  if (q.trim().length < 2) return null;
  try {
    const url = new URL("http://internal/company");
    url.searchParams.set("q", q);
    url.searchParams.set("province", p || "all");
    const res = await searchCompanies(new Request(url.toString()));
    if (!res.ok) return null;
    const rows = ((await res.json()) as { results?: ProfileHit[] }).results ?? [];
    const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
    return (
      (id ? rows.find((r) => same(r.registryId ?? "", id) && (!p || r.provinceKey === p)) : undefined) ??
      (id ? rows.find((r) => same(r.registryId ?? "", id)) : undefined) ??
      (n  ? rows.find((r) => same(r.name ?? "", n) && (!p || r.provinceKey === p)) : undefined) ??
      null
    );
  } catch {
    return null;
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CompanyProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const p  = one(sp.p).toLowerCase().slice(0, 20);
  const id = one(sp.id).slice(0, 60);
  const n  = one(sp.n).slice(0, 160);

  const [hit, prices] = await Promise.all([lookUp(p, id, n), getPrices()]);

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <Header />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "1.5rem 1.5rem 4rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <a href="/canada-corporations-search" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>
            ← Back to search
          </a>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );

  if (!hit) {
    return shell(
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.75rem", boxShadow: "var(--shadow-card)" }}>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", margin: "0 0 0.6rem" }}>
          We couldn&apos;t load this company right now
        </h1>
        <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-muted)" }}>
          The registry did not return {n ? <strong style={{ color: "var(--text)" }}>{n}</strong> : "that record"} just now.
          Go back and search again, or email support@corporateregistryservices.ca and we will look it up for you.
        </p>
      </div>,
    );
  }

  const pc        = isProfessionalCorporation(hit);
  const reportKey = pc ? "pc-profile-report" : "profile-report";
  const active    = hit.status === "Active";
  const facts: Array<[string, string]> = [
    ["Registry ID",       hit.registryId || "—"],
    ["Business Number",   hit.businessNumber || "—"],
    ["Incorporated",      hit.registrationDate || "—"],
    ["Status",            hit.statusNotes ? `${hit.status} · ${hit.statusNotes}` : hit.status || "—"],
    ["Type",              hit.entityType || "—"],
    ["Home jurisdiction", [hit.location, hit.jurisdiction].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "—"],
  ];

  const orderQs = (() => {
    const q = new URLSearchParams();
    q.set("q", hit.name);
    if (hit.provinceKey) q.set("jurisdiction", hit.provinceKey);
    if (hit.registryId)  q.set("registryId", hit.registryId);
    q.set("src", "company-profile");
    return q.toString();
  })();
  const priceText = (key: string, from = false) => (prices[key] != null ? `${from ? "from " : ""}${formatCents(prices[key])} + GST` : "");
  const services: Array<{ label: string; price: string; href: string }> = [
    { label: "File an annual return",        price: priceText(pc ? "pc-annual-return" : annualReturnPriceKey(hit.provinceKey)), href: `/order/annual-return?${orderQs}` },
    { label: "Certificate of good standing", price: priceText("good-standing"),                   href: `/order/good-standing?${orderQs}` },
    { label: "Copies of corporate documents", price: priceText("corporate-document-single", true), href: `/order/corporate-documents?${orderQs}` },
    { label: "Minute book",                  price: "",                                           href: `/order/minute-book?${orderQs}` },
    ...(pc ? [{ label: "All professional corporation services", price: "", href: `/order/professional-corporation?${orderQs}` }] : []),
  ];

  const card: React.CSSProperties = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)",
    padding: "1.5rem", boxShadow: "var(--shadow-card)",
  };

  return shell(
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", alignItems: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 700, lineHeight: 1.2, margin: 0, overflowWrap: "anywhere" }}>
          {hit.name}
        </h1>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.85rem", borderRadius: "999px",
          fontSize: "0.85rem", fontWeight: 700,
          background: active ? "#E3F3EA" : "var(--bg-deep)", color: active ? "#14532D" : "var(--text)",
        }}>
          {active && <BadgeCheck size={15} aria-hidden="true" />}
          {hit.status || "Status unknown"}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 34rem", minWidth: 0, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <section style={{ ...card, display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "baseline", justifyContent: "space-between" }}>
              <h2 className="card-heading" style={{ margin: 0, fontSize: "1.1rem" }}>Company snapshot</h2>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--secondary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Free</span>
            </div>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))", gap: "1.1rem 1.5rem" }}>
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</dt>
                  <dd style={{ margin: "0.2rem 0 0", fontSize: "1rem", fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
                </div>
              ))}
            </dl>
            <SnapshotCapture registryId={hit.registryId} provinceKey={hit.provinceKey} name={hit.name} src="company-profile" />
          </section>

          <CompanyProfileUnlock hit={hit} sections={reportSections(hit.provinceKey)} priceCents={prices[reportKey]} />
        </div>

        <aside style={{ ...card, flex: "1 1 18rem", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <h2 className="card-heading" style={{ margin: 0, fontSize: "1rem" }}>Other services for this company</h2>
          {services.map((s) => (
            <a key={s.label} href={s.href} style={{
              display: "flex", gap: "0.75rem", alignItems: "center", justifyContent: "space-between", minHeight: "2.75rem",
              padding: "0.6rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.6rem", textDecoration: "none", color: "var(--text)",
            }}>
              <span>
                <span style={{ display: "block", fontSize: "0.92rem", fontWeight: 600 }}>{s.label}</span>
                {s.price && <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)" }}>{s.price}</span>}
              </span>
              <ArrowRight size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
            </a>
          ))}
          <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
            Not the right company? Go back and pick another result.
          </p>
        </aside>
      </div>
    </>,
  );
}
