"""
Saskatchewan Gazette Part I — Corporate Registry Notices parser

Parses the PDFs downloaded by download_sk_gazette.py and writes one CSV of
corporate events (incorporations, registrations, amalgamations, continuances,
amendments/name changes, discontinuances, dissolutions, revivals) from the
CORPORATE REGISTRY NOTICES section that existed until ~2023-03-12.

Unlike Alberta's Registrar Periodical, SK entries are TABLES with columns
(Name | Date | Mailing Address | Main Type of Business, varying per section),
so this parser is coordinate-based: it uses pdfplumber word positions and
derives column boundaries from each section's header row ("Name/Nom:" ...).

Usage (run from repo root):
    pip install pdfplumber
    python scripts/parse_sk_gazette.py --local data/sk_gazette            # all issues
    python scripts/parse_sk_gazette.py --local data/sk_gazette/2022 --debug
    python scripts/parse_sk_gazette.py --file data/sk_gazette/2022/G1_2022-03-18_p134480.pdf --debug

Output: data/sk_gazette_events.csv with columns:
    company_name, entity_type, event, section, event_date, address, city,
    postal_code, corp_number, issue, business_type, detail

Notes / known limitations:
  - SK notices do NOT print a corporation number for named companies.
    Numbered companies ("102144437 Saskatchewan Inc.") get corp_number from
    the name itself; everything else is matched downstream by name.
  - "CERTIFICATES OF AMENDMENT" rows become event=Renamed (detail holds the
    'changed name to X' text) or event=Amended for other amendments.
  - Issues before ~2005 may be image scans; those pages yield no words and
    are reported so you can OCR them separately if ever needed.
"""

import argparse
import csv
import datetime as dt
import pathlib
import re
import sys
from collections import defaultdict

# ---------------------------------------------------------------- constants

# 2013+ issues say "CORPORATE REGISTRY NOTICES"; ~2012 and earlier say
# "CORPORATIONS BRANCH NOTICES" (often with a trailing underscore rule).
START_RE = re.compile(r"CORPORATE REGISTRY NOTICES|CORPORATIONS BRANCH NOTICES", re.I)
END_RE = re.compile(r"PUBLIC NOTICES|NOTICE TO ADVERTISERS", re.I)

ACT_RES = [
    (re.compile(r"The Business Corporations Act", re.I), "Business Corporation"),
    (re.compile(r"The Business Names Registration Act", re.I), "Business Name"),
    (re.compile(r"The Non-?profit Corporations Act", re.I), "Non-profit Corporation"),
    (re.compile(r"The Co-?operatives Act", re.I), "Cooperative"),
    (re.compile(r"The New Generation Co-?operatives Act", re.I), "Cooperative"),
]

SECTION_EVENTS = [
    (re.compile(r"CERTIFICATES? OF INCORPORATION", re.I), "Incorporated"),
    (re.compile(r"CERTIFICATES? OF REGISTRATION|CERTIFICATES? OF RENEWAL", re.I), "Registered"),
    (re.compile(r"CERTIFICATES? OF AMALGAMATION", re.I), "Amalgamated"),
    (re.compile(r"CERTIFICATES? OF CONTINUANCE", re.I), "Continued"),
    (re.compile(r"CERTIFICATES? OF AMENDMENT", re.I), "Amended"),
    (re.compile(r"CERTIFICATES? OF DISCONTINUANCE", re.I), "Discontinued"),
    (re.compile(r"CERTIFICATES? OF DISSOLUTION", re.I), "Dissolved"),
    (re.compile(r"CERTIFICATES? OF REVIVAL|CERTIFICATES? OF RESTORATION", re.I), "Revived"),
    # pre-2013 "Corporations Branch" era headings
    (re.compile(r"RESTORED TO THE REGISTER", re.I), "Revived"),
    (re.compile(r"STRUCK OFF THE REGISTER", re.I), "Struck Off"),
    (re.compile(r"CERTIFICATES? OF ALTERNATE NAME", re.I), "Alternate Name"),
]

# header label keywords -> canonical field
# (bilingual "Name/Nom:" in 2013+, plain "Name:" / "Name(s):" pre-2013)
HEADER_FIELDS = [
    (re.compile(r"^Names?\s*[(/:]", re.I), "name"),
    (re.compile(r"^Date[/:]", re.I), "date"),
    (re.compile(r"^Jurisdiction[/:]", re.I), "jurisdiction"),
    (re.compile(r"^Mailing", re.I), "address"),
    (re.compile(r"^Head", re.I), "address"),          # Head or Registered Office
    (re.compile(r"^Main", re.I), "business_type"),    # Main Type of Business
    (re.compile(r"^Incorporating", re.I), "jurisdiction"),
    (re.compile(r"^Precontinuance", re.I), "jurisdiction"),
    (re.compile(r"^New\b", re.I), "jurisdiction"),    # New Jurisdiction (discontinuance)
    (re.compile(r"^Amalgamating", re.I), "amalgamating"),
    (re.compile(r"^Amendment[/:]", re.I), "detail"),
]

