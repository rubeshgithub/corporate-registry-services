import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lower = pathname.toLowerCase();
  if (pathname !== lower) {
    const url = request.nextUrl.clone();
    url.pathname = lower;
    return NextResponse.redirect(url, 301);
  }
}

export const config = {
  matcher: [
    "/articles/:path*",
    "/guides/:path*",
    "/annual-return/:path*",
    "/incorporation/:path*",
    "/minute-books/:path*",
    "/good-standing/:path*",
    "/profile-reports/:path*",
  ],
};
