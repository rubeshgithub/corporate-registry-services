"use client";

import { useEffect, useState } from "react";
import { MapPin, Phone, Globe, Mail, ArrowRight } from "lucide-react";
import type { SerializedProfileData } from "./page";

/**
 * Corporation profile page.
 *
 * Layout:
 *   1. Header banner (name + live status pill)
 *   2. Prominent CTA strip — the primary revenue path
 *   3. Two-column area (Key dates / Address / Contact  |  Filing history)
 *   4. Legal footer
 *
 * Design rules learned from the operator:
 *   - No "status difference detected" alert — the divergence is expressed
 *     implicitly by showing the live status inside Key Dates + as the top
 *     row in Filing history.
 *   - No separate "Live verification" card — the info lives in Key Dates.
 *   - CTA sits ABOVE the details so a decided visitor doesn't scroll past it.
 */

export default function ProfileView({ data }: { data: SerializedProfileData }) {
  const { company, events, live } = data;

  const livePresent = !!live?.found;
  const liveStatus  = live?.found ? (live.status || "unknown") : (live ? "not_found" : "unknown");
  const dbStatus    = company.status.derived;
  const currentStatus = livePresent ? liveStatus : dbStatus;

  const cta = ctaConfig(liveStatus, dbStatus, company);

  /* Compliance signal detection — CBR sometimes puts actionable text in
     status.Notes that isn't captured in status.State. E.g., "Active -
     Dissolution Pending (Non-compliance)" means the corp is technically
     Active but the registrar has flagged an outstanding annual return.
     Surface those as a banner regardless of the top-line status. */
  const notes = (live?.statusNotes ?? "").toLowerCase();
  const complianceAlert =
    notes.includes("pending") || notes.includes("non-compliance") || notes.includes("fail file")
      ? { message: live?.statusNotes ?? "", severity: "amber" }
      : null;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      {complianceAlert && (
        <div style={{
          background: "rgba(180,83,9,0.08)",
          border: "1.5px solid #B45309",
          borderLeft: "5px solid #B45309",
          borderRadius: "var(--radius-card)",
          padding: "1rem 1.25rem",
          marginBottom: "1rem",
          display: "flex", gap: "0.75rem", alignItems: "flex-start",
        }}>
          <span className="crs-pulse-alert" style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#B45309", marginTop: "0.25rem", flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div className="card-heading" style={{ fontSize: "0.98rem", color: "#B45309", marginBottom: "0.25rem" }}>
              Compliance signal from live registry
            </div>
            <p style={{ fontSize: "0.87rem", color: "var(--text)", margin: 0, lineHeight: 1.55 }}>
              Alberta registrar note: <em>&ldquo;{complianceAlert.message}&rdquo;</em>. This typically means an annual return is outstanding — file now to avoid strike-off.
            </p>
          </div>
          <a href={`/order/annual-return?q=${encodeURIComponent(company.name)}&jurisdiction=ab${company._id.startsWith("name:") ? "" : `&registryId=${company._id}`}&src=profile-compliance-${company._id}`} style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            padding: "0.6rem 1rem",
            background: "#B45309", color: "#fff",
            fontSize: "0.85rem", fontWeight: 700,
            borderRadius: "0.4rem", textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            File Now
            <ArrowRight size={13} />
          </a>
        </div>
      )}

      {/* Header banner */}
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderLeft: `5px solid ${cta.accentColor}`,
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "1.5rem 1.75rem",
        marginBottom: "1rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 400px" }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
              Alberta Corporation
            </div>
            <h1 style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 700,
              color: "var(--text)",
              margin: "0 0 0.35rem",
              lineHeight: 1.25,
            }}>
              {company.name}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.85rem", fontSize: "0.82rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
              {!company._id.startsWith("name:") && <span>Corp No. {company._id}</span>}
              {company.entityType && <span>{company.entityType}</span>}
              {company.address?.city && <span>{company.address.city}, AB</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
            <StatusPill label={currentStatus || "unknown"} bold big />
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              {live ? (
                <>
                  <LiveDot status={liveStatus} />
                  <span>live · fetched <RelTime iso={live.fetchedAt} /></span>
                </>
              ) : (
                <span>DB only</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA strip — moved up, more prominent */}
      <ProminentCta cta={cta} />

      {/* Main two-column area */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 340px) minmax(0, 1fr)", gap: "1rem", alignItems: "start", marginTop: "1rem" }}>
        {/* Left column — key info + contact */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <InfoCard title="Key dates">
            <KV k="Incorporated"        v={fmtDate(firstEventDate(events)) || "—"} />
            <KV k="Latest gazette event" v={fmtDate(company.status.lastEventDate) || "—"} />
            <KV k="Records as of"       v={fmtDate(company.status.lastIssueDate) || "—"} mono />
            {live && (
              <div style={{
                marginTop: "0.55rem", paddingTop: "0.65rem",
                borderTop: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.8rem", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    <LiveDot status={liveStatus} />
                    Live registry ({fmtDate(live.fetchedAt)})
                  </span>
                  <StatusPill label={liveStatus} />
                </div>
                {live.statusNotes && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem", fontStyle: "italic" }}>
                    {live.statusNotes}
                  </div>
                )}
                <InlineLiveCta liveStatus={liveStatus} company={company} />
              </div>
            )}
          </InfoCard>

          {company.address && (
            <InfoCard title="Registered address" icon={<MapPin size={14} />}>
              <p style={{ fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.55, margin: 0 }}>
                {company.address.full}
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
                {company.address.city}, AB &nbsp; {company.address.postal}
              </p>
            </InfoCard>
          )}

          <InfoCard title="Contact" icon={<Phone size={14} />}>
            {!company.contact || company.contact.enrichStatus === "not_found" ? (
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>
                No public contact info found via web search.
              </p>
            ) : company.contact.enrichStatus === "skip_numbered" ? (
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>
                Numbered corporations rarely have public contact info.
              </p>
            ) : (
              <>
                {company.contact.website && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Globe size={13} style={{ color: "var(--text-muted)" }} />
                    <a href={company.contact.website} target="_blank" rel="noreferrer" style={{ color: "var(--secondary)", textDecoration: "none" }}>
                      {new URL(company.contact.website.startsWith("http") ? company.contact.website : `https://${company.contact.website}`).host}
                    </a>
                  </div>
                )}
                {company.contact.phone && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Phone size={13} style={{ color: "var(--text-muted)" }} />
                    <a href={`tel:${company.contact.phone.replace(/[^\d+]/g, "")}`} style={{ color: "var(--text)", textDecoration: "none" }}>
                      {company.contact.phone}
                    </a>
                  </div>
                )}
                {company.contact.email && (
                  <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Mail size={13} style={{ color: "var(--text-muted)" }} />
                    <a href={`mailto:${company.contact.email}`} style={{ color: "var(--secondary)", textDecoration: "none" }}>
                      {company.contact.email}
                    </a>
                  </div>
                )}
                {company.contact.enrichedAt && (
                  <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: "0.5rem 0 0", fontStyle: "italic" }}>
                    Enriched <RelTime iso={company.contact.enrichedAt} /> via public web search
                    {company.contact.emailSourceUrl ? " · source URL on file" : ""}
                  </p>
                )}
              </>
            )}
          </InfoCard>

          {company.otherData && (
            <InfoCard title="Other Data" icon={<MapPin size={14} />}>
              {company.otherData.name && (
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)", marginBottom: "0.5rem" }}>
                  {company.otherData.name}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 0.85rem", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.55 }}>
                {company.otherData.address && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}>Location</span>
                    <span>
                      {company.otherData.address}
                      {(company.otherData.city || company.otherData.region || company.otherData.postalCode) && (
                        <><br />{[company.otherData.city, company.otherData.region, company.otherData.postalCode].filter(Boolean).join(", ")}</>
                      )}
                      {company.otherData.country && <><br />{company.otherData.country}</>}
                    </span>
                  </>
                )}
                {company.otherData.industry && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}>Industry</span>
                    <span>{company.otherData.industry}</span>
                  </>
                )}
                {company.otherData.locationType && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}>Type</span>
                    <span>{company.otherData.locationType}</span>
                  </>
                )}
              </div>
              <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: "0.75rem 0 0", fontStyle: "italic" }}>
                Sourced from public business directories.
              </p>
            </InfoCard>
          )}
        </div>

        {/* Right column — history timeline */}
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "1.5rem 1.75rem",
        }}>
          <div className="card-heading" style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>
            Filing history · {events.length + (live ? 1 : 0)} events{live ? " (incl. today's live check)" : " from Alberta Gazette"}
          </div>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, position: "relative" }}>
            {/* Live status: pinned as the newest row so the visitor always sees "as of today" first */}
            {live && (
              <li style={{
                position: "relative",
                padding: "0.5rem 0 0.85rem 1.5rem",
                borderLeft: `2px solid ${liveDotColor(liveStatus)}`,
                marginLeft: "0.5rem",
              }}>
                <span
                  className={livePulseClass(liveStatus)}
                  style={{
                    position: "absolute", left: "-7px", top: "0.75rem",
                    width: 12, height: 12, borderRadius: "50%",
                    background: liveDotColor(liveStatus),
                    border: "2px solid var(--card)",
                  }}
                />
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", color: liveDotColor(liveStatus), marginBottom: "0.15rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {fmtDate(live.fetchedAt)} · live from Canada Business Registries
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)" }}>
                  Status: {live.status || "Not indexed"}
                  {live.statusNotes && (
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      {" "}— {live.statusNotes}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem", fontStyle: "italic" }}>
                  Cross-checked directly against the government registry.
                </div>
              </li>
            )}
            {events.length === 0 ? (
              <li style={{ padding: "0.5rem 0 0 1.5rem", color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.85rem" }}>
                No prior gazette events on file.
              </li>
            ) : (
              [...events].reverse().map((e, i) => (
                <li key={`${e.eventDate}-${e.event}-${i}`} style={{
                  position: "relative",
                  padding: "0.5rem 0 0.85rem 1.5rem",
                  borderLeft: "2px solid var(--border)",
                  marginLeft: "0.5rem",
                }}>
                  <span style={{
                    position: "absolute", left: "-6px", top: "0.85rem",
                    width: 10, height: 10, borderRadius: "50%",
                    background: eventDotColor(e.event),
                    border: "2px solid var(--card)",
                  }} />
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.15rem" }}>
                    {fmtDate(e.eventDate)}{e.issueDate ? ` · gazette ${fmtDate(e.issueDate)}` : ""}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>
                    {e.event}
                    {e.oldName && (
                      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                        {" "}(was: {e.oldName})
                      </span>
                    )}
                  </div>
                  {(e.address || e.city) && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {e.address || `${e.city}${e.postal ? ` ${e.postal}` : ""}`}
                    </div>
                  )}
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem", fontFamily: "var(--font-mono), monospace" }}>
                    {e.section} · {e.issue}
                  </div>
                </li>
              ))
            )}
          </ol>
        </div>
      </div>

      {/* Legal footer */}
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "1rem", textAlign: "center", lineHeight: 1.5 }}>
        This is an independent index of Alberta Registrar&apos;s Periodical notices, cross-checked live with the Canada Business Registries.
        CRS is not affiliated with the Alberta Corporate Registry. For certified records, order a Corporate Profile Report.
      </p>
    </div>
  );
}

