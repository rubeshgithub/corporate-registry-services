"use client";

import { useState } from "react";
import { Search, Loader2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { calculateAnnualReturnDeadline } from "@/lib/annual-return-deadlines";
import { AB_ANNUAL_RETURN_NOTE } from "@/lib/annual-return-price";
import { REGISTRY_CLOSURE_NOTE } from "@/lib/sla";
import { type RegistryAccessState } from "@/lib/registry-access";
import { useOrderDraftBeacon } from "@/components/useOrderDraftBeacon";
import RegistryAccessField from "@/components/order/RegistryAccessField";
import TermsAgreement from "@/components/order/TermsAgreement";
import PayGate from "@/components/order/PayGate";
import YesNo from "@/components/order/YesNo";

/**
 * The Alberta annual return as an online form (owner, Nov 2026).
 *
 * The page-one SERP for "alberta annual returns" is walk-in registry offices
 * and the bare REG3062 PDF: the searcher's mental model is THE FORM. This
 * island mirrors the paper form's sections in order — corporation,
 * address, directors/agent, shareholders, authorized representative — fills
 * the registry fields from a search, and ends on the order summary and
 * payment. It posts the same payload as InlineLookupOrder's annual-return
 * path (/api/order/annual-return, structured `changes` + freeform `other`),
 * so fulfillment sees nothing new; the full change-notice flow stays on
 * /order/annual-return.
 */

type RegistryHit = {
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           "Active" | "Inactive";
  statusNotes:      string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
};

type ShareholderRow = { name: string; address: string; percent: string };
const emptyRow = (): ShareholderRow => ({ name: "", address: "", percent: "" });

const RELATIONSHIPS = ["Director", "Officer", "Shareholder", "Accountant / bookkeeper", "Agent of the corporation", "Other"];

const box: React.CSSProperties = {
  width: "100%", padding: "0.6rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.45rem",
  fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)", fontFamily: "inherit",
};
const label: React.CSSProperties = { display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.3rem" };
const mono: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" };

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid var(--border)", padding: "1.1rem 0" }}>
      <div style={{ display: "flex", gap: "0.65rem", alignItems: "baseline", marginBottom: "0.6rem" }}>
        <span style={{ ...mono, color: "var(--text-muted)" }}>{String(n).padStart(2, "0")}</span>
        <h3 className="card-heading" style={{ fontSize: "1rem", margin: 0 }}>{title}</h3>
      </div>
      {hint && <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.7rem", lineHeight: 1.55 }}>{hint}</p>}
      {children}
    </section>
  );
}

