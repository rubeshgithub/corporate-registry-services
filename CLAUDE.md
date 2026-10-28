# Claude Code project notes — Corporate Registry Services (CRS)

## What this repo is

CRS (corporateregistryservices.ca) — Canadian corporate registry services: annual return filings ($129 all-in + GST), incorporations (from $699 numbered / $749 named, all-in + GST), corporate profile reports ($69), certificates of good standing ($109), NUANS name search report ($79) and pre-screen name search ($49), corporate revival ($599), minute books (priced by the corporation's age, from $289 self-serve / $389 built by CRS — see `minute-book-*` keys). Those figures are the LIVE values on 2026-09-22 (code defaults + operator overrides — see Pricing below) and are here for orientation only; never copy them into content or code. Companion product: MinuteBook app at minutebook.corporateregistryservices.ca (separate repo).

- `web/` — **Next.js 16 App Router** site (TypeScript, Tailwind 4). This is the live website.
- `content/` — ~103 markdown files, the copy for every content page. Rendered by `web/src/app/[section]/[slug]/page.tsx` via `web/src/lib/content.ts`. Slugs = lowercased filenames; `web/src/middleware.ts` 301s TitleCase URLs to lowercase.

## Key architecture facts

- Pricing source of truth: `web/src/lib/price-catalogue.ts` (code defaults per key) overlaid by operator overrides in Mongo `crs_analytics.pricing_overrides` (`{_id: key, priceCents}`, set from /admin/analytics), resolved by `getPrices()` in `web/src/lib/pricing.ts`. The code defaults are NOT the live prices — six keys are overridden as of 2026-09-22 (annual-return, profile-report, good-standing, revival, pc-profile-report, pc-revival). Content uses `{{price:key}}` tokens (expanded on the raw file before frontmatter parsing, so titles/descriptions may carry them); components take prices as props from `getPrices()` with `revalidate = 60`. `service-config.ts` holds service definitions, not prices.
- Live registry lookups: `web/src/app/api/company-search/route.ts` (OrgBook BC + Canada Business Registries — ISED). Reuse for any status/name verification; don't build a second lookup path.
- Order flows: `web/src/app/order/*` deep-link into per-service Stripe Checkout via `web/src/app/api/order/*/route.ts`. `automatic_tax: { enabled: true }` + `tax_behavior: "exclusive"` on every price. Webhook at `api/order/webhook` sends SES fulfillment emails and pushes structured events to MinuteBook (`lib` conditionally, HMAC-signed).
- Admin: `/admin/analytics` (Stripe + Mongo-backed KPIs) and `/admin/outreach` (one-by-one email outreach via SES with a dedicated configuration set). Gated by a shared `ADMIN_PASSWORD` cookie via `lib/admin-auth.ts`. Never expose admin routes to search engines — every admin page must set `robots: noindex`.
- Analytics/tracking DB: MongoDB (`crs_analytics` DB — collections: `pageviews`, `clicks`, `searches`, `outreach_tokens`, `outreach_sends`, `outreach_suppression`). See `lib/mongo.ts` and `lib/outreach-mongo.ts`.
- MinuteBook app is a separate repo on a subdomain; this repo links to it but doesn't contain it.

## Conventions

- Sections: `annual-return`, `good-standing`, `incorporation`, `minute-books`, `profile-reports`, `articles`, `guides` (see `SECTIONS` in `content.ts`).
- Never change content file names/slugs — they carry Google ranking history. Change frontmatter (`title:`, add `description:`) and body only.
- Frontmatter shape: `title`, `slug` (must match filename), `section`; add `description` for meta descriptions.
- Pricing display: show CRS all-in price; never break out the government fee separately in conversion copy. Standard phrasing: "{{price:annual-return}} all-in + GST", "from {{price:minute-book-new}}", etc. — always a `{{price:key}}` token in content, never a literal dollar figure (a literal drifts the moment an operator changes the override; twice a sync script missed lines and the SERP showed one price while Stripe charged another).
- Design tokens: `web/src/app/globals.css` — brand colors as CSS custom properties (`--primary`, `--gold`, `--secondary`, plus `--radius-card`, `--shadow-card`, `--pad-card`). Cards should use `var(--radius-card)` (14px) and `var(--shadow-card)`. In-card headings use `.card-heading` (sans-serif); page-level H1s/hero titles stay on Playfair Display serif.

## Order-form events (Oct 2026)

- `lib/track-click.ts` `trackClick(target, label)` writes non-link events to `clicks` (same cookie/endpoint as Analytics.tsx):
  `registry-access` (RegistryAccessField, label "<answer>|<province>|<service>", never the code) and `pay-blocked` (PayGate, label =
  `data-pending-kind`s still open). docu10's Order-page visitors report reads them. Labels are fixed codes only — never typed text.
- Oct 23 2026 (owner): the registry-key question no longer gates paying (removed from every flow's canPay and the wizard). RegistryAccessField
  marks itself `data-soft-pending` (+ `data-soft-term`, `data-soft-track`); PayGate catches the first click on the ACTIVE pay button
  while one is open and shows "You haven't given us the <term>. No problem — we'll contact you for it before we file." [Continue to
  payment] / Answer it now. Continue re-clicks the real button; the order's registry_access reads "NOT ANSWERED — …". Terms and
  contact details still grey the button (`data-pending`). `useAttention` uses a callback ref so a field that appears later still listens.
- Same day, later (owner: the panel under the button went unseen, ~90% of customers are on desktop): it is now a centred DIALOG
  (portal to body, backdrop, Esc/backdrop = answer). "Answer the question" (primary) scrolls to the card, which pulses red
  three times (`el.animate` in useAttention) with the red border; "Skip — contact me before filing, continue to payment" goes on.

## Extra-provincial registration (Oct 2026)

- Owner: `extra-provincial` is $799 + GST ALL-IN, any province (registry fees, NUANS for named corporations, filing) — the
  old $299 left out Alberta's ~$585 of registry fees. Optional add-on `extra-provincial-home-docs` ($99): CRS orders the
  certificate of status/existence and certified articles from the home registry (own Stripe line, metadata `home_docs`).
- Taken on /order/incorporation (type extra-provincial). /order/service/extra-provincial redirects there in the browser
  (`ExtraProvincialRedirect`): a search-result link's q/jurisdiction become `corp`/`home`; an article link's jurisdiction is
  the province to register in. Copy: we prepare the documents for a director to sign; the signer provides photo ID; filed
  within 1 business day of receiving the signed and home-jurisdiction documents.
- If `pricing_overrides` holds an `extra-provincial` row, it wins over the code default — check /admin/analytics.

## Unsubscribe page views (Oct 2026)

- /o/unsubscribe records each open of a VALID signed link in `unsubscribe_views` {email, token, userAgent, ts}
  (`lib/unsubscribe-views.ts`) so docu10 can show who opened it; scanners open these too. Not an unsubscribe — only the
  button writes `outreach_suppression`. Swept after 24 months by the retention sweep.
- Oct 23 2026 (owner): a PERSON opening /o/unsubscribe is unsubscribed at once (`lib/unsubscribe.ts` suppressEmail: suppression
  row with note "opened the unsubscribe page", companies mirror, confirmation email) and sees "You've been unsubscribed" with a
  "Keep me subscribed" undo (`/api/outreach/resubscribe`, signed; removes only a reason "unsubscribed" row). A link scanner
  (`isLinkScanner`: bot words, stale browser versions, no UA, or opened < 2 min after the outreach send) gets the old confirm
  button. If the write fails the page falls back to the button.

## Visit session on checkouts (Oct 2026)

- Every website checkout route spreads `visitMeta(req)` (`lib/visit-meta.ts`): the crs_session_id cookie as Stripe metadata
  `crs_session`, so docu10 can put a declined card or a paid order on the right Order-page visitors row.

## Annual-return due dates: never "overdue" (Oct 2026)

- No registry feed we use says when a return was last filed. Owner, Oct 2026 (LISEGA, INC. snapshot said "OVERDUE by 135 days"
  to a client who may have filed): past this year's deadline `calculateAnnualReturnDeadline` returns status "check" with
  "<year> return was due <date> · next due <date> if filed" and an explanation pointing to the Profile Report (filing history).
  Amber, not red, in InlineLookupOrder; the snapshot email shows the row as "Annual return" plus the explanation; the outreach
  annual-return template no longer prints "DAYS OVERDUE" (asks "filed yet?").

## OrgBook (BC) returns credentials, not companies (Oct 2026)

- A BC company has a "registration" credential (name, status, type, date) and a "business_number" credential (name = the BN,
  no status). Mapped one-per-credential, a search showed "841885668" as the legal name and Inactive for an Active company
  (BC0864727, STRUB SPORTS DESIGNS INC.). `searchOrgBookOnly` now groups by topic, uses the latest unrevoked registration
  credential, takes the BN from the BN credential and the name from `topic.local_name`; a BN-only hit is re-queried once by its
  BC number. Check the live JSON in a browser (the sandbox cannot reach orgbook.gov.bc.ca).
- A Business Number searched with province BC or "all" also asks OrgBook (it does index BNs), keeps only rows with exactly
  that BN, and puts them first in place of CBR's row for the same corporation (`orgBookBn` in the GET handler).

## Thank-you page visits (Oct 2026)

- Analytics.tsx sends `thanks` on /order/thanks pageviews: "paid" (Stripe's `session_id`), "quote" (the wizard's `ref`) or
  "none" (reopened from history/bookmark — no order). Stored on the pageview. Teams/SMS: "Payment completed" / "Quote request
  sent" (always, even right after an order page), and nothing for "none" (Oct 28 2026: "Visitor on /order/thanks from /terms"
  was someone who read the terms and left). Session journeys and docu10 count a sale only for "paid" (rows without the field = paid).

## Quebec annual return price (Oct 2026)

- Owner, Oct 28 2026: `annual-return-qc` $199 + GST all-in (Registraire des entreprises: $106 regular / $159 priority; filed via
  clicSÉQUR). In `annualReturnPriceKey` (BY_PROVINCE qc), the annual-return route (`isQcHit`: provinceKey qc or "Québec"), the
  order page's province prices, the FAQ, and Quebec content tokens. The wizard (StepReview + wizard-checkout) now prices annual
  returns by jurisdiction too (`annualReturnKeyForService`) — before, a BC/ON/AB/NS/QC wizard order paid the general price.
  docu10 mirrors the default in `lead-pricing.ts`.

## Google AdSense (Oct 2026)

- Owner, Oct 28 2026: site verification meta `google-adsense-account` = ca-pub-9570755789026196 via `metadata.other` in
  `app/layout.tsx` (a page that sets its own `other` would drop it), and `public/ads.txt` with the Google seller line. No ad
  script yet. When ads go in, keep them off /order/*, /admin, /o/* and checkout pages.

## Useful one-liners

```bash
cd web && npm run dev                       # dev server
cd web && npm run build                     # production build (all ~103 content pages SSG)
cd web && npx tsc --noEmit                  # type-check the whole app
grep -rn "\$[0-9]" content/ | grep -v 99    # find price mentions to check against service-config.ts
```
