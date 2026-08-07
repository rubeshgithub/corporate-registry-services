"""
Alberta Registrar's Periodical — bulk archive downloader (2006-2026)

Downloads the text version of every Registrar's Periodical issue into
    data/registrar/<year>/<NN>_<label>_Registrar.cfm
Resume-safe: already-downloaded files are skipped, so you can re-run anytime.

Usage (run from repo root, then go to sleep):
    python scripts/download_registrar_archive.py --from 2006 --to 2026
Optional:
    --pdf     also download the PDF versions (bigger, only needed for archival)
    --delay 2 seconds between requests (default 2 — be polite, it's a gov server)

~24 issues/year x 21 years ≈ 500 files, ~800 KB each → roughly 400 MB of text,
finishes in ~30-60 minutes with the default delay.
"""

import argparse
import pathlib
import sys
import time
import urllib.request

BASE = "https://kings-printer.alberta.ca/documents/gazette/{year}/{kind}/{num:02d}_{label}_Registrar.{ext}"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_END = {"Jan": [31, 30], "Feb": [28, 29], "Mar": [31, 30], "Apr": [30, 29],
             "May": [30, 31, 29], "Jun": [30, 29], "Jul": [31, 30], "Aug": [30, 31, 29],
             "Sep": [30, 29], "Oct": [31, 30], "Nov": [29, 30, 28], "Dec": [30, 31, 29]}
# Mid-month issues are usually the 15th but occasionally the 14th or 16th.
MID = [15, 14, 16]

HEADERS = {"User-Agent": "Mozilla/5.0 (archive research; contact: support@corporateregistryservices.ca)"}


def try_download(url: str, dest: pathlib.Path, min_bytes: int = 10000) -> bool:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
        if len(data) < min_bytes:   # error page / stub
            return False
        dest.write_bytes(data)
        return True
    except Exception:
        return False


def candidates_for_issue(num: int, month: str, is_mid: bool):
    days = MID if is_mid else MONTH_END[month]
    return [f"{month}{d}" for d in days]


INDEX_URL = "https://kings-printer.alberta.ca/alberta_gazette.cfm?page=gazette_{year}_registrar.cfm"
LINK_RE = None  # compiled lazily


def links_from_index(year: int) -> list[str]:
    """Fetch the year's index page and return exact text-file URLs (no guessing)."""
    global LINK_RE
    import re
    if LINK_RE is None:
        LINK_RE = re.compile(r"documents/gazette/\d{4}/text/[\w\-]+_Registrar\.cfm", re.I)
    req = urllib.request.Request(INDEX_URL.format(year=year), headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            html_text = r.read().decode("utf-8", errors="replace")
    except Exception:
        return []
    seen, urls = set(), []
    for m in LINK_RE.finditer(html_text):
        u = "https://kings-printer.alberta.ca/" + m.group(0)
        if u not in seen:
            seen.add(u)
            urls.append(u)
    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="y0", type=int, default=2006)
    ap.add_argument("--to", dest="y1", type=int, default=2026)
    ap.add_argument("--pdf", action="store_true")
    ap.add_argument("--delay", type=float, default=2.0)
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent / "data" / "registrar"
    ok = missing = skipped = 0

    for year in range(args.y0, args.y1 + 1):
        ydir = root / str(year)
        ydir.mkdir(parents=True, exist_ok=True)

        urls = links_from_index(year)
        if not urls:
            print(f"WARN {year}: could not read index page, skipping year", flush=True)
            continue
        print(f"{year}: index lists {len(urls)} issues", flush=True)

        for url in urls:
            fname = url.rsplit("/", 1)[1]
            dest = ydir / fname
            if dest.exists() and dest.stat().st_size > 10000:
                skipped += 1
                continue
            # retry up to 3 times — transient server errors were the main gap cause
            got = False
            for attempt in range(3):
                if try_download(url, dest):
                    print(f"OK   {year} {fname}", flush=True)
                    ok += 1
                    got = True
                    break
                time.sleep(5 * (attempt + 1))
            if not got:
                print(f"MISS {year} {fname} after 3 attempts", flush=True)
                missing += 1
            time.sleep(args.delay)

    print(f"\nDone. downloaded={ok} skipped(existing)={skipped} missing={missing}", flush=True)
    print(f"Files in: {root}", flush=True)
    if missing:
        print("Some issues may use unusual labels or not exist (esp. future dates). "
              "Re-run anytime — existing files are skipped.", flush=True)


if __name__ == "__main__":
    main()
