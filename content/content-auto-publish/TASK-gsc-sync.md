# Task: Daily GSC data sync into the repo

## Why

The Claude cloud automation that writes weekly SEO articles clones this repo
on every run. Google's APIs are blocked from its sandbox, but GitHub Actions
have full egress — so a daily Action pulls Search Console data and commits it
to `automation/gsc/`, giving the automation fresh ranking data automatically.

## One-time Google setup (site operator does this, ~10 min)

1. console.cloud.google.com → create/select a project → enable **Google Search Console API**
2. IAM & Admin → Service Accounts → create `gsc-sync` → create a **JSON key**, download it
3. In Search Console (search.google.com/search-console) → Settings → Users and permissions → **Add user** = the service account's email (`gsc-sync@<project>.iam.gserviceaccount.com`), permission: Full (or Restricted — read is enough)
4. Repo → Settings → Secrets → Actions → new secret **`GSC_SA_KEY`** = the entire JSON key file content

## Workflow: `.github/workflows/gsc-sync.yml`

```yaml
name: Daily GSC sync
on:
  schedule:
    - cron: "30 9 * * *"   # 09:30 UTC daily (~3:30am Edmonton), after GSC's data day closes
  workflow_dispatch: {}
permissions:
  contents: write
concurrency:
  group: gsc-sync
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip -q install google-api-python-client google-auth
      - name: Pull last 28 days of query + page data
        env:
          GSC_SA_KEY: ${{ secrets.GSC_SA_KEY }}
          SITE: "sc-domain:corporateregistryservices.ca"   # or "https://www.corporateregistryservices.ca/" if URL-prefix property
        run: |
          python - <<'PY'
          import json, os, datetime
          from google.oauth2 import service_account
          from googleapiclient.discovery import build
          creds = service_account.Credentials.from_service_account_info(
              json.loads(os.environ["GSC_SA_KEY"]),
              scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
          svc = build("searchconsole", "v1", credentials=creds)
          end = datetime.date.today() - datetime.timedelta(days=2)   # GSC lags ~2 days
          start = end - datetime.timedelta(days=27)
          out = {"site": os.environ["SITE"], "start": str(start), "end": str(end),
                 "generated_at": datetime.datetime.utcnow().isoformat() + "Z"}
          for dim in (["query"], ["page"], ["page", "query"]):
              rows = svc.searchanalytics().query(siteUrl=os.environ["SITE"], body={
                  "startDate": str(start), "endDate": str(end),
                  "dimensions": dim, "rowLimit": 1000}).execute().get("rows", [])
              out["_".join(dim)] = rows
          os.makedirs("automation/gsc", exist_ok=True)
          json.dump(out, open("automation/gsc/latest.json", "w"), indent=1)
          print(f"queries:{len(out.get('query',[]))} pages:{len(out.get('page',[]))}")
          PY
      - name: Commit if changed
        run: |
          git config user.name "gsc-sync[bot]"
          git config user.email "actions@users.noreply.github.com"
          git add automation/gsc/latest.json
          git diff --cached --quiet || { git commit -m "chore: daily GSC sync [skip ci]"; git push; }
```

## Notes

- `SITE` must match the property type in Search Console: domain property → `sc-domain:corporateregistryservices.ca`; URL-prefix property → the exact prefix URL.
- 28-day window, top 1000 rows per dimension set — enough for prioritization; keeps the file small. Only `latest.json` is kept (each sync overwrites), so the repo doesn't grow.
- Ensure the site build ignores `automation/**` so this commit doesn't trigger deploys (the relay task already established this).
- Acceptance test: run the workflow manually (workflow_dispatch) → `automation/gsc/latest.json` appears with non-empty `query` rows.
