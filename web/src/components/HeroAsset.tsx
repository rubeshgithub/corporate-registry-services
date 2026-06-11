"use client";

import { useEffect, useRef } from "react";

/*
  8 cards in two clear rows:
    Back row  (top,  z 1-2): Incorporation · Profile Report · Share Capital · Change of Director
    Front row (bot,  z 3-5): Minute Book   · Good Standing  · Annual Return  · Share Certificate

  CARD_META order must match JSX render order (0-7).
*/
const CARD_META = [
  { scrollRotate:  0.010, scrollY: -0.06 }, // 0 incorporation     (back-left)
  { scrollRotate: -0.008, scrollY: -0.10 }, // 1 profile report    (back centre-left)
  { scrollRotate:  0.009, scrollY: -0.07 }, // 2 share capital     (back centre-right)
  { scrollRotate: -0.011, scrollY: -0.09 }, // 3 change of dir.    (back-right)
  { scrollRotate:  0.007, scrollY: -0.12 }, // 4 minute book       (front-left)
  { scrollRotate: -0.012, scrollY: -0.08 }, // 5 good standing     (front centre-left)
  { scrollRotate:  0.006, scrollY: -0.14 }, // 6 annual return     (front centre — featured)
  { scrollRotate: -0.010, scrollY: -0.11 }, // 7 share certificate (front-right)
];

