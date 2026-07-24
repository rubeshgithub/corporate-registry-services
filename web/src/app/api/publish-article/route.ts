import { NextResponse } from "next/server";
import crypto from "node:crypto";
import matter from "gray-matter";

/**
 * POST /api/publish-article
 *
 * Draft-only publish endpoint for an external SEO-content automation.
 * Everything lands as a draft PR against `main` — merging the PR IS the
 * approval step. The endpoint never publishes directly.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ENV VARS                                                             │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ PUBLISH_API_KEY   Bearer token the automation sends. Generate with   │
 * │                   `openssl rand -hex 32`. Compared timing-safely.    │
 * │ GITHUB_TOKEN      Fine-grained PAT with Contents (read+write) and    │
 * │                   Pull-requests (read+write) scoped to this repo.    │
 * │ GITHUB_REPO       Optional. Defaults to                              │
 * │                   "rubeshgithub/corporate-registry-services".        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ REVIEW / APPROVAL WORKFLOW                                           │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ 1. Automation POSTs a validated draft. Endpoint creates a branch     │
 * │    `draft-article/<slug>` and opens a PR against `main`.             │
 * │ 2. Reviewer visits the PR URL returned in the 201 response body      │
 * │    (`review` field), edits the article file inline on GitHub if      │
 * │    needed, then merges the PR to publish. Render auto-deploys on     │
 * │    push to main, so the article goes live within ~2 minutes.         │
 * │ 3. To reject a draft, close the PR without merging and delete the    │
 * │    branch. The endpoint will then accept a fresh submission for the  │
 * │    same slug.                                                        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ KEY ROTATION                                                         │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ 1. Generate a new key: `openssl rand -hex 32`.                       │
 * │ 2. Update PUBLISH_API_KEY in Render → Environment. Save. Render      │
 * │    triggers a rolling redeploy automatically.                        │
 * │ 3. Update the automation's stored bearer token to the new value.     │
 * │ 4. Once you confirm the automation is authenticating with the new    │
 * │    key, revoke the old key by ensuring it's no longer stored         │
 * │    anywhere. No overlap window is needed since the automation runs   │
 * │    on a schedule, not continuously.                                  │
 * │                                                                      │
 * │ For GITHUB_TOKEN rotation, same idea — generate a new PAT in         │
 * │ GitHub, update Render env, delete the old PAT in GitHub settings.    │
 * └──────────────────────────────────────────────────────────────────────┘
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_API   = "https://api.github.com";
const DEFAULT_REPO = "rubeshgithub/corporate-registry-services";
const CONTENT_DIR  = "content/articles";
const BRANCH_PREFIX = "draft-article";
const KEBAB_RE      = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE     = 70;
const MAX_DESC      = 165;
const MIN_BODY      = 2000;

type Body = {
  slug?:     string;
  markdown?: string;
  status?:   string; // Ignored — server always forces draft.
};

type ProblemsResponse = { ok: false; problems: string[] };

export async function POST(req: Request) {
  /* ── 1. Auth ────────────────────────────────────────────────── */
  const authError = checkAuth(req.headers.get("authorization"));
  if (authError) return authError;

  /* ── 2. Parse + validate ────────────────────────────────────── */
  let body: Body;
  try { body = await req.json(); } catch {
    return json422(["Request body must be valid JSON."]);
  }

  const validation = validate(body);
  if (validation.problems.length > 0) {
    return json422(validation.problems);
  }
  const { slug, markdown, filename } = validation;

  /* ── 3. Check the repo for prior existence ───────────────────── */
  const repo = process.env.GITHUB_REPO?.trim() || DEFAULT_REPO;
  const [owner, repoName] = repo.split("/", 2);
  if (!owner || !repoName) {
    return NextResponse.json(
      { ok: false, error: "GITHUB_REPO env var is malformed (expected owner/repo)." },
      { status: 500 },
    );
  }

  try {
    const filePath = `${CONTENT_DIR}/${filename}`;
    const branchName = `${BRANCH_PREFIX}/${slug}`;

    if (await fileExistsOnMain(owner, repoName, filePath)) {
      return NextResponse.json(
        { ok: false, error: `An article with slug "${slug}" already exists on main.` },
        { status: 409 },
      );
    }

    const existingPr = await findOpenDraftPr(owner, repoName, branchName);
    if (existingPr) {
      return NextResponse.json(
        {
          ok:     false,
          error:  `A draft PR for slug "${slug}" is already open.`,
          review: existingPr,
        },
        { status: 409 },
      );
    }

    /* ── 4. Create branch + commit file + open PR ────────────── */
    const mainSha = await getMainHeadSha(owner, repoName);
    await createBranch(owner, repoName, branchName, mainSha);
    await putFileOnBranch(owner, repoName, branchName, filePath, markdown, slug);
    const prUrl = await openPr(owner, repoName, branchName, slug);

    /* ── 5. Response ─────────────────────────────────────────── */
    return NextResponse.json(
      { ok: true, status: "draft", slug, review: prUrl },
      { status: 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error creating draft PR.";
    console.error("[publish-article] failed:", msg);
    return NextResponse.json(
      { ok: false, error: `Failed to create draft PR: ${msg}` },
      { status: 502 },
    );
  }
}

/* ═══════════════════════════ Auth ══════════════════════════════ */

function checkAuth(header: string | null): NextResponse | null {
  const expected = process.env.PUBLISH_API_KEY?.trim();
  if (!expected) {
    /* Fail closed if the server isn't configured. Prevents a "silent open"
     *  situation where a missing env var accidentally makes the endpoint
     *  authless. */
    return NextResponse.json(
      { ok: false, error: "Server is not configured (PUBLISH_API_KEY missing)." },
      { status: 500 },
    );
  }
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!presented || !timingSafeStrEq(presented, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

function timingSafeStrEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ═══════════════════════════ Validation ═══════════════════════ */

function validate(body: Body): { problems: string[]; slug: string; markdown: string; filename: string } {
  const problems: string[] = [];

  const slug     = String(body.slug     ?? "").trim();
  const markdown = String(body.markdown ?? "");

  if (!slug) {
    problems.push("`slug` is required.");
  } else if (!KEBAB_RE.test(slug)) {
    problems.push(`\`slug\` must be kebab-case (lowercase letters/digits, hyphen-separated). Got: "${slug}".`);
  }

  if (!markdown) {
    problems.push("`markdown` is required.");
  } else if (!markdown.startsWith("---")) {
    problems.push("`markdown` must begin with YAML front-matter (a `---` fenced block).");
  }

  /* Only attempt further checks if the shape is at least parseable. */
  if (slug && markdown && markdown.startsWith("---")) {
    let fm: Record<string, unknown>;
    let content: string;
    try {
      const parsed = matter(markdown);
      fm = parsed.data as Record<string, unknown>;
      content = parsed.content;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      problems.push(`Front-matter parse error: ${msg}`);
      return { problems, slug, markdown, filename: `${slug}.md` };
    }

    for (const key of ["title", "slug", "section", "description"] as const) {
      if (!fm[key] || String(fm[key]).trim() === "") {
        problems.push(`Front-matter is missing required field \`${key}\`.`);
      }
    }

    const fmSlug = String(fm.slug ?? "").trim();
    if (fmSlug && fmSlug !== slug) {
      problems.push(`Body \`slug\` ("${slug}") does not match front-matter \`slug\` ("${fmSlug}").`);
    }

    const title = String(fm.title ?? "");
    if (title.length > MAX_TITLE) {
      problems.push(`\`title\` is ${title.length} chars; must be ≤ ${MAX_TITLE}.`);
    }

    const description = String(fm.description ?? "");
    if (description.length > MAX_DESC) {
      problems.push(`\`description\` is ${description.length} chars; must be ≤ ${MAX_DESC}.`);
    }

    if (content.length < MIN_BODY) {
      problems.push(`Body content is ${content.length} chars; must be ≥ ${MIN_BODY}.`);
    }

    if (/<script\b/i.test(content)) {
      problems.push("Body contains a `<script>` tag — not permitted.");
    }
  }

  return { problems, slug, markdown, filename: `${slug}.md` };
}

function json422(problems: string[]): NextResponse<ProblemsResponse> {
  return NextResponse.json({ ok: false, problems }, { status: 422 });
}

/* ═══════════════════════════ GitHub helpers ═══════════════════ */

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN env var is not set.");
  }
  return {
    "Authorization":        `Bearer ${token}`,
    "Accept":               "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent":           "crs-publish-article/1.0",
    "Content-Type":         "application/json",
  };
}

async function fileExistsOnMain(owner: string, repo: string, path: string): Promise<boolean> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=main`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(`GitHub contents check failed (${res.status}): ${await res.text()}`);
}

async function findOpenDraftPr(owner: string, repo: string, branchName: string): Promise<string | null> {
  const head = `${owner}:${branchName}`;
  const url  = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}`;
  const res  = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub pulls list failed (${res.status}): ${await res.text()}`);
  const arr = (await res.json()) as Array<{ html_url?: string }>;
  return arr.length > 0 ? (arr[0].html_url ?? null) : null;
}

async function getMainHeadSha(owner: string, repo: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/main`, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub main HEAD lookup failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { object?: { sha?: string } };
  const sha = json.object?.sha;
  if (!sha) throw new Error("GitHub main HEAD response missing sha.");
  return sha;
}

