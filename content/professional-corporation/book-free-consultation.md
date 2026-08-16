---
title: "Free Professional Corporation Consultation | CRS"
metaDescription: "Book a free consultation to set up your professional corporation — registry filing plus regulator permit, naming, shareholders and renewals handled."
slug: "/professional-corporation/book-free-consultation"
primaryKeyword: "professional corporation consultation"
secondaryKeywords: ["professional incorporation help", "set up medical corporation help", "certificate of authorization application help", "incorporate my practice"]
jurisdiction: "Canada"
cluster: "professional-corporation"
lastUpdated: "2026-08-08"
schemaSuggestions: ["Service", "FAQPage", "BreadcrumbList"]
---

# Book Your Free Professional Corporation Consultation

Setting up a professional corporation means satisfying two gatekeepers whose rules don't overlap neatly: the corporate registry and your professional regulator. The name must match the regulator's exact format, the articles must carry profession-specific restrictions, shares must sit with the right people, and in several provinces the regulator must approve documents *before* the registry will take them. In one free consultation, a Corporate Registry Services specialist maps the correct sequence for your profession and province and quotes the full two-layer cost — registry, regulator, and renewals — before any work starts.

## What you get in the free consultation

A 30-minute call with a specialist who confirms your profession's incorporation route in your province, pre-checks your proposed corporate name against the regulator's naming rules, reviews who you plan to include as shareholders against your regulator's restrictions (including whether family non-voting shares are available to your profession), and leaves you with a written plan: every form, fee, filing, and both annual renewal dates. No obligation.

---

## Consultation booking form — field specification

> **Implementation note (not rendered):** multi-step form (Steps 1–4). Reuse the component patterns from the NFP consultation form. Validation per tables below; hidden `sourceSlug` field captures the referring page. All fields required unless marked optional.

### Step 1 — Contact information

| Field | Type | Validation |
|---|---|---|
| Full name | text | 2–100 chars |
| Email | email | RFC-valid |
| Phone | tel | Canadian 10-digit |
| Preferred contact method | select: Email / Phone / Video call | — |
| Preferred consultation time | select: Morning / Afternoon / Evening | — |

### Step 2 — Your profession and regulator

| Field | Type | Notes |
|---|---|---|
| Province of practice | select: AB / ON / BC / Other (text) | drives regulator list and naming helper |
| Profession | select: Physician / Dentist / Lawyer / CPA / Pharmacist / Chiropractor / Optometrist / Veterinarian / Other (text) | — |
| Regulator | auto-suggested from province+profession (e.g. CPSA, CPSO, RCDSO, OCP, LSO, Law Society of Alberta, CPA Ontario, CPA Alberta, CPSBC), editable | — |
| Licence / registration number | text | optional at booking; required before filing |
| Current practice structure | select: Sole practitioner / Associate / Group practice / New graduate / Relocating to this province | — |

### Step 3 — The corporation you want

| Field | Type | Notes |
|---|---|---|
| Proposed corporate name | text | helper text shows the regulator's format, e.g. "[Surname] Medicine Professional Corporation"; live-validate suffix "Professional Corporation" |
| Alternate name option | text | optional — most regulators' formats leave little room, but initials variants help |
| Registered office address | address block | must be in the province of incorporation |
| Intended shareholders | repeatable block: Full name / Relationship (Self / Spouse / Child / Parent / Other licensee) / Licensed member? (yes + number / no) / Share class intent (Voting / Non-voting) | validation: at least one voting shareholder who is a licensed member; warn when a non-licensee is set to Voting; warn when family shareholders are added for professions that prohibit them (law ON, pharmacy ON, CPA ON) |
| Directors | repeatable: name + licensed member? | all directors must be licensed members — hard validation |
| Do you have an accountant advising on structure? | radio: Yes / No | if Yes, optional accountant contact field — we coordinate share classes with them |

### Step 4 — Timing and review

| Field | Type | Notes |
|---|---|---|
| When do you want to start practising through the corporation? | select: ASAP / 1–3 months / 3–6 months / Just researching | ASAP triggers priority handling note |
| Fiscal year-end preference | month select | optional — "not sure" default; affects annual return timing |
| Anything else? | textarea | optional |
| Consent | checkbox: contact + privacy policy | required |

Confirmation screen restates the proposed name, regulator, shareholder plan, and the two-step sequence for their province, and offers a calendar link.

---

## Frequently asked questions

### Is the consultation really free?

Yes — the call, the naming pre-check, and the written two-step plan are free with no obligation. You pay only if you engage Corporate Registry Services to prepare and file the incorporation, the regulator application, or your annual renewals, and we quote those fees before starting.

### Can you file with my regulator for me?

We prepare the complete regulator package — application forms, certificate of incorporation or status, declarations, undertakings — aligned to your regulator's checklist, and file wherever the regulator permits third-party submission. Where the regulator requires the member to submit personally (some portals do), we hand you a submission-ready package and instructions.

### What if my accountant already designed the share structure?

Perfect — bring it. We validate the structure against your regulator's shareholder rules (which override tax preferences), flag anything the college would reject, and draft the articles and share classes to match what's actually permitted for your profession.

### How long does the whole process take?

Typically two to six weeks end to end: the registry incorporation is fast (same-day to a few days in most provinces), and the regulator authorization adds two to six weeks depending on the body — CPSO runs two to three weeks; CPSBC six to eight. Renewal-season backlogs add time, which is a reason not to start near your regulator's deadline.

## Related guides

- [Professional Corporations in Canada: The Complete Guide](/professional-corporation/)
- [Renewals and compliance calendar](/professional-corporation/renewals)
- [Alberta](/professional-corporation/alberta) · [Ontario](/professional-corporation/ontario) · [British Columbia](/professional-corporation/british-columbia)
