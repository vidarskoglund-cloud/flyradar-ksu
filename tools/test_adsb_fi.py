#!/usr/bin/env python3
"""One-shot, non-commercial adsb.fi connectivity diagnostic. No secrets or raw aircraft data logged."""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

URL = "https://opendata.adsb.fi/api/v3/lat/63.1118/lon/7.8245/dist/75"
started = time.monotonic()
result = {
    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    "source": "adsb.fi",
    "endpoint": "/api/v3/lat/63.1118/lon/7.8245/dist/75",
    "http_status": None,
    "elapsed_ms": None,
    "aircraft_count": None,
    "fresh_positions_30s": None,
    "error": None,
}
try:
    req = urllib.request.Request(URL, headers={"Accept": "application/json", "User-Agent": "FlyradarKSU-Diagnostics/1.0 (noncommercial)"})
    with urllib.request.urlopen(req, timeout=15) as response:
        result["http_status"] = response.status
        payload = json.load(response)
    aircraft = payload.get("ac", payload.get("aircraft", []))
    if not isinstance(aircraft, list):
        raise ValueError("Unexpected API response: aircraft list missing")
    result["aircraft_count"] = len(aircraft)
    result["fresh_positions_30s"] = sum(1 for p in aircraft if isinstance(p.get("seen_pos"), (int, float)) and p["seen_pos"] <= 30)
except urllib.error.HTTPError as exc:
    result["http_status"] = exc.code
    result["error"] = f"HTTP {exc.code}"
except Exception as exc:
    result["error"] = f"{type(exc).__name__}: {str(exc)[:200]}"
finally:
    result["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    with open("adsb-fi-diagnostic.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
if result["error"] is not None:
    raise SystemExit(1)