DATE_RE = re.compile(
    r"^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|Jne|July?|Jly|"
    r"Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})$")
MONTH_NUM = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "june": 6,
             "jne": 6, "jul": 7, "july": 7, "jly": 7, "aug": 8, "sep": 9, "sept": 9,
             "oct": 10, "nov": 11, "dec": 12}
YEAR_RE = re.compile(r"^\((\d{4})\)$")
PAGEHEAD_RE = re.compile(r"THE SASKATCHEWAN GAZETTE|^\d{1,4}$")
CHANGED_NAME_RE = re.compile(r"changed name to (.+)$", re.I)
NUMBERED_RE = re.compile(r"^(\d{6,9})\s+Saskatchewan\b", re.I)
POSTAL_RE = re.compile(r"\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b")


def norm_date(tok: str, year: int) -> str:
    m = DATE_RE.match(tok.strip())
    if not m or not year:
        return tok.strip()
    mon = MONTH_NUM.get(m.group(1).lower()[:4].rstrip("."), None) or \
        MONTH_NUM.get(m.group(1).lower()[:3], 0)
    try:
        return dt.date(year, mon, int(m.group(2))).isoformat()
    except Exception:
        return tok.strip()


def split_city(address: str):
    addr = " ".join(address.split())
    pc = ""
    m = POSTAL_RE.search(addr)
    if m:
        pc = m.group(1).replace(" ", "")
        addr = POSTAL_RE.sub("", addr).rstrip(" ,")
    city = ""
    parts = [p.strip() for p in addr.split(",") if p.strip()]
    if len(parts) >= 2:
        last = parts[-1]
        last = re.sub(r"\b(SK|AB|BC|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)\.?$", "", last).strip()
        if last and not any(ch.isdigit() for ch in last):
            city = last
    return addr, city, pc


# ---------------------------------------------------------------- pdf lines

def page_lines(page):
    """Group pdfplumber words into visual lines: [(top, [(x0, text), ...])]."""
    words = page.extract_words(x_tolerance=1.5, y_tolerance=2.5, keep_blank_chars=False)
    rows = defaultdict(list)
    for w in words:
        rows[round(w["top"] / 3)].append(w)   # 3pt bucket
    lines = []
    for key in sorted(rows):
        ws = sorted(rows[key], key=lambda w: w["x0"])
        lines.append((min(w["top"] for w in ws), ws))
    return lines


def line_text(ws):
    return " ".join(w["text"] for w in ws)


class Table:
    """Column layout derived from a 'Name/Nom:' header line."""

    def __init__(self, header_words):
        cols = []
        for w in header_words:
            for rx, field in HEADER_FIELDS:
                if rx.match(w["text"]):
                    cols.append((w["x0"], field))
                    break
        # dedupe fields keeping first x0; sort by x
        seen = {}
        for x, f in sorted(cols):
            seen.setdefault(f, x)
        self.cols = sorted(((x, f) for f, x in seen.items()))

    def ok(self):
        fields = [f for _, f in self.cols]
        return "name" in fields and "date" in fields and len(self.cols) >= 2

    def bucket(self, ws):
        """Assign words of one line to fields. Returns {field: text}."""
        out = defaultdict(list)
        bounds = [x for x, _ in self.cols] + [10 ** 9]
        for w in ws:
            cx = w["x0"] + 1.0
            for i, (x, f) in enumerate(self.cols):
                if x - 8 <= cx < bounds[i + 1] - 8:
                    out[f].append(w["text"])
                    break
            else:
                # left of first column (rare) -> treat as name
                out[self.cols[0][1]].append(w["text"])
        return {f: " ".join(t) for f, t in out.items()}


# ---------------------------------------------------------------- issue parse

