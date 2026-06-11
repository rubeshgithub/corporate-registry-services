"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

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
        .header-nav    { display: none; }
        .header-burger { display: flex; }
        @media (min-width: 768px) {
          .header-nav    { display: flex; }
          .header-burger { display: none; }
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
          height: "3.75rem",
        }}
      >
        {/* Logo */}
        <a href="/" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.3rem",
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
                fontSize: "0.58rem",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Corporate Registry Services
            </span>
          </div>
        </a>

        {/* Desktop nav */}
        <nav className="header-nav" style={{ alignItems: "center", gap: "2rem" }}>
          <NavLink href="#why">Why CRS</NavLink>
          <NavLink href="#services">Services</NavLink>
          <NavLink href="/company-search">Registry Search</NavLink>
          <NavLink href="/guides">Guides</NavLink>
          <NavLink href="/articles">Articles</NavLink>
          <NavLink href="#contact">Contact Us</NavLink>
        </nav>

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
          }}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
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
          <NavLink href="#why" onClick={() => setMenuOpen(false)}>Why CRS</NavLink>
          <NavLink href="#services" onClick={() => setMenuOpen(false)}>Services</NavLink>
          <NavLink href="/company-search" onClick={() => setMenuOpen(false)}>Registry Search</NavLink>
          <NavLink href="/guides" onClick={() => setMenuOpen(false)}>Guides</NavLink>
          <NavLink href="/articles" onClick={() => setMenuOpen(false)}>Articles</NavLink>
          <NavLink href="#contact" onClick={() => setMenuOpen(false)}>Contact Us</NavLink>
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
        color: "rgba(255,255,255,0.75)",
        textDecoration: "none",
        fontSize: "0.875rem",
        fontWeight: 500,
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--gold)")}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.75)")}
    >
      {children}
    </a>
  );
}
