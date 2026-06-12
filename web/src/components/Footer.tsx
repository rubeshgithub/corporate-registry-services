export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--card)",
        marginTop: "auto",
        padding: "2rem 1.5rem",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontWeight: 800,
                fontSize: "1.1rem",
                color: "var(--gold)",
              }}
            >
              CRS
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.62rem",
                color: "var(--text-muted)",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              Corporate Registry Services
            </span>
          </div>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: "0.375rem",
            }}
          >
            Canadian corporate registry services — all 13 jurisdictions.
          </p>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/guides">Guides</FooterLink>
          <FooterLink href="/articles">Articles</FooterLink>
          <FooterLink href="/contact">Contact</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
          <FooterLink href="/disclaimer">Disclaimer</FooterLink>
        </div>
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            width: "100%",
            marginTop: "0.5rem",
          }}
        >
          © {new Date().getFullYear()} CRS — Corporate Registry Services. All rights reserved. Not a law firm. Documents prepared for self-represented clients.
        </p>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        fontSize: "0.8rem",
        color: "var(--text-muted)",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}
