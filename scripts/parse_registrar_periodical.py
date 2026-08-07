"""
Alberta Registrar's Periodical parser
Downloads Alberta King's Printer Registrar's Periodical issues (text version)
and extracts corporate registry events to CSV.

Usage:
    python parse_registrar_periodical.py --year 2026            # all issues for a year (network)
    python parse_registrar_periodical.py --year 2026 --issue 11 # one issue (11 = Jun 15)
    python parse_registrar_periodical.py --local data/registrar # parse ALL downloaded files (offline)

--local mode reads the files saved by download_registrar_archive.py and writes:
    registrar_all_events.csv    every parsed event, all years
    registrar_companies.csv     one row per corporate number with latest event = derived status

Output: registrar_YYYY.csv with columns:
    company_name, event_type, event_date, address, city, postal_code, corp_number, issue

Run this on your own machine. Review King's Printer copyright terms
(https://kings-printer.alberta.ca/copyright.cfm) before any commercial
republication of the data — indexing for your own outreach/analysis is a
different posture than rebuilding a public site; get advice for the latter.
"""

import argparse
import csv
import html
import re
import sys
import time
import urllib.request

BASE = "https://kings-printer.alberta.ca/documents/gazette/{year}/text/{num:02d}_{label}_Registrar.cfm"

# Issue labels: (number, label) — 15th and last day of each month.
# Month-end label varies (28/29/30/31); the script tries candidates.
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_END = {"Jan": [31], "Feb": [28, 29], "Mar": [31], "Apr": [30], "May": [30, 31],
             "Jun": [30], "Jul": [31], "Aug": [30, 31], "Sep": [30], "Oct": [31],
             "Nov": [29, 30], "Dec": [30, 31]}

# One notice per line, e.g.:
# "ACME WIDGETS INC. Named Alberta Corporation Incorporated 2026 MAY 12 Registered
#  Address: 123 MAIN ST NW, CALGARY ALBERTA, T2P1A1. No: 2812345678."
NOTICE_RE = re.compile(
    r"^(?P<name>.+?)\.\s+"
    r"(?P<type>Named Alberta Corporation|Numbered Alberta Corporation|Federal Corporation|"
    r"Other Prov/Territory Corps|Alberta Society|Non-Profit.*?|Cooperative|Partnership|"
    r"Extra-Provincial.*?|Religious Society|.*?Corporation|.*?Company)\s+"
    r"(?P<event>Registered|Incorporated|Continued|Amalgamated|Struck|Dissolved|Revived|"
    r"Restored|Amended|Changed)\b.*?"
    r"(?P<date>20\d\d\s+[A-Z]{3}\s+\d{1,2})\s+"
    r"(?:Registered Address:\s*(?P<addr>.+?)\.\s*)?"
    r"No:\s*(?P<num>\d+)\.?\s*$",
    re.IGNORECASE,
)

CITY_RE = re.compile(r",\s*([A-Z .'-]+?)\s+ALBERTA\s*,?\s*(?P<pc>[A-Z]\d[A-Z]\s?\d[A-Z]\d)?\s*$", re.I)


