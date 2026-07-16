"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowRight, CircleCheck, ChevronDown, ExternalLink } from "lucide-react";

/**
 * Nav config. Structured so adding a new category (e.g. "Accounting & Tax")
 * later is a single object push — no JSX edits required. When a category
 * ships, drop it into NAV as a new dropdown with the section's real routes;
 * the desktop and mobile renderers pick it up automatically.
 */

type NavLink     = { kind: "link";     label: string; href: string; external?: boolean };
type NavDropdown = {
  kind:     "dropdown";
  label:    string;
  items:    Array<{ label: string; href: string; hint?: string }>;
  footer?:  { label: string; href: string };
};
type NavItem = NavLink | NavDropdown;

const NAV: NavItem[] = [
  {
    kind:  "dropdown",
    label: "Services",
    items: [
      { label: "Annual Returns",              href: "/annual-return",             hint: "Filed within 24 hours · $99 all-in" },
      { label: "Corporate Profile Reports",   href: "/profile-reports",           hint: "For FINTRAC, QuickBooks, banking · $49" },
      { label: "Incorporation",               href: "/incorporation",             hint: "Federal + all 13 provinces · from $699" },
      { label: "Certificates of Good Standing", href: "/good-standing",           hint: "Government-issued · $79 all-in" },
      { label: "Director / Officer Changes",  href: "/order/change-directors",    hint: "Update the registry after board changes" },
      { label: "Registered Address Changes",  href: "/order/change-address",      hint: "Move your registered office, filed same day" },
      { label: "Voluntary Dissolution",       href: "/order/voluntary-dissolution", hint: "Close an inactive corporation properly" },
      { label: "Corporate Revival",           href: "/order/revival",             hint: "Reinstate a dissolved corporation" },
    ],
    footer: { label: "View all services →", href: "/#services" },
  },
  {
    kind:  "dropdown",
    label: "Resources",
    items: [
      { label: "Articles",  href: "/articles",  hint: "Jurisdiction-specific how-to guides" },
      { label: "Guides",    href: "/guides",    hint: "Deep dives into corporate maintenance" },
      { label: "FAQ",       href: "/faq",       hint: "Common filing questions, answered" },
    ],
  },
  { kind: "link",     label: "Registry Search", href: "/canada-corporations-search" },
  { kind: "link",     label: "MinuteBook",      href: "https://minutebook.corporateregistryservices.ca", external: true },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Close open dropdown on click outside or Escape. */
  useEffect(() => {
    if (!openDropdown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenDropdown(null); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("[data-crs-nav]")) setOpenDropdown(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click",   onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click",   onClick);
    };
  }, [openDropdown]);

  /* Prevent the burger dropdown scroll from bleeding — lock body while open. */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenDropdown(null), 180);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

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
        .crs-hnav       { display: none; }
        .crs-hactions   { display: flex; }
        .crs-hburger    { display: inline-flex; }
        .crs-hcheck     { display: none; }
        @media (min-width: 960px) {
          .crs-hnav     { display: flex; }
          .crs-hburger  { display: none; }
          .crs-hcheck   { display: inline-flex; }
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
            <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.65rem", fontWeight: 800, color: "var(--gold)", letterSpacing: "-0.01em" }}>
              CRS
            </span>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.65rem", color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Corporate Registry Services
            </span>
          </div>
        </a>

        {/* Desktop nav */}
        <nav
          data-crs-nav
          className="crs-hnav"
          style={{ alignItems: "center", gap: "0.35rem", flex: "1 1 auto", justifyContent: "center", position: "relative" }}
        >
          {NAV.map((item) => {
            if (item.kind === "link") {
              return (
                <FlatLink
                  key={item.label}
                  href={item.href}
                  external={item.external}
                  onMouseEnter={() => setOpenDropdown(null)}
                >
                  {item.label}
                </FlatLink>
              );
            }
            const isOpen = openDropdown === item.label;
            return (
              <DesktopDropdown
                key={item.label}
                item={item}
                isOpen={isOpen}
                onOpen={() => { cancelClose(); setOpenDropdown(item.label); }}
                onScheduleClose={scheduleClose}
                onCancelClose={cancelClose}
                onClose={() => setOpenDropdown(null)}
              />
            );
          })}
        </nav>

        {/* Right-side actions */}
        <div className="crs-hactions" style={{ alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <a
            href="/order/status"
            className="crs-hcheck"
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
            onClick={() => setMobileOpen((v) => !v)}
            className="crs-hburger"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
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
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && <MobileDrawer onClose={() => setMobileOpen(false)} />}
    </header>
  );
}

/* ──────────────────────── Desktop dropdown ──────────────────────── */

