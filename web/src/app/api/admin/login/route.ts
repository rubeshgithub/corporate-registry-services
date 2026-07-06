import { NextResponse } from "next/server";
import { checkPassword, issueSessionCookie, ADMIN_COOKIE_NAME, ADMIN_COOKIE_TTL_SEC } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!checkPassword(password ?? "")) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const { value } = issueSessionCookie(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name:     ADMIN_COOKIE_NAME,
    value,
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   ADMIN_COOKIE_TTL_SEC,
  });
  return res;
}
