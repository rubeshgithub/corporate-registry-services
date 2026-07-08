"use client";

import { useState } from "react";
import { Menu, X, ArrowRight, CircleCheck } from "lucide-react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        borderBottom: "none",
        background: "var(--primary)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <style>{`
        .header-nav      { display: none; }
        .header-actions  { display: flex; }
        .header-burger   { display: flex; }
        .header-check    { display: none; }
        @media (min-width: 768px) {
          .header-nav    { display: flex; }
          .header-burger { display: none; }
          .header-check  { display: inline-flex; }
        }
      `}</style>
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.5rem",
          height: "4rem",
        }}
      >
        {/* Logo */}
        <a href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.65rem",
                fontWeight: 800,
                color: "var(--gold)",
                letterSpacing: "-0.01em",
              }}
            >
              CRS
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.65rem",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Corporate Registry Services
            </span>
          </div>
        </a>

        {/* Desktop nav */}
        <nav className="header-nav" style={{ alignItems: "center", gap: "1.75rem", flex: "1 1 auto", justifyContent: "center" }}>
          <NavLink href="/#why">Why CRS</NavLink>
          <NavLink href="/#services">Services</NavLink>
          <NavLink href="/canada-corporations-search">Registry Search</NavLink>
          <NavLink href="/guides">Guides</NavLink>
          <NavLink href="/articles">Articles</NavLink>
          <NavLink href="https://minutebook.corporateregistryservices.ca">MinuteBook</NavLink>
          <NavLink href="/#contact">Contact</NavLink>
        </nav>

        {/* Right-side actions */}
        <div className="header-actions" style={{ alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <a
            href="/order/status"
            className="header-check"
            style={{
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.45rem 0.85rem",
              borderRadius: "0.5rem",
              background: "transparent",
              color: "#FFFFFF",
              fontSize: "0.82rem",
              fontWeight: 600,
              textDecoration: "none",
              border: "1.5px solid rgba(255,255,255,0.35)",
              whiteSpace: "nowrap",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--gold)";
              (e.currentTarget as HTMLElement).style.color = "var(--gold)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.35)";
              (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
            }}
          >
            <CircleCheck size={14} />
            Check Status
          </a>
          <a
            href="/#services"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 0.95rem",
              borderRadius: "0.5rem",
              background: "var(--gold)",
              color: "var(--primary)",
              fontSize: "0.82rem",
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "filter 0.15s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.filter = "brightness(1.08)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.filter = "none")}
          >
            Start Filing
            <ArrowRight size={14} />
          </a>

          {/* Mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="header-burger"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#FFFFFF",
              alignItems: "center",
              padding: "0.35rem",
              marginLeft: "0.15rem",
            }}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.12)",
            background: "var(--primary)",
            padding: "1rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <NavLink href="/#why" onClick={() => setMenuOpen(false)}>Why CRS</NavLink>
          <NavLink href="/#services" onClick={() => setMenuOpen(false)}>Services</NavLink>
          <NavLink href="/canada-corporations-search" onClick={() => setMenuOpen(false)}>Registry Search</NavLink>
          <NavLink href="/guides" onClick={() => setMenuOpen(false)}>Guides</NavLink>
          <NavLink href="/articles" onClick={() => setMenuOpen(false)}>Articles</NavLink>
          <NavLink href="https://minutebook.corporateregistryservices.ca" onClick={() => setMenuOpen(false)}>MinuteBook</NavLink>
          <NavLink href="/#contact" onClick={() => setMenuOpen(false)}>Contact</NavLink>
          <a
            href="/order/status"
            onClick={() => setMenuOpen(false)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              marginTop: "0.5rem",
              padding: "0.55rem 0.9rem",
              borderRadius: "0.5rem",
              background: "transparent",
              color: "#FFFFFF",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              border: "1.5px solid rgba(255,255,255,0.35)",
              justifyContent: "center",
            }}
          >
            <CircleCheck size={14} />
            Check Status
          </a>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        color: "rgba(255,255,255,0.78)",
        textDecoration: "none",
        fontSize: "0.875rem",
        fontWeight: 500,
        transition: "color 0.15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--gold)")}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.78)")}
    >
      {children}
    </a>
  );
}
