import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { isCmsAuthorized, isCmsAuthenticated } from "@/lib/cms-auth";
import { cmsArticles, ensureCmsIndexes, SECTIONS, type Section, type CmsArticleDoc, type CmsFaq } from "@/lib/cms-mongo";
import { deleteFromGitHub } from "@/lib/cms-publish";

/**
 * GET    /api/cms/articles/[id]  — fetch a single article
 *                                  (cookie OR bearer)
 * PUT    /api/cms/articles/[id]  — save changes (stays a draft)
 *                                  (cookie OR bearer — automation can update
 *                                   its own previously-created drafts by id)
 * DELETE /api/cms/articles/[id]  — delete from Mongo
 *                                  (cookie only — humans only, so automation
 *                                   bugs can't wipe drafts)
 *                                  Does NOT remove the git-published file.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEBAB_RE   = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE  = 70;
const MAX_DESC   = 165;

function idFrom(raw: string): ObjectId | null {
  try { return new ObjectId(raw); } catch { return null; }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCmsAuthorized(req, { allowBearer: true }))) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  const { id } = await params;
  const oid = idFrom(id);
  if (!oid) return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });

  const col = await cmsArticles();
  const doc = await col.findOne({ _id: oid });
  if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true, article: serialize(doc) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCmsAuthorized(req, { allowBearer: true }))) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  await ensureCmsIndexes();

  const { id } = await params;
  const oid = idFrom(id);
  if (!oid) return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });

  let body: Partial<CmsArticleDoc>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  /* Draft-only validation — Publish route does the stricter check. Here
   *  we just prevent obviously-broken saves. */
  const problems: string[] = [];
  if (body.slug !== undefined) {
    const s = String(body.slug).trim();
    if (s && !KEBAB_RE.test(s)) problems.push("Slug must be kebab-case.");
  }
  if (body.section !== undefined && !(SECTIONS as string[]).includes(String(body.section))) {
    problems.push(`Section must be one of: ${SECTIONS.join(", ")}.`);
  }
  if (body.title !== undefined && String(body.title).length > MAX_TITLE) {
    problems.push(`Title is ${String(body.title).length} chars; must be ≤ ${MAX_TITLE}.`);
  }
  if (body.description !== undefined && String(body.description).length > MAX_DESC) {
    problems.push(`Description is ${String(body.description).length} chars; must be ≤ ${MAX_DESC}.`);
  }
  if (problems.length > 0) {
    return NextResponse.json({ ok: false, problems }, { status: 422 });
  }

  const update: Partial<CmsArticleDoc> = {};
  if (body.slug        !== undefined) update.slug        = String(body.slug).trim();
  if (body.section     !== undefined) update.section     = body.section as Section;
  if (body.title       !== undefined) update.title       = String(body.title).trim();
  if (body.h1          !== undefined) update.h1          = body.h1 === null || body.h1 === "" ? null : String(body.h1).trim();
  if (body.description !== undefined) update.description = String(body.description).trim();
  if (body.body        !== undefined) update.body        = String(body.body);
  if (body.faq        !== undefined) update.faq         = sanitizeFaq(body.faq);
  update.updatedAt    = new Date();
  update.lastEditedBy = "cms";

  const col = await cmsArticles();
  try {
    const res = await col.updateOne({ _id: oid }, { $set: update });
    if (res.matchedCount === 0) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    const doc = await col.findOne({ _id: oid });
    return NextResponse.json({ ok: true, article: doc ? serialize(doc) : null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ ok: false, error: "Another article already uses that section+slug." }, { status: 409 });
    }
    console.error("[cms/articles] update failed:", msg);
    return NextResponse.json({ ok: false, error: "Save failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  const { id } = await params;
  const oid = idFrom(id);
  if (!oid) return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });
  const col = await cmsArticles();
  const doc = await col.findOne({ _id: oid });
  if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  /* If the article was published, remove the git-committed .md too so
   *  the live URL stops resolving. Do git first — if it fails, leave the
   *  Mongo record intact so ops can see the delete didn't fully happen. */
  let gitRemoved: { path: string; commitSha?: string; commitUrl?: string; alreadyGone?: boolean } | null = null;
  if (doc.status === "published" && doc.slug && doc.section) {
    try {
      const result = await deleteFromGitHub({
        section: doc.section,
        slug:    doc.slug,
        message: `CMS delete: ${doc.section}/${doc.slug}${doc.title ? ` — ${doc.title.slice(0, 60)}` : ""}`,
      });
      gitRemoved = "notFound" in result
        ? { path: result.path, alreadyGone: true }
        : { path: result.path, commitSha: result.sha, commitUrl: result.htmlUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      console.error("[cms/articles] git delete failed:", msg);
      return NextResponse.json({ ok: false, error: `Live file remove failed: ${msg}` }, { status: 502 });
    }
  }

  const res = await col.deleteOne({ _id: oid });
  if (res.deletedCount === 0) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, gitRemoved });
}

function sanitizeFaq(raw: unknown): CmsFaq[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CmsFaq[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const q = String((item as Record<string, unknown>).q ?? "").trim();
    const a = String((item as Record<string, unknown>).a ?? "").trim();
    if (q && a) out.push({ q, a });
  }
  return out.length > 0 ? out : null;
}

function serialize(d: CmsArticleDoc) {
  return {
    id:              String(d._id),
    slug:            d.slug,
    section:         d.section,
    title:           d.title,
    h1:              d.h1 ?? null,
    description:     d.description,
    body:            d.body,
    faq:             d.faq ?? [],
    status:          d.status,
    createdAt:       d.createdAt.toISOString(),
    updatedAt:       d.updatedAt.toISOString(),
    createdBy:       d.createdBy,
    lastEditedBy:    d.lastEditedBy ?? null,
    publishedAt:     d.publishedAt     ? new Date(d.publishedAt).toISOString() : null,
    publishedCommit: d.publishedCommit ?? null,
    publishedUrl:    d.publishedUrl    ?? null,
  };
}