async function createBranch(owner: string, repo: string, branchName: string, mainSha: string): Promise<void> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    method:  "POST",
    headers: ghHeaders(),
    body:    JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha }),
  });
  if (res.status === 201) return;
  /* 422 with "Reference already exists" — a retry from a previous failed
   *  attempt. Reuse the branch. */
  if (res.status === 422) {
    const text = await res.text();
    if (text.includes("Reference already exists")) return;
    throw new Error(`GitHub branch create refused (422): ${text}`);
  }
  throw new Error(`GitHub branch create failed (${res.status}): ${await res.text()}`);
}

async function putFileOnBranch(
  owner: string, repo: string, branchName: string, path: string, markdown: string, slug: string,
): Promise<void> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;

  /* If the file already exists on the branch (from a prior failed attempt),
   *  we need its SHA to update it in place. */
  let existingSha: string | undefined;
  const check = await fetch(`${url}?ref=${encodeURIComponent(branchName)}`, { headers: ghHeaders() });
  if (check.ok) {
    const json = (await check.json()) as { sha?: string };
    existingSha = json.sha;
  }

  const contentBase64 = Buffer.from(markdown, "utf8").toString("base64");
  const message = existingSha
    ? `Update draft article: ${slug}`
    : `Add draft article: ${slug}`;

  const res = await fetch(url, {
    method:  "PUT",
    headers: ghHeaders(),
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch:  branchName,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (res.status === 201 || res.status === 200) return;
  throw new Error(`GitHub file put failed (${res.status}): ${await res.text()}`);
}

async function openPr(owner: string, repo: string, branchName: string, slug: string): Promise<string> {
  const title = `Draft article: ${slug}`;
  const bodyMd = [
    `Automated draft article submitted via \`/api/publish-article\`.`,
    ``,
    `**Slug:** \`${slug}\``,
    ``,
    `Review the file changes tab, edit inline on GitHub if needed, then merge to publish. Render auto-deploys on merge to \`main\`.`,
    ``,
    `To reject: close this PR and delete the \`${branchName}\` branch. A fresh submission for the same slug will then be accepted.`,
  ].join("\n");

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method:  "POST",
    headers: ghHeaders(),
    body: JSON.stringify({
      title,
      head:  branchName,
      base:  "main",
      body:  bodyMd,
      draft: false,
    }),
  });
  if (!res.ok) throw new Error(`GitHub PR create failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { html_url?: string };
  if (!json.html_url) throw new Error("GitHub PR create response missing html_url.");
  return json.html_url;
}