export default function AlbertaAnnualReturnForm({ priceCents, srcTag }: { priceCents: number; srcTag: string }) {
  const price = `$${Math.round(priceCents / 100)}`;

  /* 01 — corporation */
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [pick, setPick]           = useState<RegistryHit | null>(null);
  const [years, setYears]         = useState(1);

  /* 02 — address */
  const [addrChanged, setAddrChanged] = useState<boolean | null>(null);
  const [newAddress, setNewAddress]   = useState("");
  const [addrDate, setAddrDate]       = useState("");

  /* 03 — directors / agent */
  const [dirChanged, setDirChanged] = useState<boolean | null>(null);
  const [dirNote, setDirNote]       = useState("");

  /* 04 — shareholders */
  const [shChanged, setShChanged] = useState<boolean | null>(null);
  const [rows, setRows]           = useState<ShareholderRow[]>([emptyRow()]);

  /* 05 — authorized representative */
  const [contact, setContact]         = useState({ name: "", email: "", phone: "" });
  const [relationship, setRelationship] = useState("");
  const [registryAccess, setRegistryAccess] = useState<RegistryAccessState>({ status: "", code: "" });
  const [agreed, setAgreed]   = useState(false);
  const [paying, setPaying]   = useState(false);
  const [payErr, setPayErr]   = useState("");

  useOrderDraftBeacon({
    service:  "annual-return",
    contact,
    company:  pick ? { name: pick.name, registryId: pick.registryId, businessNumber: pick.businessNumber, jurisdiction: pick.jurisdiction, provinceKey: pick.provinceKey } : undefined,
    disabled: paying,
  });

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) { setSearchErr("Enter the corporation's name or Corporate Access Number."); return; }
    setSearchErr(""); setSearching(true);
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=ab`);
      const data = await res.json();
      const hits: RegistryHit[] = data.results ?? [];
      setResults(hits);
      if (!hits.length) setSearchErr("No Alberta corporation matched. Try the exact registered name or the Corporate Access Number.");
    } catch {
      setSearchErr("Search is temporarily unavailable. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const due   = pick ? calculateAnnualReturnDeadline(pick.registrationDate, "ab") : null;
  const year  = new Date().getFullYear();
  const total = `$${Math.round(priceCents / 100) * years}`;

  const addrErr = addrChanged && (!newAddress.trim() || !addrDate) ? "Enter the new address and the date it changed." : null;
  const canPay =
    !!pick &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim() &&
    !addrErr;

  const submit = async () => {
    if (!pick || !canPay) return;
    setPayErr(""); setPaying(true);
    const shareholders = rows.filter((r) => r.name.trim());
    const notes: string[] = [];
    if (relationship) notes.push(`Filed by: ${contact.name.trim()} (${relationship})`);
    if (dirChanged && dirNote.trim()) notes.push(`Directors / agent for service: ${dirNote.trim()}`);
    if (shChanged === false) notes.push("Shareholders: no changes since last reported");
    if (shChanged && shareholders.length) {
      notes.push("Current shareholders: " + shareholders.map((r, i) =>
        `${i + 1}) ${r.name.trim()}${r.address.trim() ? ` — ${r.address.trim()}` : ""}${r.percent.trim() ? ` — ${r.percent.trim()}% voting` : ""}`).join("; "));
    }
    try {
      const res = await fetch("/api/order/annual-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termsAccepted: agreed,
          hit: pick,
          years,
          changes: {
            directors: [], shareholders: [],
            registeredAddress: { changed: !!addrChanged, newAddress: addrChanged ? newAddress.trim() : "", effectiveDate: addrChanged ? addrDate : "" },
            recordsAddress:    { changed: false, newAddress: "", effectiveDate: "" },
            authorizedAgent:   { changed: false, newAgent: "",   effectiveDate: "" },
            other: notes.join(" | "),
          },
          contact,
          registryAccess,
          src: srcTag,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) { window.location.href = data.url; }
      else setPayErr(data.error || "Could not start payment. Please try again.");
    } catch {
      setPayErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: "1.4rem 1.5rem", margin: "1.5rem 0" }}>
      <span style={mono}>Alberta annual return · online form</span>
      <h2 className="card-heading" style={{ fontSize: "1.35rem", margin: "0.3rem 0 0.35rem" }}>File your Alberta annual return online</h2>
      <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.55, margin: "0 0 1rem" }}>
        The same sections as the government&apos;s REG3062 form, in order. Search your corporation and the registry fields fill themselves;
        confirm what changed, name who is filing, and pay — {price} + GST, government fee included, filed within 1 business day.
      </p>

      {/* 01 */}
      <Section n={1} title="Corporation" hint="Name of corporation and Corporate Access Number — pulled from the Alberta Corporate Registry.">
        {!pick ? (
          <>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                placeholder="Corporation name or Corporate Access Number" style={box} aria-label="Corporation name or Corporate Access Number" />
              <button type="button" onClick={runSearch} disabled={searching}
                style={{ padding: "0.6rem 0.9rem", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "0.45rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}>
                {searching ? <Loader2 size={16} className="crs-spin" /> : <Search size={16} />} Search
              </button>
            </div>
            {searchErr && <p style={{ color: "#B45309", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>{searchErr}</p>}
            {results.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "0.6rem 0 0", display: "grid", gap: "0.4rem" }}>
                {results.slice(0, 6).map((h) => (
                  <li key={`${h.registryId}-${h.name}`}>
                    <button type="button" onClick={() => setPick(h)}
                      style={{ width: "100%", textAlign: "left", padding: "0.6rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.45rem", background: "var(--bg)", cursor: "pointer", color: "var(--text)" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{h.name}</div>
                      <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                        CAN {h.registryId || "—"} · {h.status}{h.registrationDate ? ` · incorporated ${h.registrationDate}` : ""}{h.location ? ` · ${h.location}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: "0.45rem", padding: "0.75rem 0.9rem", background: "var(--bg)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem 1rem", fontSize: "0.84rem" }}>
              <div><span style={label}>Name of corporation</span>{pick.name}</div>
              <div><span style={label}>Corporate Access Number</span>{pick.registryId || "—"}</div>
              <div><span style={label}>Date of incorporation</span>{pick.registrationDate || "—"}</div>
              <div><span style={label}>Annual return year</span>{year}</div>
            </div>
            {due && (
              <p style={{ margin: "0.7rem 0 0", fontSize: "0.8rem", color: due.status === "check" ? "#B45309" : "var(--text-muted)", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                {due.status === "check" ? <AlertCircle size={14} style={{ marginTop: "0.15rem", flexShrink: 0 }} /> : <CheckCircle2 size={14} style={{ marginTop: "0.15rem", flexShrink: 0 }} />}
                <span>{due.label}{due.explanation ? ` ${due.explanation}` : ""}</span>
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.7rem", gap: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Years to file{" "}
                <select value={years} onChange={(e) => setYears(Number(e.target.value))} style={{ ...box, width: "auto", display: "inline-block", padding: "0.3rem 0.5rem", marginLeft: "0.3rem" }}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ marginLeft: "0.4rem" }}>(more than one if earlier returns are outstanding)</span>
              </label>
              <button type="button" onClick={() => { setPick(null); setResults([]); }} style={{ background: "none", border: "none", color: "var(--primary)", textDecoration: "underline", cursor: "pointer", fontSize: "0.8rem" }}>
                Change corporation
              </button>
            </div>
          </div>
        )}
      </Section>

      {pick && (
        <>
          {/* 02 */}
          <Section n={2} title="Registered office & records address" hint="Has the registered office or records address changed since your last filing? A change is a separate notice (REG3016) — we file it with the return and quote it before filing.">
            <YesNo name="crs-ab-addr" value={addrChanged} onChange={setAddrChanged} />
            {addrChanged && (
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.6rem" }}>
                <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="New Alberta street address, city, postal code" style={box} aria-label="New address" />
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Date of change{" "}
                  <input type="date" value={addrDate} onChange={(e) => setAddrDate(e.target.value)} style={{ ...box, width: "auto", display: "inline-block", marginLeft: "0.4rem" }} />
                </label>
                {addrErr && <p style={{ color: "#B45309", fontSize: "0.78rem", margin: 0 }}>{addrErr}</p>}
              </div>
            )}
          </Section>

          {/* 03 */}
          <Section n={3} title="Directors & agent for service" hint="Any director appointed or resigned, or a change of agent for service, since the last return? Those are reported on a Notice of Change of Directors (REG3017) due within 15 days of the change — tell us and we file it with the return.">
            <YesNo name="crs-ab-dir" value={dirChanged} onChange={setDirChanged} />
            {dirChanged && (
              <textarea value={dirNote} onChange={(e) => setDirNote(e.target.value)} rows={3} style={{ ...box, marginTop: "0.6rem", resize: "vertical" }}
                placeholder="e.g. Jane Doe resigned as director Oct 1, 2026. John Smith appointed Oct 15, 2026." aria-label="Director or agent changes" />
            )}
          </Section>

          {/* 04 */}
          <Section n={4} title="Shareholders" hint="The annual return reports your largest shareholders by percentage of issued voting shares — alberta.ca asks for the top five — current as of the last day of your anniversary month.">
            <div style={{ display: "grid", gap: "0.4rem" }}>
              {([false, true] as const).map((v) => (
                <label key={String(v)} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.86rem", cursor: "pointer" }}>
                  <input type="radio" name="crs-ab-sh" checked={shChanged === v} onChange={() => setShChanged(v)} style={{ marginTop: "0.25rem" }} />
                  <span>{v ? "Shareholders, their addresses or voting percentages have changed — list the current shareholders below" : "There are no shareholder changes since last reported"}</span>
                </label>
              ))}
            </div>
            {shChanged && (
              <div style={{ marginTop: "0.7rem", display: "grid", gap: "0.5rem" }}>
                {rows.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.6fr) 70px", gap: "0.4rem" }}>
                    <input value={r.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder={`Shareholder ${i + 1} name`} style={box} aria-label={`Shareholder ${i + 1} name`} />
                    <input value={r.address} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} placeholder="Address" style={box} aria-label={`Shareholder ${i + 1} address`} />
                    <input value={r.percent} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, percent: e.target.value.replace(/[^\d.]/g, "") } : x))} placeholder="%" inputMode="decimal" style={box} aria-label={`Shareholder ${i + 1} percentage of voting shares`} />
                  </div>
                ))}
                {rows.length < 5 && (
                  <button type="button" onClick={() => setRows([...rows, emptyRow()])} style={{ justifySelf: "start", background: "none", border: "none", color: "var(--primary)", textDecoration: "underline", cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>
                    + Add another shareholder
                  </button>
                )}
              </div>
            )}
          </Section>

          {/* 05 */}
          <Section n={5} title="Authorized representative" hint="The person filing — a director, officer, or someone the corporation has authorized (your accountant counts). The registry's confirmation goes to this email.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
              <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Full name" style={box} aria-label="Full name" autoComplete="name" />
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)} style={box} aria-label="Relationship to corporation">
                <option value="">Relationship to corporation</option>
                {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="Email address" type="email" style={box} aria-label="Email address" autoComplete="email" />
              <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="Phone number" type="tel" style={box} aria-label="Phone number" autoComplete="tel" />
            </div>
            <div style={{ marginTop: "0.8rem" }}>
              <RegistryAccessField service="annual-return" provinceKey="ab" jurisdictionLabel={pick.jurisdiction} value={registryAccess} onChange={setRegistryAccess} />
            </div>
          </Section>

          {/* Order summary + pay */}
          <section style={{ borderTop: "1px solid var(--border)", paddingTop: "1.1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", fontSize: "0.86rem", marginBottom: "0.6rem" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Alberta annual return — {pick.name}</div>
                <div style={{ color: "var(--text-muted)" }}>{years === 1 ? `${year} return` : `${years} returns`} · government fee included · filed within 1 business day</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", whiteSpace: "nowrap" }}>{total} <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text-muted)" }}>+ GST</span></div>
            </div>
            {payErr && (
              <div style={{ padding: "0.55rem 0.8rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.8rem", borderRadius: "0.4rem", marginBottom: "0.6rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} /><span>{payErr}</span>
              </div>
            )}
            <TermsAgreement checked={agreed} onChange={setAgreed} />
            <PayGate blocked={!canPay || !agreed}>
              <button type="button" onClick={submit} disabled={!canPay || paying || !agreed}
                style={{ width: "100%", marginTop: "0.85rem", padding: "0.8rem 1rem", background: canPay ? "var(--primary)" : "var(--border)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", border: "none", borderRadius: "0.5rem", cursor: canPay && !paying ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                {paying ? <><Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…</> : <>Pay {total} + GST and file <ArrowRight size={16} /></>}
              </button>
            </PayGate>
            <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "center", marginTop: "0.55rem" }}>
              Card processed securely by Stripe. {AB_ANNUAL_RETURN_NOTE} {REGISTRY_CLOSURE_NOTE}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
