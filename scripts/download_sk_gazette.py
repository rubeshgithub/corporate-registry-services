"""
Saskatchewan Gazette Part I — bulk archive downloader (2010 → March 2023)

Corporate Registry Notices were published weekly in Gazette Part I until
The Business Corporations Act, 2021 came into force on 2023-03-12 (the
requirement to gazette corporate events was removed; last issues with the
section are early-to-mid March 2023). This script downloads every Part I
PDF in the requested window into:

    data/sk_gazette/<year>/G1_<YYYY-MM-DD>_p<productId>.pdf

Resume-safe: already-downloaded files are skipped, so re-run anytime.

Source: Saskatchewan Publications Centre REST API (verified July 2026):
    GET /api/v1/categories/1511?statusType=ACTIVE
        -> childCategories = one category per year ("2026", "2025", ...)
    GET /api/v1/categories/<yearCatId>?statusType=ACTIVE
        -> childCategories includes "Part I (1/Notices)" (name varies slightly)
    GET /api/v1/categories/<partICatId>/products
        -> JSON array of products; product.name like "Gazette Part I, May 1, 2026",
           product.customIdentifier like "2026-05-01 Part I"
    GET /api/v1/products/<productId>
        -> productFormats[0].productFormatId
    GET /api/v1/products/<productId>/formats/<formatId>/download
        -> the PDF

Usage (run from repo root):
    python scripts/download_sk_gazette.py --from 2010 --to 2023
Optional:
    --delay 2      seconds between requests (default 2 — be polite)
    --cutoff 2023-03-31   skip issues dated after this (default; the corp
                          section is gone after mid-March 2023 anyway)
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.request

API = "https://publications.saskatchewan.ca/api/v1"
GAZETTE_CATEGORY = 1511
HEADERS = {
    "User-Agent": "Mozilla/5.0 (archive research; contact: support@corporateregistryservices.ca)",
    "Accept": "application/json",
}

PART_I_RE = re.compile(r"part\s*i\b(?!i)", re.I)   # matches "Part I", not "Part II"/"Part III"
NAME_DATE_RE = re.compile(r"Gazette Part I,\s*(\w+)\s+(\d{1,2}),\s*(\d{4})", re.I)
CUSTOM_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"])}


def get_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={**HEADERS, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def issue_date(product: dict) -> dt.date | None:
    m = CUSTOM_DATE_RE.search(product.get("customIdentifier") or "")
    if m:
        return dt.date.fromisoformat(m.group(1))
    m = NAME_DATE_RE.search(product.get("name") or "")
    if m and m.group(1) in MONTHS:
        return dt.date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="frm", type=int, default=2010)
    ap.add_argument("--to", dest="to", type=int, default=2023)
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--cutoff", default="2023-03-31",
                    help="skip issues after this date (YYYY-MM-DD); corp notices end 2023-03-12")
    args = ap.parse_args()
    cutoff = dt.date.fromisoformat(args.cutoff)

    out_root = pathlib.Path("data/sk_gazette")
    out_root.mkdir(parents=True, exist_ok=True)

    root = get_json(f"{API}/categories/{GAZETTE_CATEGORY}?statusType=ACTIVE")
    years = {c["nameEnglish"].strip(): c["categoryId"]
             for c in root.get("childCategories", [])
             if re.fullmatch(r"\d{4}", (c.get("nameEnglish") or "").strip())}

    total_new = total_skip = total_err = 0
    for year in range(args.frm, args.to + 1):
        ycat = years.get(str(year))
        if ycat is None:
            print(f"[{year}] no year category on Publications Centre — skipping")
            continue
        time.sleep(args.delay)
        ynode = get_json(f"{API}/categories/{ycat}?statusType=ACTIVE")
        part1 = [c for c in ynode.get("childCategories", [])
                 if PART_I_RE.search(c.get("nameEnglish") or "")]
        if not part1:
            print(f"[{year}] no 'Part I' subcategory found — skipping")
            continue

        ydir = out_root / str(year)
        ydir.mkdir(parents=True, exist_ok=True)

        for pcat in part1:
            time.sleep(args.delay)
            products = get_json(f"{API}/categories/{pcat['categoryId']}/products")
            products = products if isinstance(products, list) else []
            print(f"[{year}] {pcat['nameEnglish']!r}: {len(products)} issues listed")
            for p in sorted(products, key=lambda x: issue_date(x) or dt.date.min):
                d = issue_date(p)
                pid = p.get("productId")
                if d is None or pid is None:
                    print(f"  !? cannot read date/id for {str(p.get('name'))[:60]!r}")
                    total_err += 1
                    continue
                if d > cutoff:
                    continue
                dest = ydir / f"G1_{d.isoformat()}_p{pid}.pdf"
                if dest.exists() and dest.stat().st_size > 20000:
                    total_skip += 1
                    continue
                try:
                    time.sleep(args.delay)
                    detail = get_json(f"{API}/products/{pid}")
                    fmts = detail.get("productFormats") or []
                    if not fmts:
                        raise RuntimeError("no productFormats")
                    fid = fmts[0].get("productFormatId") or fmts[0].get("id")
                    time.sleep(args.delay)
                    data = get_bytes(f"{API}/products/{pid}/formats/{fid}/download")
                    if len(data) < 20000 or not data.startswith(b"%PDF"):
                        raise RuntimeError(f"suspicious payload ({len(data)} bytes)")
                    dest.write_bytes(data)
                    total_new += 1
                    print(f"  + {dest.name} ({len(data)//1024} KB)")
                except Exception as e:
                    total_err += 1
                    print(f"  ! {d} product {pid}: {e}")

    print(f"\nDone. downloaded={total_new} skipped(existing)={total_skip} errors={total_err}")
    if total_err:
        print("Re-run to retry errors (resume-safe).")
        sys.exit(1)


if __name__ == "__main__":
    main()
