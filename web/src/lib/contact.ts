/**
 * Single source of truth for CRS's phone number. Added Sep 2026 — before
 * this the site had no phone number anywhere (Header, Footer, /contact all
 * checked). Display format and the tel:/sms: hrefs are derived from one
 * value so a future number change is a one-line edit, not a site-wide grep.
 */

export const SITE_PHONE_DISPLAY = "(778) 949-2055";
export const SITE_PHONE_TEL     = "+17789492055";
export const SITE_PHONE_SMS     = "+17789492055";

export const SITE_PHONE_HREF_CALL = `tel:${SITE_PHONE_TEL}`;
export const SITE_PHONE_HREF_SMS  = `sms:${SITE_PHONE_SMS}`;