def parse_issue(pdf_path: pathlib.Path, debug=False):
    import pdfplumber

    issue_tag = pdf_path.stem  # G1_2022-03-18_p134480
    rows_out, empty_pages = [], 0
    in_section = False
    act = ""
    event, section_name = "", ""
    year = 0
    table = None
    current = None   # accumulating record: {field: [parts]}

    def flush():
        nonlocal current
        if not current:
            return
        rec = {f: " ".join(" ".join(p.split()) for p in v if p).strip()
               for f, v in current.items()}
        current = None
        name = rec.get("name", "").strip(" .")
        if not name or name.lower().startswith("name/"):
            return
        date = norm_date(rec.get("date", ""), year)
        addr, city, pc = split_city(rec.get("address", ""))
        detail = rec.get("detail", "") or rec.get("amalgamating", "")
        ev = event
        if ev == "Amended":
            m = CHANGED_NAME_RE.search(detail)
            if m:
                ev = f"Renamed (now: {m.group(1).strip(' .')})"
        etype = act
        juris = rec.get("jurisdiction", "")
        if juris and event == "Registered":
            etype = f"{act} ({juris})"
        corp_num = ""
        m = NUMBERED_RE.match(name)
        if m:
            corp_num = m.group(1)
        rows_out.append({
            "company_name": name,
            "entity_type": etype,
            "event": ev,
            "section": section_name,
            "event_date": date,
            "address": addr,
            "city": city,
            "postal_code": pc,
            "corp_number": corp_num,
            "issue": issue_tag,
            "business_type": rec.get("business_type", ""),
            "detail": detail if event != "Amended" else rec.get("detail", ""),
        })

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            lines = page_lines(page)
            if not lines:
                empty_pages += 1
                continue
            for top, ws in lines:
                # strip trailing underscore rules ("(2009) ______", heading bars)
                text = re.sub(r"[_\s]+$", "", line_text(ws)).strip()
                if not text or re.fullmatch(r"_+", text):
                    continue
                if not in_section:
                    if START_RE.search(text) and len(text) < 150:
                        in_section = True
                    continue
                if END_RE.search(text) and len(text) < 60:
                    flush()
                    in_section = False
                    continue
                if PAGEHEAD_RE.search(text) and len(text) < 60:
                    continue
                ym = YEAR_RE.match(text)
                if ym:
                    flush()
                    year = int(ym.group(1))
                    continue
                matched = False
                for rx, label in ACT_RES:
                    if rx.search(text) and len(text) < 130:
                        flush()
                        act, matched = label, True
                        break
                if matched:
                    continue
                for rx, ev in SECTION_EVENTS:
                    if rx.search(text) and len(text) < 120:
                        flush()
                        event, section_name = ev, text.split("/")[0].strip().title()
                        table = None
                        matched = True
                        break
                if matched:
                    continue
                # unknown certificate heading -> still start a fresh section
                if re.match(r"^CERTIFICATES?\s+OF\b", text) and len(text) < 120:
                    flush()
                    event = section_name = text.split("/")[0].strip().title()
                    table = None
                    continue
                if re.match(r"^(Business\s+)?Names?\s*[(/:]", text):
                    flush()
                    t = Table(ws)
                    if t.ok():
                        table = t
                    continue
                if table is None or not event:
                    continue
                # header continuation lines ("Date:", "Adresse postale:", ...)
                if re.match(r"^(Date:|Corporations?/|Sociétés|Jurisdiction/|Autorité|Act/|"
                            r"Office/|Siège|social|enregistré|Adresse|type d|Business/|"
                            r"Principal|législative|fusionnantes|Modification|préalable|"
                            r"prorogation|Nouvelle)", text):
                    continue
                cells = table.bucket(ws)
                if DATE_RE.match(cells.get("date", "").strip()):
                    flush()
                    current = defaultdict(list)
                if current is None:
                    # stray line before first dated row (wrapped header etc.)
                    continue
                for f, t in cells.items():
                    if t:
                        current[f].append(t)
    flush()
    return rows_out, empty_pages


# ---------------------------------------------------------------- main

FIELDNAMES = ["company_name", "entity_type", "event", "section", "event_date",
              "address", "city", "postal_code", "corp_number", "issue",
              "business_type", "detail"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", help="directory of PDFs (recursive)")
    ap.add_argument("--file", help="single PDF")
    ap.add_argument("--out", default="data/sk_gazette_events.csv")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        sys.exit("pdfplumber missing:  pip install pdfplumber")

    if args.file:
        files = [pathlib.Path(args.file)]
    elif args.local:
        files = sorted(pathlib.Path(args.local).rglob("G1_*.pdf"))
    else:
        sys.exit("give --local <dir> or --file <pdf>")
    if not files:
        sys.exit("no G1_*.pdf files found")

    all_rows, scanned = [], []
    for i, f in enumerate(files, 1):
        try:
            rows, empty = parse_issue(f, debug=args.debug)
        except Exception as e:
            print(f"[{i}/{len(files)}] {f.name}: ERROR {e}")
            continue
        all_rows.extend(rows)
        if empty > 2 and not rows:
            scanned.append(f.name)
        if args.debug or i % 25 == 0 or rows == []:
            by_ev = defaultdict(int)
            for r in rows:
                by_ev[r["event"].split(" (")[0]] += 1
            print(f"[{i}/{len(files)}] {f.name}: {len(rows)} events "
                  f"{dict(by_ev) if args.debug else ''}")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        w.writeheader()
        w.writerows(all_rows)

    by_ev = defaultdict(int)
    for r in all_rows:
        by_ev[r["event"].split(" (")[0]] += 1
    print(f"\n{len(all_rows)} events from {len(files)} issues -> {out}")
    for ev, n in sorted(by_ev.items(), key=lambda x: -x[1]):
        print(f"  {ev:<14} {n}")
    if scanned:
        print(f"\n{len(scanned)} issue(s) look like image scans (no text): "
              + ", ".join(scanned[:10]) + ("..." if len(scanned) > 10 else ""))


if __name__ == "__main__":
    main()
