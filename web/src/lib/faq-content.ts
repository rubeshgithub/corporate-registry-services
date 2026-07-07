/**
 * FAQ content compiled from the existing article + service-config content.
 * Every answer maps to something already stated elsewhere on the site — a
 * price in service-config.ts, a policy in /disclaimer, a jurisdiction rule
 * in an article, etc. If any of these drift over time, update this file
 * to match the source of truth (pricing → service-config.ts).
 *
 * Grouped by intent so the /faq page can render category sections with
 * quick-jump links, and Google can also serve individual answers as
 * featured snippets via the FAQPage JSON-LD schema we emit.
 */

export type FaqItem = { q: string; a: string; href?: string };
export type FaqCategory = { key: string; title: string; items: FaqItem[] };

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: "pricing",
    title: "Pricing & fees",
    items: [
      {
        q: "How much does CRS charge to file an annual return?",
        a: "$99 all-in per year, plus GST/HST. Government registry fees are included in the $99 — there are no surprise add-ons at checkout. Behind on filings? Each additional year is billed at the same $99 rate.",
        href: "/order/annual-return",
      },
      {
        q: "How much does incorporation cost?",
        a: "Numbered incorporation is $699 all-in + GST. Named incorporation is $749 all-in + GST (includes a NUANS name search). Extra-provincial registration is $299 all-in + GST. Government filing fees are included.",
        href: "/order/incorporation",
      },
      {
        q: "How much is a corporate profile report?",
        a: "$49 all-in + GST. Delivered as a PDF, direct from the government registry, within one business hour.",
        href: "/order/profile-report",
      },
      {
        q: "How much is a Certificate of Good Standing?",
        a: "$79 all-in + GST. Government-issued, delivered as a PDF within hours.",
        href: "/order/good-standing",
      },
      {
        q: "How much do dissolution and revival services cost?",
        a: "Voluntary dissolution and corporate revival are each $399 all-in + GST. Revival often involves catching up on missed annual returns — those are quoted separately at the standard $99 per year.",
        href: "/order/voluntary-dissolution",
      },
      {
        q: "Are government fees included in your prices?",
        a: "Yes, every service quote is all-in. Whatever the registry charges (which varies by jurisdiction) is baked into our price. You pay the CRS amount plus tax; nothing else.",
      },
      {
        q: "Do you charge GST or HST?",
        a: "Yes. GST or HST is added at checkout based on the billing address you enter on the Stripe payment page. Alberta customers pay 5% GST; Ontario pays 13% HST; the rate matches whichever province your billing address is in.",
      },
      {
        q: "Are your prices the same across all provinces?",
        a: "For CRS, yes. Our all-in price for a given service is the same whether you're filing federally or in any province or territory. The government's underlying fee varies, but we absorb that variance.",
      },
    ],
  },
  {
    key: "timelines",
    title: "Timelines",
    items: [
      {
        q: "How long does an annual return filing take?",
        a: "Filed with the registry within 24 hours of payment. Government processing on the registry side is usually the same day; you receive the filing confirmation by email as soon as the registry returns it.",
      },
      {
        q: "How fast do I get a corporate profile report?",
        a: "Within one business hour of payment. Reports are pulled directly from the government registry and delivered as PDF by email.",
      },
      {
        q: "How long does incorporation take?",
        a: "Filed within 24 hours of payment. Certificate of Incorporation and organizational documents are emailed once the government returns them, typically within 1-3 business days depending on the jurisdiction.",
      },
      {
        q: "How long does a Certificate of Good Standing take?",
        a: "Delivered as a PDF within hours of payment, direct from the government registry.",
      },
    ],
  },
  {
    key: "jurisdictions",
    title: "Jurisdictions & coverage",
    items: [
      {
        q: "Which provinces and territories do you cover?",
        a: "All of them, plus federal. Alberta, British Columbia, Manitoba, New Brunswick, Newfoundland & Labrador, Northwest Territories, Nova Scotia, Nunavut, Ontario, Prince Edward Island, Quebec, Saskatchewan, Yukon, and federal (CBCA).",
      },
      {
        q: "Do you handle Quebec (REQ) filings?",
        a: "Yes. Quebec's annual declaration is filed with the Registraire des entreprises (REQ). Note the deadline in Quebec is tied to your fiscal year end, not the incorporation anniversary — check with your accountant about the exact filing date.",
        href: "/articles/how-to-file-your-annual-return-in-quebec",
      },
      {
        q: "Can I incorporate in a province where I don't live?",
        a: "Yes. Federal incorporation lets you operate under one entity across Canada. Provincial incorporations let you pick any province regardless of where you live, though you may need to register extra-provincially in the province where you actually do business.",
      },
      {
        q: "What if my company doesn't appear in the search?",
        a: "The public registries occasionally lag behind their own internal records by hours or days, especially right after a new incorporation. Try the exact registered name including the legal element (Inc., Ltd., Corp., ULC, LP). If it still doesn't appear, email support@corporateregistryservices.ca and we'll help locate it.",
      },
    ],
  },
  {
    key: "corporate-basics",
    title: "Corporate basics",
    items: [
      {
        q: "What is an annual return?",
        a: "An annual return is a mandatory yearly filing that keeps your corporation active on the government registry. It confirms directors, registered address, and other public details. It is not a tax return — it's a separate corporate compliance requirement.",
      },
      {
        q: "What happens if I don't file my annual return?",
        a: "The registry can dissolve or strike your corporation. Reinstatement (bringing it back) is possible but costs more and takes weeks. While struck, you lose the ability to sign contracts, hold bank accounts, and act as a legal entity. Alberta gives you only one month after your incorporation anniversary — the tightest window in Canada.",
      },
      {
        q: "What is a corporate profile report?",
        a: "The official public record of a corporation's status, directors, registered address, and filing history, pulled directly from the government registry. Used for KYC, due diligence, financing, and legal review.",
        href: "/guides/corporate-profile-report-vs-certificate-of-good-standing",
      },
      {
        q: "What's the difference between a profile report and a Certificate of Good Standing?",
        a: "A profile report is a detailed snapshot of all the public information about the corporation (multi-page, ~$49). A Certificate of Good Standing is a single-page official confirmation that the corporation is active and compliant as of the issue date (~$79). Banks and law firms usually ask for the certificate; due diligence usually needs the full report.",
        href: "/guides/corporate-profile-report-vs-certificate-of-good-standing",
      },
      {
        q: "What is a corporate minute book?",
        a: "The official statutory record of a corporation's existence: articles of incorporation, by-laws, resolutions, share certificates, registers of directors and shareholders. It's a legal requirement under the Canada Business Corporations Act and every provincial equivalent. Not having one exposes you to personal liability and blocks bank loans, sales, and audits.",
        href: "/minute-books",
      },
      {
        q: "What is a NUANS report?",
        a: "A NUANS report is a federally-produced name search that checks a proposed corporation name against every Canadian registry for conflicts. Required before federal incorporation and useful for provincial ones. CRS handles the NUANS as part of Named Incorporation, or you can order a standalone NUANS report for $79.",
        href: "/order/nuans-search",
      },
      {
        q: "Should I incorporate federally or provincially?",
        a: "Federal gives you the corporation name protection across all of Canada and lets you operate anywhere without re-registering. Provincial is simpler if you plan to operate in one province. If you cross provincial lines regularly, federal often makes more sense; local businesses usually go provincial. Prices are the same either way through CRS.",
        href: "/guides/federal-vs-provincial-incorporation-canada",
      },
    ],
  },
  {
    key: "orders-payment",
    title: "Orders & payment",
    items: [
      {
        q: "How do I place an order?",
        a: "Find the service you want on our site, click the order button, look up your corporation in the registry search, fill out the short contact form, and pay with a credit card via Stripe. Total time is usually 2-3 minutes.",
      },
      {
        q: "What payment methods do you accept?",
        a: "Credit and debit cards via Stripe (Visa, Mastercard, American Express). Payment is processed securely by Stripe; CRS never sees your card details.",
      },
      {
        q: "Is my payment secure?",
        a: "Yes. All payments are processed by Stripe, a certified PCI Service Provider Level 1 (the highest tier). CRS never touches raw card details. Your billing address is used only to compute the correct GST/HST rate.",
      },
      {
        q: "How will I receive my documents?",
        a: "By email, at the address you provide during checkout. Reports and certificates arrive as PDF attachments; filing confirmations include the registry receipt.",
      },
      {
        q: "Can I get a refund?",
        a: "Yes if we haven't filed with the government yet. Once a filing has been submitted to the registry, we can't reverse it, but if there's a mistake we'll re-file at our cost. Contact us at support@corporateregistryservices.ca to request a refund.",
      },
    ],
  },
  {
    key: "about-crs",
    title: "About CRS",
    items: [
      {
        q: "Are you affiliated with the government?",
        a: "No. CRS is an independent, privately-owned service. We access publicly-available registry information and act as your agent for filings, but we are not sponsored by, endorsed by, or affiliated with any federal, provincial, or territorial government.",
        href: "/disclaimer",
      },
      {
        q: "Are you a law firm?",
        a: "No. CRS is a document preparation and registry filing service. We prepare and submit corporate filings; we don't provide legal advice or represent clients in legal proceedings.",
      },
      {
        q: "Do you provide legal advice?",
        a: "No. Nothing on our website or in our communications constitutes legal, tax, or accounting advice. For legal advice about your specific corporation, consult a lawyer licensed in the relevant jurisdiction.",
        href: "/disclaimer",
      },
      {
        q: "Where can I read your privacy policy and terms?",
        a: "Our Privacy Policy and Terms of Service are linked in the site footer, along with our Disclaimer. Everything is written in plain English.",
        href: "/privacy",
      },
    ],
  },
];
