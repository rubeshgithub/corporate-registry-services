import { NextResponse } from "next/server";
import { checkPassword, issueSessionCookie, CMS_COOKIE_NAME, CMS_COOKIE_TTL_SEC } from "@/lib/cms-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { password?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!process.env.CMS_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: "Server not configured (CMS_PASSWORD missing)." },
      { status: 500 },
    );
  }

  const password = String(body.password ?? "");
  if (!checkPassword(password)) {
    /* Small delay to blunt brute-force. Real rate limit would live in a
     *  dedicated layer; for a single-password admin gate this is enough. */
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const { value } = issueSessionCookie(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name:     CMS_COOKIE_NAME,
    value,
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   CMS_COOKIE_TTL_SEC,
    path:     "/",
  });
  return res;
}