/* ═══════════════════════════ Prominent CTA ═══════════════════════════ */

function ProminentCta({ cta }: { cta: CtaConfig }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${hexTintFrom(cta.accentColor)} 0%, var(--card) 100%)`,
      border: `1.5px solid ${cta.accentColor}`,
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      padding: "1.75rem 2rem",
      marginBottom: "1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          <div className="card-heading" style={{ fontSize: "1.35rem", marginBottom: "0.5rem", color: cta.accentColor }}>
            {cta.title}
          </div>
          {cta.subtitle && (
            <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.55, maxWidth: "58ch" }}>
              {cta.subtitle}
            </p>
          )}
        </div>
        {cta.primary && (
          <a href={cta.primary.href} style={{
            display: "inline-flex", alignItems: "center", gap: "0.45rem",
            padding: "1rem 1.75rem",
            background: cta.accentColor, color: "#fff",
            fontSize: "1.02rem", fontWeight: 700,
            borderRadius: "0.6rem", textDecoration: "none",
            boxShadow: `0 4px 12px ${hexAlpha(cta.accentColor, 0.35)}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {cta.primary.label}
            <ArrowRight size={16} />
          </a>
        )}
      </div>
      {cta.secondary.length > 0 && (
        <div style={{ marginTop: "1.1rem", paddingTop: "1rem", borderTop: `1px dashed ${hexAlpha(cta.accentColor, 0.3)}`, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "center", marginRight: "0.35rem" }}>
            Or:
          </span>
          {cta.secondary.map((c) => (
            <a key={c.label} href={c.href} style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              padding: "0.55rem 0.9rem",
              background: "var(--card)", color: "var(--text)",
              border: "1px solid var(--border)",
              fontSize: "0.83rem", fontWeight: 600,
              borderRadius: "0.4rem", textDecoration: "none",
            }}>
              {c.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ CTA config ═══════════════════════════ */

type CtaConfig = {
  accentColor: string;
  title:       string;
  subtitle?:   string;
  primary?:    { label: string; href: string };
  secondary:   Array<{ label: string; href: string }>;
};

function ctaConfig(liveStatus: string, dbStatus: string, company: SerializedProfileData["company"]): CtaConfig {
  const s = normalize(liveStatus || dbStatus);
  const dbNorm = normalize(dbStatus);
  const src = `profile-${company._id}`;
  const q = (path: string) => `${path}?q=${encodeURIComponent(company.name)}&jurisdiction=ab${company._id.startsWith("name:") ? "" : `&registryId=${company._id}`}&src=${src}`;

  /* Liable: highest urgency */
  if (s.includes("liable") || s.includes("pending")) {
    return {
      accentColor: "#B45309",
      title:       "⚠ Urgent — file this Annual Return now",
      subtitle:    "This corporation is on Alberta's Liable-for-Dissolution list. If not filed within 4 months of the gazetted date, the registrar will strike it off — freezing bank accounts, financing, and contracts.",
      primary:     { label: "File Annual Return — $99 + gst", href: q("/order/annual-return") },
      secondary: [
        { label: "Certificate of Good Standing — $79", href: q("/order/good-standing") },
      ],
    };
  }

  /* Struck / Dissolved: revival path */
  if (s.includes("struck") || s.includes("dissolved") || s.includes("diss")) {
    /* Divergent case: DB says struck, live says active → user already revived */
    if (normalize(liveStatus) === "active" && dbNorm !== normalize(liveStatus)) {
      return {
        accentColor: "var(--secondary)",
        title:       "Great news — this corporation is active",
        subtitle:    "Our historical records showed a strike-off, but the live Alberta registrar confirms this corporation is currently Active. If you need proof of standing for financing, contracts, or a bid — we can pull an official Corporate Profile Report and email the PDF within an hour.",
        primary:     { label: "Order Profile Report — $49", href: q("/order/profile-report") },
        secondary: [
          { label: "Certificate of Good Standing — $79", href: q("/order/good-standing") },
        ],
      };
    }
    return {
      accentColor: "#991B1B",
      title:       "Bring this corporation back to active status",
      subtitle:    "This corporation has been struck from the Alberta register. We file a revival + any missed annual returns as one package. Custom quote returned within one business hour.",
      primary:     { label: "Start Corporate Revival", href: q("/order/revival") },
      secondary: [
        { label: "Order Profile Report — $49", href: q("/order/profile-report") },
      ],
    };
  }

  /* Active: annual return + everything else */
  if (s === "active" || s === "incorporated" || s === "registered") {
    return {
      accentColor: "var(--secondary)",
      title:       "File your Annual Return in minutes",
      subtitle:    "This corporation is active. Let CRS file your annual return with the Alberta registrar — $99 + gst, filed within 24 hours. We pre-fill your details from the registry so you can review and submit in about 2 minutes.",
      primary:     { label: "File Annual Return — $99 + gst", href: q("/order/annual-return") },
      secondary: [
        { label: "Profile Report — $49",             href: q("/order/profile-report") },
        { label: "Certificate of Good Standing — $79", href: q("/order/good-standing") },
        { label: "Change Directors",                 href: q("/order/change-directors") },
        { label: "Change Registered Address",        href: q("/order/change-address") },
        { label: "Voluntary Dissolution",            href: q("/order/voluntary-dissolution") },
      ],
    };
  }

  /* Fallback */
  return {
    accentColor: "var(--gold)",
    title:       "Services available for this corporation",
    primary:     { label: "File Annual Return — $99 + gst", href: q("/order/annual-return") },
    secondary: [
      { label: "Order Profile Report — $49", href: q("/order/profile-report") },
    ],
  };
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

/* ═══════════════════════════ Small components ═══════════════════════════ */

/** Elapsed-time span that hydrates on the client only — avoids Date.now()
 *  mismatches between server render and client hydration. First paint shows
 *  the ISO date (stable across environments); the client swaps in "3 min ago"
 *  on mount. Also refreshes every 30 seconds so long-open tabs stay accurate. */
function RelTime({ iso }: { iso: string }) {
  const [rendered, setRendered] = useState<string>(fmtDate(iso));
  useEffect(() => {
    const update = () => setRendered(computeRelTime(iso));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [iso]);
  return <span suppressHydrationWarning>{rendered}</span>;
}

/** Small pulsing dot next to "live" status text. Colour/intensity keyed to
 *  status so Active = teal calm, Liable = amber urgent, Struck = red alarm. */
function LiveDot({ status, size = 8 }: { status: string; size?: number }) {
  const color = liveDotColor(status);
  return (
    <span
      className={livePulseClass(status)}
      style={{
        display: "inline-block",
        width: size, height: size, borderRadius: "50%",
        background: color, flexShrink: 0,
      }}
      aria-hidden="true"
    />
  );
}

/** Inline CTA rendered inside the Key Dates card when the live status is
 *  non-Active. Small red/amber link takes the visitor straight into the
 *  right order flow without needing to scroll back up to the main CTA card. */
function InlineLiveCta({ liveStatus, company }: { liveStatus: string; company: SerializedProfileData["company"] }) {
  const s = normalize(liveStatus);
  const src = `profile-inline-${company._id}`;
  const q = (path: string) => `${path}?q=${encodeURIComponent(company.name)}&jurisdiction=ab${company._id.startsWith("name:") ? "" : `&registryId=${company._id}`}&src=${src}`;

  let label = "", href = "", color = "";
  if (s.includes("liable") || s.includes("pending")) {
    label = "File Annual Return now";
    href  = q("/order/annual-return");
    color = "#B45309";
  } else if (s.includes("struck") || s.includes("dissolved") || s.includes("diss")) {
    label = "Restore this corporation";
    href  = q("/order/revival");
    color = "#991B1B";
  } else {
    return null;   // Active — no inline CTA needed
  }

  return (
    <a
      href={href}
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
        marginTop: "0.55rem",
        padding: "0.35rem 0.7rem",
        background: color, color: "#fff",
        borderRadius: "0.4rem",
        fontSize: "0.75rem", fontWeight: 700,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <ArrowRight size={12} />
    </a>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      padding: "1.25rem",
    }}>
      <div className="card-heading" style={{ fontSize: "0.95rem", marginBottom: "0.65rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text)" }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.82rem", padding: "0.2rem 0", borderBottom: "1px dotted var(--border)" }}>
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span style={{ color: "var(--text)", fontFamily: mono ? "var(--font-mono), monospace" : "inherit" }}>{v}</span>
    </div>
  );
}

function StatusPill({ label, bold = false, big = false }: { label: string; bold?: boolean; big?: boolean }) {
  const s = normalize(label);
  const color =
    s === "active" || s === "incorporated" || s === "registered" ? "var(--secondary)" :
    s.includes("liable") ? "#B45309" :
    s.includes("struck") || s.includes("dissolved") || s.includes("diss") ? "#991B1B" :
    "var(--text-muted)";
  const bg =
    s === "active" || s === "incorporated" || s === "registered" ? "rgba(42,125,143,0.10)" :
    s.includes("liable") ? "rgba(180,83,9,0.10)" :
    s.includes("struck") || s.includes("dissolved") || s.includes("diss") ? "rgba(153,27,27,0.10)" :
    "rgba(0,0,0,0.05)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.35rem",
      padding: big ? "0.35rem 0.85rem" : "0.15rem 0.6rem",
      borderRadius: "9999px",
      background: bg, color, border: `1px solid ${color}`,
      fontFamily: "var(--font-mono), monospace",
      fontSize: big ? "0.78rem" : "0.7rem",
      fontWeight: bold ? 700 : 600,
      textTransform: "uppercase", letterSpacing: "0.05em",
      whiteSpace: "nowrap",
    }}>
      {label || "unknown"}
    </span>
  );
}

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Elapsed-time formatter — called only from the RelTime client component
 *  (never during SSR) to avoid hydration mismatches when the "min ago"
 *  boundary rolls over between server render and client hydration. */
function computeRelTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)} hr ago`;
  if (diffSec < 30 * 86400) return `${Math.round(diffSec / 86400)} day${Math.round(diffSec / 86400) === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function livePulseClass(status: string): string {
  const s = normalize(status);
  if (s === "active" || s === "incorporated" || s === "registered") return "crs-pulse-live";
  if (s.includes("liable")) return "crs-pulse-alert";
  if (s.includes("struck") || s.includes("dissolved") || s.includes("diss")) return "crs-pulse-red";
  return "";
}

function firstEventDate(events: SerializedProfileData["events"]): string | null {
  const dated = events.filter((e) => e.eventDate).sort((a, b) => (a.eventDate! < b.eventDate! ? -1 : 1));
  return dated[0]?.eventDate ?? null;
}

function eventDotColor(event: string): string {
  const s = event.toLowerCase();
  if (s.includes("incorp") || s.includes("register")) return "var(--secondary)";
  if (s.includes("revived") || s.includes("reinstate")) return "var(--gold)";
  if (s.includes("liable"))   return "#B45309";
  if (s.includes("dissolved") || s.includes("struck")) return "#991B1B";
  if (s.includes("amalgam"))  return "var(--primary)";
  return "var(--text-muted)";
}

function liveDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "active" || s === "incorporated" || s === "registered") return "var(--secondary)";
  if (s.includes("liable")) return "#B45309";
  if (s.includes("struck") || s.includes("dissolved")) return "#991B1B";
  return "var(--text-muted)";
}

/** Slightly tinted background matching an accent color — used to give the
 *  CTA card a subtle gradient. Falls back cleanly for var(--*) accents. */
function hexTintFrom(color: string): string {
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.06)`;
  }
  return "rgba(42,125,143,0.06)";   // teal-tinted fallback for var(--secondary)
}
function hexAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(42,125,143,${alpha})`;
}
