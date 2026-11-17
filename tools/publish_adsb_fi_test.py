#!/usr/bin/env python3
"""Fetch one adsb.fi snapshot for an isolated GitHub Pages test."""
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

url = "https://opendata.adsb.fi/api/v3/lat/63.1118/lon/7.8245/dist/75"
request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "FlyradarKSU-GitHubTest/1.0 (noncommercial)"})
start = time.monotonic()
with urllib.request.urlopen(request, timeout=20) as response:
    if response.status != 200:
        raise RuntimeError(f"HTTP {response.status}")
    data = json.load(response)
aircraft = data.get("ac")
if not isinstance(aircraft, list):
    raise ValueError("No aircraft list in API response")
snapshot = {
    "source": "adsb.fi",
    "test_only": True,
    "fetched_at": datetime.now(timezone.utc).isoformat(),
    "aircraft_count": len(aircraft),
    "ac": aircraft,
}
out = Path("data/adsb-fi-test.json")
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"adsb.fi HTTP 200, aircraft={len(aircraft)}, elapsed_ms={round((time.monotonic()-start)*1000)}")
print(f"Snapshot written to {out}; test only, not live aircraft tracking.")
