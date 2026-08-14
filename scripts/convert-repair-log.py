"""
convert-repair-log.py
------------------------------------------------------------------------------
Converts the airport's maintenance repair log from xlsx into the JSON the app
loads (public/data/repair-log-2025.json), matching RepairLogRecord[] in
src/lib/repair-log.ts.

    python scripts/convert-repair-log.py "path/to/REKAP KERUSAKAN 2025.xlsx"

Committed so the conversion is reproducible and auditable rather than a
one-off someone ran on their laptop. Deliberately Python, not Node: openpyxl
is already available and the repo needs no xlsx dependency for a conversion
that runs once per survey period.

SOURCE FORMAT (verified 2026-08-14)
  Sheet   'Worksheet', header on row 4, 678 data rows
  Header  Unit: North Runway, period 2025-08-01 s/d 2026-02-27
          (actual record dates run 2025-08-30 to 2026-02-26)
  Tanggal is already an ISO date string, so no date coercion happens here.

Every row is emitted, including rows with no distress type and rows whose
facility resolves to no branch. Classifying them is aggregateRepairLog's job
(src/lib/repair-log.ts) and the coverage panel reports the counts - dropping
them here would hide the gap.
------------------------------------------------------------------------------
"""

import json
import sys
from pathlib import Path

import openpyxl

HEADER_ROW = 4
SHEET = "Worksheet"

# Source column -> RepairLogRecord field. Columns absent from this map
# (No, Jumlah Kerusakan) are counts the app re-derives and does not store.
COLUMNS = {
    "Tanggal": "date",
    "Nama Fasilitas": "facility",
    "Lokasi Perbaikan": "location",
    "Jenis Perbaikan": "findingType",
    "Metode Perbaikan": "method",
    "Jenis Kerusakan (Aspal)": "distressAsphalt",
    "Jenis Kerusakan (Beton)": "distressConcrete",
    "Tingkat Kerusakan": "severity",
    "Luas": "areaM2",
    "Volume": "volumeM3",
}

NUMERIC = {"areaM2", "volumeM3"}
# Omitted from the record entirely when blank, rather than stored as "".
# validateRepairLog treats all four as optional; the other fields are required.
OPTIONAL = {"method", "distressAsphalt", "distressConcrete", "severity"}


def convert(xlsx_path: Path) -> list[dict]:
    ws = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)[SHEET]
    rows = list(ws.iter_rows(min_row=HEADER_ROW, values_only=True))
    index = {header: i for i, header in enumerate(rows[0])}

    missing = [c for c in COLUMNS if c not in index]
    if missing:
        raise SystemExit(f"Source sheet is missing expected columns: {missing}")

    records = []
    for row in rows[1:]:
        if row[0] is None:  # trailing blank / total row
            continue
        record = {}
        for column, field in COLUMNS.items():
            value = row[index[column]]
            if field in NUMERIC:
                record[field] = float(value or 0)
            else:
                text = str(value).strip() if value is not None else ""
                if text or field not in OPTIONAL:
                    record[field] = text
        records.append(record)
    return records


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__.strip().splitlines()[4].strip())

    xlsx_path = Path(sys.argv[1])
    out_path = Path(__file__).resolve().parent.parent / "public" / "data" / "repair-log-2025.json"

    records = convert(xlsx_path)
    out_path.write_text(json.dumps(records, indent=1, ensure_ascii=False), encoding="utf-8")

    with_asphalt = sum(1 for r in records if r.get("distressAsphalt"))
    with_concrete = sum(1 for r in records if r.get("distressConcrete"))
    no_distress = sum(1 for r in records if not r.get("distressAsphalt") and not r.get("distressConcrete"))
    print(f"{len(records)} records -> {out_path}")
    print(f"  asphalt distress {with_asphalt}, concrete distress {with_concrete}, neither {no_distress}")


if __name__ == "__main__":
    main()
