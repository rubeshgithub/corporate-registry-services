# Task: GitHub Action relay — automation drafts → CMS API

## Why this exists

The Claude cloud automation that writes weekly SEO articles cannot reach
`corporateregistryservices.ca` directly (its sandbox only allows GitHub +
package registries). It CAN commit files to this repo via the GitHub API.
So: it commits draft payloads to `automation/drafts/`, and this Action
relays them to the CMS API (per CMS API BRIEF), where they appear as
drafts in the /cms review queue. Humans still publish manually in the CMS.

## Implement

1. **Secret:** add `CMS_API_TOKEN` to the repo's Actions secrets (same value as the site's env var).

2. **Workflow:** `.github/workflows/relay-drafts.yml`

```yaml
name: Relay automation drafts to CMS
on:
  push:
    branches: [main]
    paths: ["automation/drafts/*.json"]
permissions:
  contents: write
concurrency:
  group: relay-drafts
  cancel-in-progress: false
jobs:
  relay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Relay each pending draft to the CMS API
        env:
          CMS_API_TOKEN: ${{ secrets.CMS_API_TOKEN }}
          BASE: https://www.corporateregistryservices.ca
        run: |
          set -euo pipefail
          shopt -s nullglob
          for f in automation/drafts/*.json; do
            slug=$(jq -r '.slug' "$f"); section=$(jq -r '.section' "$f")
            echo "Relaying $section/$slug"
            existing=$(curl -sf -H "Authorization: Bearer $CMS_API_TOKEN" \
              "$BASE/api/cms/articles?slug=$slug&section=$section")
            status=$(echo "$existing" | jq -r '.articles[0].status // "none"')
            id=$(echo "$existing" | jq -r '.articles[0].id // ""')
            if [ "$status" = "published" ]; then
              echo "::warning::$slug already published — skipping"
            elif [ "$status" = "draft" ]; then
              curl -sf -X PUT -H "Authorization: Bearer $CMS_API_TOKEN" \
                -H "Content-Type: application/json" \
                --data @"$f" "$BASE/api/cms/articles/$id" > /dev/null
              echo "Updated existing draft $id"
            else
              curl -sf -X POST -H "Authorization: Bearer $CMS_API_TOKEN" \
                -H "Content-Type: application/json" \
                --data @"$f" "$BASE/api/cms/articles" > /dev/null
              echo "Created new draft"
            fi
            git rm -q "$f"
          done
          if ! git diff --cached --quiet; then
            git config user.name "draft-relay[bot]"
            git config user.email "actions@users.noreply.github.com"
            git commit -m "chore: relay automation drafts to CMS [skip ci]"
            git push
          fi
```

3. **Draft payload format** (what the automation commits — same JSON the
   CMS API accepts): `{ section, slug, title, h1, description, body, faq }`.

4. **Ensure** `automation/drafts/` existing in main doesn't trigger the
   site build/deploy (it's outside `content/`), and that the relay's
   cleanup commit doesn't re-trigger deploys ([skip ci] included).

## Acceptance test

Commit `automation/drafts/test-relay.json` (section "articles", slug
"test-relay-fixture", valid title/description, body ≥300 chars) to main →
Action runs → draft appears in /cms list → file removed from the folder.
Delete the test draft in the CMS UI afterwards.

## Also needed (for the automation's commit access)

Create a fine-grained GitHub PAT: this repo only, permission
"Contents: Read and write", 1-year expiry. The site operator will store it
for the automation. Nothing else — no admin/workflow scopes.
