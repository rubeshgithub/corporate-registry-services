import { NextResponse } from "next/server";
import { isCmsAuthenticated } from "@/lib/cms-auth";
import { cmsArticles, ensureCmsIndexes, SECTIONS, type Section, type CmsArticleDoc } from "@/lib/cms-mongo";

/**
 * GET  /api/cms/articles       — list drafts + published
 * POST /api/cms/articles       — create a new draft
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  await ensureCmsIndexes();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");   // draft | published | (all)
  const section = url.searchParams.get("section"); // filter
  const q = url.searchParams.get("q")?.trim();

  const filter: Record<string, unknown> = {};
  if (status === "draft" || status === "published") filter.status = status;
  if (section && (SECTIONS as string[]).includes(section)) filter.section = section;
  if (q && q.length >= 2) {
    const regex = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: regex }, { slug: regex }, { description: regex }];
  }

  const col = await cmsArticles();
  const rows = await col.find(filter, {
    projection: { body: 0 },              // list view doesn't need the full body
  }).sort({ updatedAt: -1 }).limit(200).toArray();

  return NextResponse.json({
    ok: true,
    articles: rows.map(serializeListRow),
  });
}

export async function POST(req: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  await ensureCmsIndexes();

  let body: Partial<CmsArticleDoc> = {};
  try { body = await req.json(); } catch { /* fall through — all fields optional on create */ }

  const now = new Date();
  const section = ((SECTIONS as string[]).includes(String(body.section)) ? body.section : "articles") as Section;
  const slug = String(body.slug ?? "").trim();
  const title = String(body.title ?? "").trim();

  /* Slug uniqueness only enforced at save-time on drafts if provided.
   *  Empty slug is fine — user fills it in the editor. */
  if (slug && !KEBAB_RE.test(slug)) {
    return NextResponse.json({ ok: false, error: "Slug must be kebab-case (lowercase letters, digits, hyphens)." }, { status: 400 });
  }

  const doc: Omit<CmsArticleDoc, "_id"> = {
    slug,
    section,
    title,
    h1:          body.h1          ?? null,
    description: body.description ?? "",
    body:        body.body        ?? "",
    faq:         Array.isArray(body.faq) ? body.faq : null,
    status:      "draft",
    createdAt:   now,
    updatedAt:   now,
    createdBy:   "cms",
    lastEditedBy: "cms",
  };

  const col = await cmsArticles();
  try {
    const inserted = await col.insertOne(doc);
    return NextResponse.json({ ok: true, id: String(inserted.insertedId) }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ ok: false, error: "An article with that section+slug already exists." }, { status: 409 });
    }
    console.error("[cms/articles] create failed:", msg);
    return NextResponse.json({ ok: false, error: "Create failed." }, { status: 500 });
  }
}

function serializeListRow(d: CmsArticleDoc) {
  return {
    id:              String(d._id),
    slug:            d.slug,
    section:         d.section,
    title:           d.title,
    description:     d.description,
    status:          d.status,
    createdAt:       d.createdAt.toISOString(),
    updatedAt:       d.updatedAt.toISOString(),
    publishedAt:     d.publishedAt ? new Date(d.publishedAt).toISOString() : null,
    publishedUrl:    d.publishedUrl ?? null,
    publishedCommit: d.publishedCommit ?? null,
  };
}