def issue_urls(year: int, only_issue: int | None = None):
    num = 0
    for m in MONTHS:
        # 15th issue
        num += 1
        if only_issue is None or num == only_issue:
            yield num, [BASE.format(year=year, num=num, label=f"{m}15")]
        # month-end issue
        num += 1
        if only_issue is None or num == only_issue:
            yield num, [BASE.format(year=year, num=num, label=f"{m}{d}") for d in MONTH_END[m]]


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (research; contact: you@example.com)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def strip_html(raw: str) -> list[str]:
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
    raw = re.sub(r"<br\s*/?>|</p>|</div>|</td>", "\n", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(raw)
    return [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]


NAME_CHANGE_RE = re.compile(
    r"^(?P<old>.+?)\.\s+(?P<type>.+?)\s+(?:Registered|Incorporated|Continued)\s+"
    r"20\d\d\s+[A-Z]{3,4}\s+\d{1,2}\.?\s*New Name:\s*(?P<new>.+?)\.\s*"
    r"Effective Date:\s*(?P<date>20\d\d\s+[A-Z]{3,4}\s+\d{1,2})\.\s*No:\s*(?P<num>\d+)\.?\s*$",
    re.IGNORECASE,
)
INTENT_RE = re.compile(
    r"^(?P<acct>\d{9,})\s+(?P<name>.+?)\.?\s+(?P<date>20\d\d\s+[A-Z]{3,4}\s+\d{1,2})\.?\s*$"
)
REVIVED_RE = re.compile(
    r"^(?P<name>.+?)\.\s+.*?\bRevived\s+(?P<date>20\d\d\s+[A-Z]{3,4}\s+\d{1,2})\.\s*No:\s*(?P<num>\d+)\.?\s*$",
    re.IGNORECASE,
)
DEFAULT_DATE_RE = re.compile(r"(20\d\d\s+[A-Z]{3,4}\s+\d{1,2})\.?\s+unless otherwise indicated", re.I)
NAME_ONLY_RE = re.compile(r"^(?P<name>[0-9A-Z][^a-z]{2,110}?)(?:\s+(?P<date>20\d\d\s+[A-Z]{3,4}\s+\d{1,2})\.?)?$")
AMALG_START_RE = re.compile(r"were on\s+(20\d\d\s+[A-Z]{3,4}\s+\d{1,2})\s+amalgamated as one corporation under the name", re.I)
AMALG_NUM_RE = re.compile(r"^No\.?\s*(\d+)\.?\s*$", re.I)

SECTION_HEADERS = [
    ("registrations, incorporations", "registered"),
    ("corporate name changes", "name_change"),
    ("certificate of intent to dissolve", "intent_to_dissolve"),
    ("liable for dissolution", "liable_for_dissolution"),
    ("corporations dissolved", "dissolved_struck_off"),
    ("revived/reinstated", "revived"),
    ("notices of amalgamation", "amalgamation"),
]


def _row(issue_tag, section, name, event, date, num="", etype="", addr=""):
    city, pc = "", ""
    cm = CITY_RE.search(addr) if addr else None
    if cm:
        city, pc = cm.group(1).title().strip(), (cm.group("pc") or "").strip()
    return {
        "company_name": name.strip().rstrip("."),
        "entity_type": etype.strip(),
        "event": event,
        "section": section,
        "event_date": date.strip(),
        "address": addr,
        "city": city,
        "postal_code": pc,
        "corp_number": num,
        "issue": issue_tag,
    }


def parse_lines(lines: list[str], issue_tag: str):
    section = ""
    default_date = ""
    amalg_date, amalg_name = None, []

    for ln in lines:
        low = ln.lower()
        for key, sec in SECTION_HEADERS:
            if key in low and len(ln) < 120:
                section = sec
                default_date = ""
                amalg_date, amalg_name = None, []
                break

        dm = DEFAULT_DATE_RE.search(ln)
        if dm:
            default_date = dm.group(1)
            continue
        if not ln or ln.startswith("(") or " Act" in ln:
            continue

        if section == "registered":
            m = NOTICE_RE.match(ln)
            if m:
                yield _row(issue_tag, section, m.group("name"),
                           m.group("event").title(), m.group("date"),
                           m.group("num"), m.group("type"), (m.group("addr") or "").strip())

        elif section == "name_change":
            m = NAME_CHANGE_RE.match(ln)
            if m:
                # one event for the new name; keep old name in entity_type slot? no — separate field misuse avoided:
                yield _row(issue_tag, section, m.group("new"),
                           f"Renamed (was: {m.group('old').strip()})",
                           m.group("date"), m.group("num"), m.group("type"))

        elif section == "intent_to_dissolve":
            m = INTENT_RE.match(ln)
            if m:
                yield _row(issue_tag, section, m.group("name"),
                           "Intent To Dissolve", m.group("date"), m.group("acct"))

        elif section in ("liable_for_dissolution", "dissolved_struck_off"):
            m = NAME_ONLY_RE.match(ln)
            if m and len(m.group("name")) > 2:
                event = "Liable For Dissolution" if section == "liable_for_dissolution" else "Dissolved/Struck Off"
                yield _row(issue_tag, section, m.group("name"),
                           event, m.group("date") or default_date)

        elif section == "revived":
            m = REVIVED_RE.match(ln)
            if m:
                yield _row(issue_tag, section, m.group("name"),
                           "Revived", m.group("date"), m.group("num"))

        elif section == "amalgamation":
            sm = AMALG_START_RE.search(ln)
            if sm:
                amalg_date, amalg_name = sm.group(1), []
                continue
            if amalg_date is not None:
                nm = AMALG_NUM_RE.match(ln)
                if nm and amalg_name:
                    yield _row(issue_tag, section, " ".join(amalg_name),
                               "Amalgamated", amalg_date, nm.group(1))
                    amalg_date, amalg_name = None, []
                elif len(amalg_name) < 3 and NAME_ONLY_RE.match(ln):
                    amalg_name.append(ln.strip())
                else:
                    amalg_date, amalg_name = None, []


MONTH_NUM = {m.upper(): i + 1 for i, m in enumerate(MONTHS)}


def sort_key(date_str: str) -> tuple:
    # "2026 MAY 15" -> (2026, 5, 15); unparseable dates sort first
    try:
        y, mon, d = date_str.split()
        return (int(y), MONTH_NUM.get(mon.upper()[:3], 0), int(d))
    except Exception:
        return (0, 0, 0)


def run_local(local_dir: str):
    import pathlib
    root = pathlib.Path(local_dir)
    files = sorted(root.rglob("*_Registrar.cfm"))
    if not files:
        print(f"no *_Registrar.cfm files under {root}", file=sys.stderr)
        sys.exit(1)

    fields = ["company_name", "entity_type", "event", "section", "event_date",
              "address", "city", "postal_code", "corp_number", "issue"]
    companies: dict[str, dict] = {}
    total = 0

    with open("registrar_all_events.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for path in files:
            issue_tag = f"{path.parent.name}/{path.stem}"
            raw = path.read_text(encoding="utf-8", errors="replace")
            n = 0
            for row in parse_lines(strip_html(raw), issue_tag):
                w.writerow(row)
                n += 1
                # name-only notices (liable/dissolved lists) have no corp number —
                # key them by name so they don't collapse into one record
                key = row["corp_number"] or ("name:" + row["company_name"].upper())
                prev = companies.get(key)
                if prev is None or sort_key(row["event_date"]) >= sort_key(prev["last_event_date"]):
                    companies[key] = {
                        "corp_number": key,
                        "company_name": row["company_name"],
                        "entity_type": row["entity_type"],
                        "derived_status": row["event"],
                        "last_event_date": row["event_date"],
                        "last_event_section": row["section"],
                        "address": row["address"] or (prev or {}).get("address", ""),
                        "city": row["city"] or (prev or {}).get("city", ""),
                        "postal_code": row["postal_code"] or (prev or {}).get("postal_code", ""),
                        "last_issue": issue_tag,
                    }
            total += n
            print(f"{issue_tag}: {n} events", file=sys.stderr)

    cfields = ["corp_number", "company_name", "entity_type", "derived_status",
               "last_event_date", "last_event_section", "address", "city",
               "postal_code", "last_issue"]
    with open("registrar_companies.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cfields)
        w.writeheader()
        for row in companies.values():
            w.writerow(row)

    print(f"done: {total} events -> registrar_all_events.csv; "
          f"{len(companies)} companies -> registrar_companies.csv", file=sys.stderr)
    print("note: derived_status is inferred from the LAST gazetted event only — "
          "verify anything actionable against a live registry lookup.", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--issue", type=int, default=None, help="issue number 1-24")
    ap.add_argument("--local", type=str, default=None,
                    help="parse downloaded files from this directory (offline mode)")
    args = ap.parse_args()

    if args.local:
        run_local(args.local)
        return
    if args.year is None:
        ap.error("--year is required unless --local is used")

    out = f"registrar_{args.year}.csv"
    fields = ["company_name", "entity_type", "event", "section", "event_date",
              "address", "city", "postal_code", "corp_number", "issue"]
    total = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for num, candidates in issue_urls(args.year, args.issue):
            raw = None
            for url in candidates:
                raw = fetch(url)
                if raw and len(raw) > 10000:
                    print(f"issue {num:02d}: {url}", file=sys.stderr)
                    break
            if not raw or len(raw) <= 10000:
                print(f"issue {num:02d}: not found/published yet, skipping", file=sys.stderr)
                continue
            n = 0
            for row in parse_lines(strip_html(raw), f"{args.year}-{num:02d}"):
                w.writerow(row)
                n += 1
            total += n
            print(f"issue {num:02d}: {n} events", file=sys.stderr)
            time.sleep(2)  # be polite to the server
    print(f"done: {total} events -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
