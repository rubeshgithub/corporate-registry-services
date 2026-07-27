# automation/drafts/

Drop-off folder for the Claude cloud automation. Files placed here get
picked up by `.github/workflows/relay-drafts.yml` on push to `main`,
POSTed to the CMS API as drafts, then deleted from this folder.

**This folder is intentionally outside `content/`** so the Next.js build
never reads it and it never affects what's served on the site.

## Payload format

Each file: `automation/drafts/<any-name>.json` with the shape the CMS
API accepts (see `content/content-auto-publish/CMS-API-BRIEF.md`):

```json
{
  "section":     "articles",
  "slug":        "kebab-case-slug",
  "title":       "≤ 70 chars",
  "h1":          "optional; null uses title",
  "description": "≤ 165 chars",
  "body":        "GitHub-flavoured markdown, ≥ 300 chars to publish",
  "faq": [
    { "q": "Question?", "a": "Answer." }
  ]
}
```

## Behaviour per file

The relay checks CMS for an existing article at `(section, slug)`:

- **Published already** → skips, emits a workflow warning
- **Draft exists** → PUTs to update the draft in place
- **Nothing exists** → POSTs to create a fresh draft

After each file is relayed, it's `git rm`'d and a cleanup commit is
pushed with `[skip ci]` so Render doesn't redeploy for the cleanup.

## Rejecting or editing a draft

Rejection happens in the CMS UI at `/cms` — click the draft, edit or
delete. The automation never publishes; humans do.

## If the relay fails

Individual `curl -sf` failure aborts the run (via `set -euo pipefail`).
The unrelayed file stays in the folder; the next push retriggers the
workflow and it re-attempts. Check the Actions log for the `::warning::`
or curl error output.
