---
title: "Free Not-for-Profit Consultation | CRS"
metaDescription: "Book a free consultation to incorporate your not-for-profit anywhere in Canada. Bring your name ideas and board — we map every form, fee and filing."
slug: "/not-for-profit/book-free-consultation"
primaryKeyword: "not-for-profit incorporation consultation"
secondaryKeywords: ["nonprofit incorporation help Canada", "help registering a nonprofit", "nonprofit setup service Canada", "incorporate a charity Canada help"]
jurisdiction: "Canada"
cluster: "nfp-incorporation"
lastUpdated: "2026-07-17"
schemaSuggestions: ["Service", "FAQPage", "BreadcrumbList"]
---

# Book Your Free Not-for-Profit Consultation

Starting a not-for-profit is a series of small, unforgiving details: a name that clears the search, a board that meets your province's minimum, articles that won't block a future charity application, and filings that arrive on time every year afterward. In one free consultation, a CRS incorporation specialist walks through all of it with you — federal or provincial, in any of Canada's 14 jurisdictions.

Fill in the form below and we come to the call prepared: your three proposed names pre-screened, your board checked against your jurisdiction's requirements, and a step-by-step filing plan for your organization.

## What you get in the free consultation

A 30-minute call with a specialist who reviews your proposed names against NUANS or your provincial registry, confirms whether federal or provincial incorporation fits your mission (and how each affects future grant and charitable-registration applications), verifies your board meets the minimum director rules where you incorporate, and leaves you with a written checklist of every form, fee, and deadline — including the annual filings that keep your organization in good standing.

There is no obligation. If you only need the checklist, it's yours.

---

## Consultation booking form — field specification

> **Implementation note (not rendered):** the section below is the complete form spec for the booking page. Build as a multi-step form (Steps 1–5), validate per the rules table, and store submissions with a timestamp and the page/jurisdiction the visitor came from (hidden field `sourceSlug`). All fields are required unless marked optional.

### Step 1 — Contact information

| Field | Type | Validation |
|---|---|---|
| Full name | text | 2–100 chars |
| Email | email | RFC-valid email |
| Phone | tel | Canadian 10-digit |
| Preferred contact method | select: Email / Phone / Video call | — |
| Preferred consultation time | select: Morning / Afternoon / Evening | — |

### Step 2 — Your organization

| Field | Type | Validation / Notes |
|---|---|---|
| Jurisdiction of incorporation | select: Federal + 13 provinces/territories + "Not sure — advise me" | drives dynamic board-minimum validation (table below) |
| Intended name — option 1 | text | required, 3–120 chars |
| Intended name — option 2 | text | required (registries reject conflicts; three options avoid restarting the name search) |
| Intended name — option 3 | text | required |
| Registered office address | address block (street, city, province, postal code) | must be a physical address in the chosen jurisdiction; PO box alone not accepted in most registries |
| Nature of the not-for-profit | select: Community services / Sports & recreation / Arts & culture / Religious / Educational / Health & wellness / Environmental / Professional or trade association / Housing / Other (text) | — |
| What will the organization do? | textarea | 50–1,000 chars — becomes the draft "purposes/objects" clause |
| Who will it serve? | textarea | 30–500 chars — community served, membership base |

### Step 3 — Board and officers

Dynamic helper text shows the minimum for the chosen jurisdiction:

| Jurisdiction | Minimum directors | Minimum members/incorporators to file |
|---|---|---|
| Federal (CNCA) | 1 (3 if soliciting donations/public funds, incl. 2 non-officers) | 1 incorporator |
| Ontario (ONCA) | 3 | 1+ voting member class |
| British Columbia | 3 (ordinary) / 1 (member-funded) | 1 applicant |
| Alberta (Societies Act) | Set by bylaws | 5 members |
| Saskatchewan | 1 (membership) / 3 (charitable) | 1 incorporator |
| Manitoba | 3 | signatories to articles |
| Quebec (Companies Act Part III) | 3 | 3 founders |
| Nova Scotia | Set by by-laws | 5 subscribers |
| New Brunswick | 3 | 3 applicants (19+) |
| Prince Edward Island | 3 | 3 petitioners |
| Newfoundland and Labrador | 3 (19+) | 1 incorporator |
| Yukon | 3 (standard) / 1 (member-funded) | 3 incorporators |
| Northwest Territories | Set by by-laws | 5 persons |
| Nunavut | Set by by-laws | 5 persons |

Form collects a repeatable **Board member** block (minimum rows = jurisdiction minimum above; default 3 rows):

| Field | Type | Validation |
|---|---|---|
| Full legal name | text | required |
| Role | select: President / Secretary / Treasurer / Trustee / Director (no officer role) | at least one President, one Secretary and one Treasurer across the board list before submit; Trustee optional |
| Email | email | required |
| Phone | tel | optional |
| Residential address | address block | required — registries require director addresses |
| Age confirmation | checkbox "18 or older" (19+ for NB and NL) | required per jurisdiction |

### Step 4 — Activities and funding

| Field | Type | Notes |
|---|---|---|
| Will you accept donations? | radio: Yes / No / Not sure | if Yes: show info note that soliciting corporations federally need a 3-person board, and that donation tax receipts require separate CRA charitable registration |
| Do you plan to apply for registered charity status (CRA)? | radio: Yes / No / Not sure | flags the file for charity-ready purposes drafting |
| Planned events per year | select: 0–2 / 3–6 / 7–12 / More than 12 | helps scope licensing (raffles, liquor, gaming) and insurance advice |
| Expected annual revenue (first year) | select: Under $10k / $10k–$50k / $50k–$250k / Over $250k | drives audit/review-engagement guidance |
| Will you apply for government grants? | radio: Yes / No / Not sure | if Yes: specialist brings the matching grants list from our [grants guides](/nfp-grants/) |

### Step 5 — Review and consent

Summary of all entries, plus: consent checkbox for contact and privacy policy (PIPEDA-compliant storage note), optional "Anything else we should know?" textarea, submit button labelled **"Book my free consultation"**. Confirmation screen and email should restate the three proposed names and the board list, and include a calendar link.

---

## Frequently asked questions

### Is the consultation really free?

Yes. The 30-minute consultation, the name pre-screen, and the written filing checklist are free with no obligation. You only pay if you choose to have CRS prepare and file your incorporation, minute book, or annual returns — and we quote those fees before any work starts.

### Why do you ask for three name options?

Every registry rejects names that conflict with existing corporations or trademarks. Bringing three ranked options means that if your first choice fails the NUANS or registry search, we move to the next immediately instead of restarting the process — and you keep your filing timeline.

### What if I don't have a full board yet?

Book anyway. Requirements range from one director federally to three in most provinces, and five members or incorporators in provinces like Alberta and Nova Scotia. Your specialist will tell you exactly how many people you need, what roles to fill, and what information each person must provide.

### Do you handle both federal and provincial incorporation?

Yes — CRS files in all 14 Canadian jurisdictions: federally under the Canada Not-for-profit Corporations Act and in every province and territory under their societies and not-for-profit corporations legislation. If you're unsure which is right, that's the first question the consultation answers.

## Related guides

- [Not-for-Profit Incorporation in Canada: The Complete Guide](/not-for-profit/)
- [Grants for Not-for-Profits in Canada](/nfp-grants/)
- [Federal not-for-profit incorporation (CNCA)](/not-for-profit/federal)