export default function HeroAsset() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const sy = window.scrollY;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const m = CARD_META[i];
          if (!m) return;
          const baseRotate = parseFloat(el.dataset.baseRotate ?? "0");
          const r = baseRotate + sy * m.scrollRotate;
          const ty = sy * m.scrollY;
          el.style.transform = `rotate(${r}deg) translateY(${ty}px)`;
        });
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const ref = (i: number) => (el: HTMLDivElement | null) => {
    cardRefs.current[i] = el;
  };

  const W = 238; // uniform card width

  return (
    <div style={{ position: "relative", width: "100%", height: "520px", overflow: "visible" }}>

      {/* ══ BACK ROW — 4 cards spread across full width, top area ══ */}

      {/* Card 0 — Certificate of Incorporation (back-left) */}
      <Card innerRef={ref(0)} baseRotate={-4} animDelay="0ms"
        style={{ top: 18, left: "0%", width: W, zIndex: 1 }}>
        <DocHeader colour="#4F46E5" icon="cert" label="Certificate of Incorporation" />
        <DocRow label="Corporation"   value="Maple Capital Holdings Inc." />
        <DocRow label="Corp. Number"  value="ON-4812765" />
        <DocRow label="Jurisdiction"  value="Ontario" />
        <DocRow label="Date of Inc."  value="March 14, 2019" />
        <DocRow label="Type"          value="Business Corporation" />
        <Stamp colour="#4F46E5" text="Issued by the Registrar · Ontario Business Corporations Act" />
      </Card>

      {/* Card 1 — Corporate Profile Report (back centre-left) */}
      <Card innerRef={ref(1)} baseRotate={3} animDelay="50ms"
        style={{ top: 5, left: "25%", width: W, zIndex: 2 }}>
        <DocHeader colour="#6366F1" icon="doc" label="Corporate Profile Report" />
        <DocRow label="Corporation"   value="7891234 Ontario Inc." />
        <DocRow label="Corp. No."     value="BC1234567" />
        <DocRow label="Jurisdiction"  value="British Columbia" />
        <DocRow label="Status"        value="Active" highlight />
        <DocRow label="Incorporated"  value="June 3, 2021" />
        <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["Directors", "Officers", "Share Structure", "Filings"].map((t) => (
            <span key={t} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--bg-deep)", color: "#64748B", fontFamily: "monospace" }}>{t}</span>
          ))}
        </div>
      </Card>

      {/* Card 2 — Share Capital Register (back centre-right) */}
      <Card innerRef={ref(2)} baseRotate={-3} animDelay="30ms"
        style={{ top: 22, left: "51%", width: W, zIndex: 1 }}>
        <DocHeader colour="#7C3AED" icon="doc" label="Share Capital Register" />
        <div style={{ marginBottom: 8, fontSize: 10, color: "#64748B", fontFamily: "monospace" }}>
          Maple Capital Holdings Inc. · Ontario
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 42px 40px", gap: "3px 6px", fontSize: 9 }}>
          <span style={{ color: "#94A3B8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}></span>
          <span style={{ color: "#94A3B8" }}>Description</span>
          <span style={{ color: "#94A3B8", textAlign: "right", fontFamily: "monospace" }}>Auth.</span>
          <span style={{ color: "#94A3B8", textAlign: "right", fontFamily: "monospace" }}>Issued</span>
        </div>
        {[
          { cls: "Class A", desc: "Common Voting",       auth: "Unlim.", issued: "500,000" },
          { cls: "Class B", desc: "Non-Voting",          auth: "Unlim.", issued: "150,000" },
          { cls: "Class C", desc: "Preferred Redeemable",auth: "100,000",issued: "—" },
        ].map(({ cls, desc, auth, issued }) => (
          <div key={cls} style={{ display: "grid", gridTemplateColumns: "36px 1fr 42px 40px", gap: "3px 6px", padding: "4px 0", borderBottom: "1px solid #F8FAFC", alignItems: "center", fontSize: 9 }}>
            <span style={{ fontFamily: "monospace", color: "#7C3AED", fontWeight: 700 }}>{cls}</span>
            <span style={{ color: "#64748B" }}>{desc}</span>
            <span style={{ color: "#94A3B8", textAlign: "right" }}>{auth}</span>
            <span style={{ fontWeight: 600, color: "#0F172A", textAlign: "right" }}>{issued}</span>
          </div>
        ))}
      </Card>

      {/* Card 3 — Change of Director (back-right) */}
      <Card innerRef={ref(3)} baseRotate={4} animDelay="80ms"
        style={{ top: 12, right: "0%", width: W, zIndex: 2 }}>
        <DocHeader colour="#DC2626" icon="doc" label="Resolution — Change of Director" />
        <div style={{ fontSize: 10, color: "#0F172A", lineHeight: 1.5, marginBottom: 8 }}>
          <strong>RESOLVED</strong> that the following changes to the board of directors be hereby approved:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ padding: "4px 8px", borderRadius: 5, background: "#FFF7F7", border: "1px solid #FCA5A5" }}>
            <span style={{ fontSize: 8, fontFamily: "monospace", color: "#DC2626", textTransform: "uppercase" }}>Resigned</span>
            <div style={{ fontSize: 10, color: "#0F172A", marginTop: 1 }}>Robert T. Chen · Apr 30, 2026</div>
          </div>
          <div style={{ padding: "4px 8px", borderRadius: 5, background: "#F0FDF4", border: "1px solid #86EFAC" }}>
            <span style={{ fontSize: 8, fontFamily: "monospace", color: "#16A34A", textTransform: "uppercase" }}>Appointed</span>
            <div style={{ fontSize: 10, color: "#0F172A", marginTop: 1 }}>Sarah L. Okonkwo · May 1, 2026</div>
          </div>
        </div>
        <Stamp colour="#DC2626" text="Board Resolution · May 1, 2026" />
      </Card>

      {/* ══ FRONT ROW — 4 cards spread across full width, bottom area ══ */}

      {/* Card 4 — Corporate Minute Book (front-left) */}
      <Card innerRef={ref(4)} baseRotate={2} animDelay="100ms"
        style={{ bottom: 10, left: "1%", width: W, zIndex: 3 }}>
        <DocHeader colour="#B45309" icon="book" label="Corporate Minute Book" />
        <div style={{ marginBottom: 8, fontSize: 10, color: "#64748B", fontFamily: "monospace" }}>
          Maple Capital Holdings Inc. · Ontario
        </div>
        {[
          { n: "01", t: "Articles of Incorporation" },
          { n: "02", t: "General By-Laws" },
          { n: "03", t: "Organizational Resolutions" },
          { n: "04", t: "Share Register" },
          { n: "05", t: "Director Register" },
          { n: "06", t: "Share Certificates" },
        ].map(({ n, t }) => (
          <div key={n} style={{ display: "flex", gap: 8, padding: "3px 0", borderBottom: "1px solid #F8FAFC", alignItems: "center" }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#B45309", width: 16, flexShrink: 0 }}>{n}</span>
            <span style={{ fontSize: 10, color: "#0F172A" }}>{t}</span>
          </div>
        ))}
      </Card>

      {/* Card 5 — Certificate of Good Standing (front centre-left) */}
      <Card innerRef={ref(5)} baseRotate={-2} animDelay="60ms"
        style={{ bottom: 5, left: "26%", width: W, zIndex: 4 }}>
        <DocHeader colour="#0D9488" icon="cert" label="Certificate of Good Standing" />
        <DocRow label="Corporation"  value="Maple Capital Holdings Inc." />
        <DocRow label="Jurisdiction" value="Ontario" />
        <DocRow label="Status"       value="Active & Compliant" highlight />
        <DocRow label="Valid as of"  value="Jun 10, 2026" />
        <Stamp colour="#0D9488" text="Ontario Business Registry · Official" />
      </Card>

      {/* Card 6 — Annual Return (front centre — most prominent, teal border) */}
      <Card innerRef={ref(6)} baseRotate={-1} animDelay="120ms"
        borderAccent="#0D9488"
        style={{ bottom: 5, left: "51%", width: W + 6, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(13,148,136,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" stroke="#0D9488" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>Annual Return Filed</div>
            <div style={{ fontSize: 9, color: "#64748B", fontFamily: "monospace" }}>Ref #AR-2026-ON-8841</div>
          </div>
        </div>
        <DocRow label="Corporation" value="Maple Capital Holdings Inc." />
        <DocRow label="Filing Year" value="2026" />
        <DocRow label="Filed with"  value="Ontario Business Registry" />
        <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 7, background: "rgba(13,148,136,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#0D9488", fontWeight: 600 }}>Status: Accepted</span>
          <span style={{ fontSize: 9, color: "#64748B", fontFamily: "monospace" }}>Jun 10, 2026 · 14:22 ET</span>
        </div>
      </Card>

      {/* Card 7 — Share Certificate (front-right) */}
      <Card innerRef={ref(7)} baseRotate={3} animDelay="90ms"
        style={{ bottom: 12, right: "0%", width: W, zIndex: 3 }}>
        <DocHeader colour="#0369A1" icon="share" label="Share Certificate" />
        <div style={{ margin: "7px 0 9px", padding: "6px 10px", borderRadius: 6, background: "#F0F9FF", border: "1px solid #BAE6FD" }}>
          <div style={{ fontSize: 9, color: "#0369A1", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>Certificate No.</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", fontFamily: "monospace" }}>SH-001</div>
        </div>
        <DocRow label="Shareholder"   value="Jane A. Smith" />
        <DocRow label="No. of Shares" value="500,000" highlight />
        <DocRow label="Share Class"   value="Class A Common" />
        <DocRow label="Issued"        value="March 14, 2019" />
        <Stamp colour="#0369A1" text="Maple Capital Holdings Inc. · Ontario" />
      </Card>

    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

type CardProps = {
  innerRef: (el: HTMLDivElement | null) => void;
  baseRotate: number;
  animDelay?: string;
  borderAccent?: string;
  style: React.CSSProperties;
  children: React.ReactNode;
};

function Card({ innerRef, baseRotate, animDelay = "0ms", borderAccent, style, children }: CardProps) {
  const animIndex = (Math.abs(baseRotate * 10) % 6);
  return (
    <div
      ref={innerRef}
      data-base-rotate={baseRotate}
      style={{
        position: "absolute",
        background: "#FFFFFF",
        border: borderAccent ? `1.5px solid ${borderAccent}` : "1px solid #D8E4F0",
        borderRadius: 12,
        padding: "16px 16px 14px",
        boxShadow: borderAccent
          ? "0 20px 48px rgba(13,148,136,0.14), 0 4px 14px rgba(0,0,0,0.07)"
          : "0 12px 40px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.04)",
        transform: `rotate(${baseRotate}deg)`,
        transition: "box-shadow 0.2s",
        animation: `cardFloat${animIndex} 0.55s ease-out both`,
        animationDelay: animDelay,
        ...style,
      }}
    >
      {children}
      <style>{`
        @keyframes cardFloat0 { from { opacity:0; transform: rotate(${baseRotate}deg) translateY(22px); } to { opacity:1; transform: rotate(${baseRotate}deg) translateY(0); } }
        @keyframes cardFloat1 { from { opacity:0; transform: rotate(${baseRotate}deg) translateY(18px); } to { opacity:1; transform: rotate(${baseRotate}deg) translateY(0); } }
        @keyframes cardFloat2 { from { opacity:0; transform: rotate(${baseRotate}deg) translateY(26px); } to { opacity:1; transform: rotate(${baseRotate}deg) translateY(0); } }
        @keyframes cardFloat3 { from { opacity:0; transform: rotate(${baseRotate}deg) translateY(20px); } to { opacity:1; transform: rotate(${baseRotate}deg) translateY(0); } }
        @keyframes cardFloat4 { from { opacity:0; transform: rotate(${baseRotate}deg) translateY(24px); } to { opacity:1; transform: rotate(${baseRotate}deg) translateY(0); } }
        @keyframes cardFloat5 { from { opacity:0; transform: rotate(${baseRotate}deg) translateY(16px); } to { opacity:1; transform: rotate(${baseRotate}deg) translateY(0); } }
      `}</style>
    </div>
  );
}

function DocHeader({ colour, icon, label }: { colour: string; icon: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, background: colour, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon === "cert" && (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
            <path d="M12 2l2.4 3.2L18 4l-.8 3.8 3.2 2.4-2 3.4 2 3.4-3.2 2.4.8 3.8-3.6-.8L12 22l-2.4-3.2L6 20l.8-3.8L3.6 14l2-3.4-2-3.4 3.2-2.4L6 4l3.6.8L12 2z" stroke="#fff" strokeWidth="1.5" fill="rgba(255,255,255,0.2)" />
            <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {icon === "doc" && (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M14 2v6h6M16 13H8M16 17H8" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        )}
        {icon === "book" && (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="#fff" strokeWidth="1.75" />
          </svg>
        )}
        {icon === "share" && (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="1.75" />
            <path d="M8 12h8M12 8v8" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", lineHeight: 1.25 }}>{label}</span>
    </div>
  );
}

function DocRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: "1px solid #F4F8FC" }}>
      <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: highlight ? 700 : 500, color: highlight ? "#0D9488" : "#0F172A", textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function Stamp({ colour, text }: { colour: string; text: string }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #F4F8FC", display: "flex", alignItems: "center", gap: 6 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M12 2l2.4 3.2L18 4l-.8 3.8 3.2 2.4-2 3.4 2 3.4-3.2 2.4.8 3.8-3.6-.8L12 22l-2.4-3.2L6 20l.8-3.8L3.6 14l2-3.4-2-3.4 3.2-2.4L6 4l3.6.8L12 2z" stroke={colour} strokeWidth="1.5" fill={`${colour}15`} />
        <path d="M9 12l2 2 4-4" stroke={colour} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 9, color: "#94A3B8", fontFamily: "monospace" }}>{text}</span>
    </div>
  );
}
