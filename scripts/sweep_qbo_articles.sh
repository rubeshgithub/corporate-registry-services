#!/bin/bash
# One-off sweep: apply the BC QBO-tailored template to the 12 other provinces.
# Writes IN PLACE to the existing TitleCase filenames — the parser
# lowercases them at load time so routing still works at
# /articles/how-to-get-a-corporate-profile-report-for-quickbooks-online-in-<province>.
#
# The earlier version of this script tried to also rename to lowercase, but
# Windows / macOS case-insensitive filesystems collapse the two names into
# the same file — the rm of the "old" name deleted the new content. Simpler
# now: just overwrite in place, leave filenames alone.

set -euo pipefail

CONTENT_DIR="content/articles"
[[ -d "$CONTENT_DIR" ]] || { echo "Run from repo root."; exit 1; }

# Province data: SHORT|LONG|SLUG|FRICTION_HOOK
# SHORT = 2-char abbreviation for meta title
# LONG = full province name for body copy
# SLUG = filename slug (matches existing TitleCase)
# FRICTION_HOOK = specific portal / process the visitor avoids by using CRS
PROVINCES=(
  "AB|Alberta|Alberta|CORES login, no waiting for a registry agent"
  "MB|Manitoba|Manitoba|Manitoba Companies Office visit, no mail-in copies"
  "NB|New Brunswick|New-Brunswick|NB Corporate Registry visit, no mail-in copies"
  "NL|Newfoundland & Labrador|Newfoundland|Registry of Companies portal, no mail-in copies"
  "NT|Northwest Territories|Northwest-Territories|NWT Corporate Registries visit, no mail-in copies"
  "NS|Nova Scotia|Nova-Scotia|Registry of Joint Stock Companies visit, no mail-in copies"
  "NU|Nunavut|Nunavut|Nunavut Corporate Registries visit, no mail-in copies"
  "ON|Ontario|Ontario|ONe-key login for the Ontario Business Registry, no ServiceOntario visits"
  "PE|Prince Edward Island|Prince-Edward-Island|PEI Corporate Registry visit, no mail-in copies"
  "QC|Quebec|Quebec|clicSÉQUR login for the Registraire des entreprises, no visits to the REQ"
  "SK|Saskatchewan|Saskatchewan|Saskatchewan Corporate Registry visit, no mail-in copies"
  "YT|Yukon|Yukon|Yukon Corporate Affairs visit, no mail-in copies"
)

for row in "${PROVINCES[@]}"; do
  IFS='|' read -r SHORT LONG SLUG FRICTION <<< "$row"

  FILE="$CONTENT_DIR/How-to-Get-a-Corporate-Profile-Report-for-QuickBooks-Online-in-$SLUG.md"
  LC_SLUG=$(echo "$SLUG" | tr '[:upper:]' '[:lower:]')

  [[ -f "$FILE" ]] || { echo "  MISSING $FILE"; continue; }

  cat > "$FILE" <<EOF
---
title: "QuickBooks Profile Report — $SHORT · \$49 all-in + GST"
h1: "Corporate Profile Report for QuickBooks ($SHORT)"
slug: "how-to-get-a-corporate-profile-report-for-quickbooks-online-in-$LC_SLUG"
section: "articles"
description: "Get the $LONG Corporate Profile Report Intuit accepts for FINTRAC, payroll, and QuickBooks Payments verification. \$49 all-in + GST, PDF within one business hour."
widgetEyebrow: "For QuickBooks Online verification"
widgetTitle: "Get the Corporate Profile Report QuickBooks accepts"
widgetSub: "The exact PDF Intuit needs for FINTRAC, payroll, and QuickBooks Payments verification. Delivered by email in one business hour — upload directly to your QuickBooks Online account."
---

QuickBooks Online asks for a Corporate Profile Report when you're setting up payroll, enabling QuickBooks Payments, or completing FINTRAC verification. Intuit needs a current, government-issued record proving your $LONG corporation is real and active. This page will get you that PDF in one business hour — no $FRICTION.

## Why You Need a Corporate Profile Report for QuickBooks Online

QuickBooks Online requires a Corporate Profile Report to verify your business and comply with regulations like FINTRAC or Intuit's requirements for payroll services. The $LONG Corporate Profile Report provides the current public record from the $LONG Corporate Registry, making it the ideal document for QuickBooks verification.

## What's Included in a $LONG Corporate Profile Report?

- Current and former name(s) of the corporation
- Legal status (active, dissolved, or amalgamated)
- Registered office and mailing address
- Directors, officers, and/or shareholders
- Last document filed with the registry
- Amalgamation info (if applicable)
- Extra-provincial registration info
- Historical name information

## Why Choose CRS Canada

- **Affordable pricing** including government fees
- **Lightning-fast delivery** — PDF in one business hour
- **Hassle-free** ordering on a user-friendly website
- **Trusted service** with province-specific expertise

## How to Order

1. **[Search your $LONG corporation in the card at the top of this page](#crs-inline-lookup)** — company name, Corporate Access Number, or Business Number all work
2. Pick your corporation from the results
3. Enter your name, email, and phone; pay \$49 + GST securely via Stripe
4. Receive the government-issued PDF by email within one business hour
5. Upload it in QuickBooks Online to complete FINTRAC / payroll / Payments verification

## Common Use Cases

- **Payroll Processing** — QuickBooks needs confirmation of legal status
- **FINTRAC Verification** — required for QuickBooks Payments
- **Bank Account Registration** — banks often request a Corporate Profile Report
- **Ongoing Compliance** — Intuit may request updated reports periodically
EOF

  echo "  swept $SLUG"
done

echo ""
echo "Done. All 12 QBO articles updated in place at their TitleCase filenames."
echo "Routes render at /articles/how-to-get-a-corporate-profile-report-for-quickbooks-online-in-<province> per content.ts slugify()."
