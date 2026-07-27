import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { isCmsAuthenticated } from "@/lib/cms-auth";
import { cmsArticles } from "@/lib/cms-mongo";
import { publishToGitHub, serializeArticleAsMarkdown } from "@/lib/cms-publish";

/**
 * POST /api/cms/articles/[id]/publish
 *
 * Validates the article, serializes it as .md with front-matter, commits
 * to `main` at content/{section}/{slug}.md via GitHub API (existing
 * article overwritten; new article created). Marks the Mongo record as
 * published with the commit SHA. Render auto-deploys on push to main.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEBAB_RE  = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE = 70;
const MAX_DESC  = 165;
const MIN_BODY  = 300;   // CMS bar is lower than automation bar (2000) — a human has reviewed it

function idFrom(raw: string): ObjectId | null {
  try { return new ObjectId(raw); } catch { return null; }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }
  const { id } = await params;
  const oid = idFrom(id);
  if (!oid) return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });

  const col = await cmsArticles();
  const doc = await col.findOne({ _id: oid });
  if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  /* Validation gate — enforced only on publish, not on save-as-draft. */
  const problems: string[] = [];
  if (!doc.slug || !KEBAB_RE.test(doc.slug))                                     problems.push("Slug must be kebab-case (lowercase letters, digits, hyphens).");
  if (!doc.section)                                                              problems.push("Section is required.");
  if (!doc.title || doc.title.trim().length < 2)                                 problems.push("Title is required.");
  if (doc.title && doc.title.length > MAX_TITLE)                                 problems.push(`Title is ${doc.title.length} chars; must be ≤ ${MAX_TITLE}.`);
  if (!doc.description || doc.description.trim().length < 20)                    problems.push("Description is required (min 20 chars).");
  if (doc.description && doc.description.length > MAX_DESC)                      problems.push(`Description is ${doc.description.length} chars; must be ≤ ${MAX_DESC}.`);
  if (!doc.body || doc.body.trim().length < MIN_BODY)                            problems.push(`Body must be at least ${MIN_BODY} characters.`);
  if (doc.body && /<script\b/i.test(doc.body))                                   problems.push("Body contains a <script> tag — not permitted.");
  if (problems.length > 0) {
    return NextResponse.json({ ok: false, problems }, { status: 422 });
  }

  const markdown = serializeArticleAsMarkdown({
    title:       doc.title,
    h1:          doc.h1 ?? null,
    slug:        doc.slug,
    section:     doc.section,
    description: doc.description,
    body:        doc.body,
    faq:         doc.faq ?? null,
  });

  try {
    const result = await publishToGitHub({
      section:  doc.section,
      slug:     doc.slug,
      markdown,
      message:  `CMS publish: ${doc.section}/${doc.slug} — ${doc.title.slice(0, 60)}`,
    });

    const now = new Date();
    await col.updateOne(
      { _id: oid },
      { $set: {
          status:          "published",
          publishedAt:     now,
          publishedCommit: result.sha,
          publishedUrl:    result.url,
          updatedAt:       now,
      }},
    );

    /* Strip `ok: true` from the PublishResult (already there in the spread)
     *  by omitting the field. Use rest destructure. */
    const { ok: _ok, ...rest } = result;
    void _ok;
    return NextResponse.json({ ok: true, ...rest });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[cms/publish] failed:", msg);
    return NextResponse.json({ ok: false, error: `Publish failed: ${msg}` }, { status: 502 });
  }
}
