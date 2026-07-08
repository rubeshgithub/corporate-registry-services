# Claude Code project notes — Corporate Registry Services (CRS)

## What this repo is

CRS (corporateregistryservices.ca) — Canadian corporate registry services: annual return filings ($99 all-in + GST), incorporations (from $699 all-in + GST), profile reports ($49), certificates of good standing ($79), corporate/NUANS searches ($49). Companion product: MinuteBook app at minutebook.corporateregistryservices.ca (separate repo).

- `web/` — **Next.js 16 App Router** site (TypeScript, Tailwind 4). This is the live website.
- `content/` — ~103 markdown files, the copy for every content page. Rendered by `web/src/app/[section]/[slug]/page.tsx` via `web/src/lib/content.ts`. Slugs = lowercased filenames; `web/src/middleware.ts` 301s TitleCase URLs to lowercase.

## Key architecture facts

- Pricing source of truth: `web/src/lib/service-config.ts`. Content pages and article widgets must stay aligned with these prices.
- Live registry lookups: `web/src/app/api/company-search/route.ts` (OrgBook BC + Canada Business Registries — ISED). Reuse for any status/name verification; don't build a second lookup path.
- Order flows: `web/src/app/order/*` deep-link into per-service Stripe Checkout via `web/src/app/api/order/*/route.ts`. `automatic_tax: { enabled: true }` + `tax_behavior: "exclusive"` on every price. Webhook at `api/order/webhook` sends SES fulfillment emails and pushes structured events to MinuteBook (`lib` conditionally, HMAC-signed).
- Admin: `/admin/analytics` (Stripe + Mongo-backed KPIs) and `/admin/outreach` (one-by-one email outreach via SES with a dedicated configuration set). Gated by a shared `ADMIN_PASSWORD` cookie via `lib/admin-auth.ts`. Never expose admin routes to search engines — every admin page must set `robots: noindex`.
- Analytics/tracking DB: MongoDB (`crs_analytics` DB — collections: `pageviews`, `clicks`, `searches`, `outreach_tokens`, `outreach_sends`, `outreach_suppression`). See `lib/mongo.ts` and `lib/outreach-mongo.ts`.
- MinuteBook app is a separate repo on a subdomain; this repo links to it but doesn't contain it.

## Conventions

- Sections: `annual-return`, `good-standing`, `incorporation`, `minute-books`, `profile-reports`, `articles`, `guides` (see `SECTIONS` in `content.ts`).
- Never change content file names/slugs — they carry Google ranking history. Change frontmatter (`title:`, add `description:`) and body only.
- Frontmatter shape: `title`, `slug` (must match filename), `section`; add `description` for meta descriptions.
- Pricing display: show CRS all-in price; never break out the government fee separately in conversion copy. Standard phrasing: "$99 all-in + GST", "from $299", etc.
- Design tokens: `web/src/app/globals.css` — brand colors as CSS custom properties (`--primary`, `--gold`, `--secondary`, plus `--radius-card`, `--shadow-card`, `--pad-card`). Cards should use `var(--radius-card)` (14px) and `var(--shadow-card)`. In-card headings use `.card-heading` (sans-serif); page-level H1s/hero titles stay on Playfair Display serif.

## Useful one-liners

```bash
cd web && npm run dev                       # dev server
cd web && npm run build                     # production build (all ~103 content pages SSG)
cd web && npx tsc --noEmit                  # type-check the whole app
grep -rn "\$[0-9]" content/ | grep -v 99    # find price mentions to check against service-config.ts
```