function DesktopDropdown({
  item,
  isOpen,
  onOpen,
  onScheduleClose,
  onCancelClose,
  onClose,
}: {
  item:              NavDropdown;
  isOpen:            boolean;
  onOpen:            () => void;
  onScheduleClose:   () => void;
  onCancelClose:     () => void;
  onClose:           () => void;
}) {
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={onOpen}
      onMouseLeave={onScheduleClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); isOpen ? onClose() : onOpen(); }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0.55rem 0.75rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: isOpen ? "var(--gold)" : "rgba(255,255,255,0.78)",
          fontSize: "0.875rem",
          fontWeight: 500,
          fontFamily: "inherit",
          transition: "color 0.15s",
          borderRadius: "0.35rem",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--gold)")}
        onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.78)"; }}
      >
        {item.label}
        <ChevronDown
          size={13}
          style={{
            transition: "transform 0.18s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {isOpen && (
        <div
          onMouseEnter={onCancelClose}
          onMouseLeave={onScheduleClose}
          role="menu"
          style={{
            position: "absolute",
            top:  "calc(100% + 0.35rem)",
            left: 0,
            minWidth: "22rem",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.6rem",
            boxShadow: "0 12px 40px rgba(0, 61, 91, 0.18), 0 2px 8px rgba(0, 61, 91, 0.1)",
            padding: "0.5rem",
            zIndex: 60,
            animation: "crsDropIn 0.16s ease-out",
          }}
        >
          <style>{`
            @keyframes crsDropIn {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {item.items.map((entry) => (
            <a
              key={entry.href}
              href={entry.href}
              role="menuitem"
              onClick={onClose}
              style={{
                display: "block",
                padding: "0.55rem 0.75rem",
                borderRadius: "0.4rem",
                textDecoration: "none",
                color: "var(--text)",
                fontSize: "0.9rem",
                fontWeight: 600,
                lineHeight: 1.35,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-deep)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              {entry.label}
              {entry.hint && (
                <div style={{ marginTop: "0.15rem", fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  {entry.hint}
                </div>
              )}
            </a>
          ))}

          {item.footer && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "0.35rem 0" }} />
              <a
                href={item.footer.href}
                onClick={onClose}
                style={{
                  display: "block",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.78rem",
                  fontFamily: "var(--font-mono), monospace",
                  color: "var(--gold)",
                  textDecoration: "none",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                }}
              >
                {item.footer.label}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── Flat desktop link ──────────────────────── */

function FlatLink({
  href,
  children,
  external,
  onMouseEnter,
}: {
  href:          string;
  children:      React.ReactNode;
  external?:     boolean;
  onMouseEnter?: () => void;
}) {
  return (
    <a
      href={href}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--gold)";
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.78)")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.55rem 0.75rem",
        color: "rgba(255,255,255,0.78)",
        textDecoration: "none",
        fontSize: "0.875rem",
        fontWeight: 500,
        transition: "color 0.15s",
        whiteSpace: "nowrap",
        borderRadius: "0.35rem",
      }}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      {external && <ExternalLink size={11} style={{ opacity: 0.7 }} />}
    </a>
  );
}

/* ──────────────────────── Mobile drawer ──────────────────────── */

function MobileDrawer({ onClose }: { onClose: () => void }) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["Services"]));
  const toggle = (label: string) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  return (
    <div
      style={{
        borderTop: "1px solid rgba(255,255,255,0.12)",
        background: "var(--primary)",
        padding: "1rem 1.5rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        maxHeight: "calc(100vh - 4rem)",
        overflowY: "auto",
      }}
    >
      {NAV.map((item) => {
        if (item.kind === "link") {
          return (
            <a
              key={item.label}
              href={item.href}
              onClick={onClose}
              {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.65rem 0.25rem",
                color: "rgba(255,255,255,0.88)",
                textDecoration: "none",
                fontSize: "0.95rem",
                fontWeight: 600,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {item.label}
              {item.external && <ExternalLink size={13} style={{ opacity: 0.7 }} />}
            </a>
          );
        }

        const isOpen = openSections.has(item.label);
        return (
          <div key={item.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => toggle(item.label)}
              aria-expanded={isOpen}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.65rem 0.25rem",
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.88)",
                fontSize: "0.95rem",
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {item.label}
              <ChevronDown
                size={16}
                style={{
                  transition: "transform 0.2s",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  color: "var(--gold)",
                }}
              />
            </button>
            {isOpen && (
              <div style={{ paddingLeft: "0.4rem", paddingBottom: "0.5rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                {item.items.map((entry) => (
                  <a
                    key={entry.href}
                    href={entry.href}
                    onClick={onClose}
                    style={{
                      display: "block",
                      padding: "0.5rem 0.5rem",
                      color: "rgba(255,255,255,0.78)",
                      textDecoration: "none",
                      fontSize: "0.87rem",
                      fontWeight: 500,
                      borderLeft: "2px solid rgba(212,175,55,0.4)",
                    }}
                  >
                    {entry.label}
                  </a>
                ))}
                {item.footer && (
                  <a
                    href={item.footer.href}
                    onClick={onClose}
                    style={{
                      display: "block",
                      padding: "0.5rem 0.5rem",
                      color: "var(--gold)",
                      textDecoration: "none",
                      fontSize: "0.78rem",
                      fontFamily: "var(--font-mono), monospace",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {item.footer.label}
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}

      <a
        href="/order/status"
        onClick={onClose}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          marginTop: "0.75rem",
          padding: "0.65rem 0.9rem",
          borderRadius: "0.5rem",
          background: "transparent",
          color: "#FFFFFF",
          fontSize: "0.9rem",
          fontWeight: 600,
          textDecoration: "none",
          border: "1.5px solid rgba(255,255,255,0.35)",
          justifyContent: "center",
        }}
      >
        <CircleCheck size={14} />
        Check Status
      </a>
      <a
        href="/#services"
        onClick={onClose}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          marginTop: "0.35rem",
          padding: "0.75rem 0.9rem",
          borderRadius: "0.5rem",
          background: "var(--gold)",
          color: "var(--primary)",
          fontSize: "0.9rem",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Start Filing
        <ArrowRight size={14} />
      </a>
    </div>
  );
}
