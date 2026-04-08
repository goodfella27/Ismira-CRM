#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


STAGES = [
    ("consultation", "CONSULTATION", 0),
    ("uploaded", "UPLOADED", 1),
    ("ready", "READY TO GO", 2),
    ("pre-screen", "PRE-SCREEN", 3),
    ("reminder", "REMINDER", 4),
    ("tofollowup", "TOFOLLOWUP", 5),
    ("no-show", "NO SHOW PRE...", 6),
    ("needs-improve", "NEED IMPROVE...", 7),
]


def as_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_dt(raw: str) -> str | None:
    value = raw.strip()
    if not value:
        return None
    # HubSpot exports commonly use: YYYY-MM-DD HH:MM
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return value  # let Postgres try to parse it


def compact(obj: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in obj.items() if v not in ("", None, [], {}, ())}


@dataclass(frozen=True)
class CompanyRow:
    record_id: str
    name: str
    owner: str
    created_at: str | None
    phone: str
    last_activity_at: str | None
    city: str
    country: str
    industry: str


def read_companies(path: Path) -> list[CompanyRow]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows: list[CompanyRow] = []
        for row in reader:
            record_id = as_str(row.get("Record ID"))
            name = as_str(row.get("Company name"))
            owner = as_str(row.get("Company owner"))
            created_at = parse_dt(as_str(row.get("Create Date")))
            phone = as_str(row.get("Phone Number"))
            last_activity_at = parse_dt(as_str(row.get("Last Activity Date")))
            city = as_str(row.get("City"))
            country = as_str(row.get("Country/Region"))
            industry = as_str(row.get("Industry"))

            if not record_id or not name:
                continue

            rows.append(
                CompanyRow(
                    record_id=record_id,
                    name=name,
                    owner=owner,
                    created_at=created_at,
                    phone=phone,
                    last_activity_at=last_activity_at,
                    city=city,
                    country=country,
                    industry=industry,
                )
            )
    return rows


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("companies.csv")
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("companies-import.sql")

    companies = read_companies(csv_path)
    if not companies:
        print("No companies found.")
        return 1

    lines: list[str] = []
    lines.append("-- Generated from companies.csv")
    lines.append("begin;")
    lines.append("")
    lines.append(
        "insert into pipelines (id, name) values ('companies', 'Companies') "
        "on conflict (id) do nothing;"
    )
    lines.append("")
    for stage_id, stage_name, order in STAGES:
        lines.append(
            "insert into pipeline_stages (pipeline_id, id, name, \"order\") values "
            f"('companies', {sql_str(stage_id)}, {sql_str(stage_name)}, {order}) "
            "on conflict (pipeline_id, id) do update set "
            "name = excluded.name, \"order\" = excluded.\"order\";"
        )
    lines.append("")

    lines.append("-- Companies upsert (stored in candidates pipeline_id='companies')")
    for index, c in enumerate(companies):
        row_id = f"hubspot_company_{c.record_id}"
        created_at = c.created_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        updated_at = c.last_activity_at or c.created_at or created_at

        data = compact(
            {
                "name": c.name,
                "email": "",
                "phone": c.phone,
                "city": c.city,
                "country": c.country,
                "industry": c.industry,
                "company_owner": c.owner,
                "source": "hubspot_csv",
                "hubspot_company_id": c.record_id,
                "hubspot_create_date": c.created_at,
                "hubspot_last_activity_date": c.last_activity_at,
            }
        )
        data_json = json.dumps(data, ensure_ascii=False).replace("'", "''")

        lines.append(
            "insert into candidates "
            "(id, pipeline_id, stage_id, pool_id, status, \"order\", created_at, updated_at, data) "
            "values "
            f"({sql_str(row_id)}, 'companies', 'consultation', 'roomy', 'active', 0, "
            f"{sql_str(created_at)}, {sql_str(updated_at)}, '{data_json}'::jsonb) "
            "on conflict (id) do update set "
            "pipeline_id = excluded.pipeline_id, "
            "stage_id = excluded.stage_id, "
            "pool_id = excluded.pool_id, "
            "status = excluded.status, "
            "\"order\" = excluded.\"order\", "
            "updated_at = excluded.updated_at, "
            "data = candidates.data || excluded.data;"
        )
        if (index + 1) % 25 == 0:
            lines.append("")

    lines.append("")
    lines.append("commit;")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path} with {len(companies)} companies.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

