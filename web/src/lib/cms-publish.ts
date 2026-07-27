/**
 * GitHub commit-to-main helper for CMS publishes.
 *
 * The existing /api/publish-article endpoint opens PRs for automation-
 * submitted drafts (external Claude cowork). The CMS is different: an
 * authenticated human is clicking "Publish", so the human review already
 * happened in the CMS UI — no PR review needed. This commits directly
 * to main.
 *
 * ENV: GITHUB_TOKEN (fine-grained PAT, Contents write), GITHUB_REPO
 * (optional, defaults to rubeshgithub/corporate-registry-services).
 */

const GITHUB_API   = "https://api.github.com";
const DEFAULT_REPO = "rubeshgithub/corporate-registry-services";
const CONTENT_ROOT = "content";

export type PublishResult = {
  ok:      true;
  path:    string;   // "content/articles/foo.md"
  sha:     string;   // commit SHA
  url:     string;   // /articles/foo — the live URL after Render redeploys
  htmlUrl: string;   // GitHub URL of the commit
};

export async function publishToGitHub(args: {
  section:  string;
  slug:     string;
  markdown: string;
  message:  string;
}): Promise<PublishResult> {
  const repo = process.env.GITHUB_REPO?.trim() || DEFAULT_REPO;
  const [owner, repoName] = repo.split("/", 2);
  if (!owner || !repoName) throw new Error("GITHUB_REPO env var is malformed (expected owner/repo).");

  const path = `${CONTENT_ROOT}/${args.section}/${args.slug}.md`;

  /* Check if the file exists on main so we send the right PUT payload —
   *  creating a new file vs. updating one requires different fields. */
  const existingSha = await getFileShaOnMain(owner, repoName, path);

  const contentBase64 = Buffer.from(args.markdown, "utf8").toString("base64");
  const putRes = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}/contents/${encodePath(path)}`, {
    method:  "PUT",
    headers: ghHeaders(),
    body: JSON.stringify({
      message: args.message,
      content: contentBase64,
      branch:  "main",
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  if (!putRes.ok) {
    throw new Error(`GitHub commit failed (${putRes.status}): ${await putRes.text()}`);
  }
  const putJson = (await putRes.json()) as { commit?: { sha?: string; html_url?: string } };
  const commitSha = putJson.commit?.sha;
  const commitUrl = putJson.commit?.html_url;
  if (!commitSha) throw new Error("GitHub commit response missing commit SHA.");

  return {
    ok:      true,
    path,
    sha:     commitSha,
    url:     `/${args.section}/${args.slug}`,
    htmlUrl: commitUrl ?? `https://github.com/${owner}/${repoName}/commit/${commitSha}`,
  };
}

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN env var is not set.");
  return {
    "Authorization":        `Bearer ${token}`,
    "Accept":               "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent":           "crs-cms/1.0",
    "Content-Type":         "application/json",
  };
}

async function getFileShaOnMain(owner: string, repo: string, path: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=main`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 200) {
    const json = (await res.json()) as { sha?: string };
    return json.sha ?? null;
  }
  if (res.status === 404) return null;
  throw new Error(`GitHub contents check failed (${res.status}): ${await res.text()}`);
}

function encodePath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/g, "/");
}

/** Serialize a CMS article into the .md front-matter + body format the
 *  existing [section]/[slug] renderer expects. */
export function serializeArticleAsMarkdown(article: {
  title:       string;
  h1?:         string | null;
  slug:        string;
  section:     string;
  description: string;
  body:        string;
  faq?:        { q: string; a: string }[] | null;
}): string {
  const fm: string[] = ["---"];
  fm.push(`title: ${jsonYaml(article.title)}`);
  if (article.h1 && article.h1.trim()) fm.push(`h1: ${jsonYaml(article.h1)}`);
  fm.push(`slug: ${jsonYaml(article.slug)}`);
  fm.push(`section: ${jsonYaml(article.section)}`);
  fm.push(`description: ${jsonYaml(article.description)}`);
  if (article.faq && article.faq.length > 0) {
    fm.push("faq:");
    for (const item of article.faq) {
      fm.push(`  - q: ${jsonYaml(item.q)}`);
      fm.push(`    a: ${jsonYaml(item.a)}`);
    }
  }
  fm.push("---");
  return fm.join("\n") + "\n\n" + article.body.trim() + "\n";
}

/** YAML string emitter: uses double-quoted form + JSON escaping. Handles
 *  every quote/backslash/newline case safely for our simple frontmatter
 *  fields (title/description/slug/section/FAQ Q&A). */
function jsonYaml(s: string): string {
  return JSON.stringify(s);
}
