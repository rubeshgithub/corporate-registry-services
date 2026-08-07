"""
Parse ONE new Registrar's Periodical issue into a dated delta CSV.

Usage (from anywhere):
    python scripts/make_delta.py --file data/registrar/2026/14_Jul31_Registrar.cfm
    python scripts/make_delta.py --file ... --date 2026-08-01   # override date suffix

Writes data/registrar_delta_<date>.csv (same columns as registrar_all_events.csv)
and prints event counts by type. Does NOT touch registrar_companies.csv or the
append-only archive.
"""

import argparse
import csv
import datetime
import pathlib
import sys
from collections import Counter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from parse_registrar_periodical import parse_lines, strip_html  # noqa: E402

FIELDS = ["company_name", "entity_type", "event", "section", "event_date",
          "address", "city", "postal_code", "corp_number", "issue"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="path to one *_Registrar.cfm")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()

    repo = pathlib.Path(__file__).resolve().parent.parent
    src = pathlib.Path(args.file)
    if not src.is_absolute():
        src = repo / src
    if not src.exists():
        sys.exit(f"not found: {src}")

    issue_tag = f"{src.parent.name}/{src.stem}"          # e.g. 2026/14_Jul31_Registrar
    out = repo / "data" / f"registrar_delta_{args.date}.csv"
    if out.exists():
        sys.exit(f"already exists, not overwriting: {out}")

    counts: Counter[str] = Counter()
    raw = src.read_text(encoding="utf-8", errors="replace")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for row in parse_lines(strip_html(raw), issue_tag):
            w.writerow(row)
            ev = row["event"]
            counts["Renamed" if ev.startswith("Renamed") else ev] += 1

    total = sum(counts.values())
    print(f"{issue_tag}: {total} events -> {out}")
    for ev, n in counts.most_common():
        print(f"  {ev}: {n}")


if __name__ == "__main__":
    main()
