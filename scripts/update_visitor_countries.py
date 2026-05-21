import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


OUTPUT = Path("assets/data/visitor-countries.json")


def empty_payload(message):
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "countries": [],
        "error": message,
    }


def normalize_count(value):
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        digits = "".join(ch for ch in value if ch.isdigit())
        return int(digits) if digits else 0
    return 0


def country_code(row):
    for key in ("id", "code", "country", "iso", "iso_code"):
        value = row.get(key)
        if isinstance(value, str) and len(value) == 2:
            return value.upper()

    name = row.get("name") or row.get("location") or ""
    if isinstance(name, str) and len(name) == 2 and name.isalpha():
        return name.upper()

    return None


def country_name(row, code):
    for key in ("name", "location", "label"):
        value = row.get(key)
        if isinstance(value, str) and value and value.upper() != code:
            return value
    return code


def row_count(row):
    for key in ("count", "visits", "pageviews", "value"):
        if key in row:
            return normalize_count(row[key])
    return 0


def parse_rows(payload):
    if isinstance(payload, list):
        return payload

    for key in ("stats", "data", "locations", "rows", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return value

    return []


def write_payload(payload):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main():
    site = os.environ.get("GOATCOUNTER_SITE", "").strip()
    token = os.environ.get("GOATCOUNTER_TOKEN", "").strip()

    if not site:
        write_payload(empty_payload("missing GOATCOUNTER_SITE"))
        return 0

    if not token:
        write_payload(empty_payload("missing GOATCOUNTER_TOKEN"))
        return 0

    query = urllib.parse.urlencode(
        {
            "start": "2000-01-01T00:00:00Z",
            "limit": "100",
        }
    )
    url = f"https://{site}.goatcounter.com/api/v0/stats/locations?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Failed to fetch GoatCounter locations: {exc}", file=sys.stderr)
        write_payload(empty_payload("fetch failed"))
        return 0

    countries = []
    for row in parse_rows(payload):
        if not isinstance(row, dict):
            continue

        code = country_code(row)
        if not code:
            continue

        countries.append(
            {
                "code": code,
                "name": country_name(row, code),
                "count": row_count(row),
            }
        )

    countries.sort(key=lambda item: (-item["count"], item["code"]))
    write_payload(
        {
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "countries": countries[:8],
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
