import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware — two responsibilities:
 *   1. Gate /cms/* pages behind a session cookie (redirect to /cms/login).
 *   2. Normalize content-section paths to lowercase (301).
 *
 * The URL-normalization matcher deliberately does NOT include /cms/* so
 * we don't collide on the same request. CMS URLs may contain uppercase
 * (e.g., Mongo ObjectIds in /cms/edit/<id>) and shouldn't be forced
 * lowercase.
 */

const CMS_COOKIE = "crs_cms_session";
const PUBLIC_CMS_PATHS = new Set<string>([
  "/cms/login",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* ── /cms/* auth gate ────────────────────────────────────────────── */
  if (pathname.startsWith("/cms")) {
    if (!PUBLIC_CMS_PATHS.has(pathname)) {
      const cookie = request.cookies.get(CMS_COOKIE);
      if (!cookie?.value) {
        const url = request.nextUrl.clone();
        url.pathname = "/cms/login";
        if (pathname !== "/cms/login") url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
      /* Full HMAC verification happens server-side in isCmsAuthenticated().
       *  Middleware only checks cookie presence — cheap gate to redirect
       *  unauthenticated visitors before the app runs. Invalid cookies
       *  are rejected by the API routes and page-level checks. */
    }
    return; // Don't apply URL-lowercase normalization to /cms
  }

  /* ── Content-path URL normalization (existing) ───────────────────── */
  const lower = pathname.toLowerCase();
  if (pathname !== lower) {
    const url = request.nextUrl.clone();
    url.pathname = lower;
    return NextResponse.redirect(url, 301);
  }
}

export const config = {
  matcher: [
    "/cms/:path*",
    "/articles/:path*",
    "/guides/:path*",
    "/annual-return/:path*",
    "/incorporation/:path*",
    "/minute-books/:path*",
    "/good-standing/:path*",
    "/profile-reports/:path*",
  ],
};
