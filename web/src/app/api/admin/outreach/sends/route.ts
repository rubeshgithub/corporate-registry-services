import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { outreachSends, outreachTokens } from "@/lib/outreach-mongo";

/**
 * GET /api/admin/outreach/sends?limit=20
 *
 * Returns the last N outreach sends with their token click/conversion
 * status joined in. Powers the "recent outreach" table in /admin/outreach.
 */

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const url   = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

  const sends = await (await outreachSends())
    .find({}, { projection: { bodyHtml: 0, bodyText: 0 } })
    .sort({ sentAt: -1 })
    .limit(limit)
    .toArray();

  // Join token click/conversion state.
  const tokens = sends.map((s) => s.tokenId).filter(Boolean);
  const tokenDocs = tokens.length
    ? await (await outreachTokens()).find({ token: { $in: tokens } }).toArray()
    : [];
  const tokenMap = new Map(tokenDocs.map((t) => [t.token, t]));

  const rows = sends.map((s) => {
    const t = tokenMap.get(s.tokenId);
    return {
      tokenId:       s.tokenId,
      service:       s.service,
      companyName:   s.companyName,
      registryId:    s.registryId,
      to:            s.to,
      subject:       s.subject,
      sentAt:        s.sentAt,
      clickCount:    t?.clickCount ?? 0,
      firstClickAt:  t?.firstClickedAt ?? null,
      convertedAt:   t?.convertedAt ?? null,
    };
  });

  return NextResponse.json({ rows });
}
