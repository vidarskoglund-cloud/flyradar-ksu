#!/usr/bin/env python3
"""Manual adsb.fi test: sample availability, publish latest valid snapshot and diagnostics."""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://opendata.adsb.fi/api/v3/lat/63.1118/lon/7.8245/dist/75"
samples = []
latest = None
for i in range(3):
    if i:
        time.sleep(5)
    started = time.monotonic()
    sample = {"timestamp_utc": datetime.now(timezone.utc).isoformat(), "http_status": None, "elapsed_ms": None, "aircraft_count": None, "fresh_positions_30s": None, "error": None}
    try:
        req = urllib.request.Request(URL, headers={"Accept": "application/json", "User-Agent": "FlyradarKSU-GitHubTest/1.0 (noncommercial)"})
        with urllib.request.urlopen(req, timeout=20) as response:
            sample["http_status"] = response.status
            data = json.load(response)
        aircraft = data.get("ac")
        if not isinstance(aircraft, list):
            raise ValueError("Missing aircraft list")
        sample["aircraft_count"] = len(aircraft)
        sample["fresh_positions_30s"] = sum(1 for a in aircraft if isinstance(a, dict) and isinstance(a.get("seen_pos"), (int, float)) and a["seen_pos"] <= 30)
        latest = (sample["timestamp_utc"], aircraft)
    except urllib.error.HTTPError as exc:
        sample["http_status"] = exc.code
        sample["error"] = f"HTTP {exc.code}"
    except Exception as exc:
        sample["error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
    sample["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    samples.append(sample)
    print(json.dumps(sample, ensure_ascii=False), flush=True)

if latest is None:
    raise SystemExit("No valid API response; previous snapshot preserved")
out = Path("data/adsb-fi-test.json")
out.parent.mkdir(exist_ok=True)
snapshot = {"source": "adsb.fi", "test_only": True, "fetched_at": latest[0], "aircraft_count": len(latest[1]), "ac": latest[1], "diagnostics": samples}
out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Saved test snapshot: {len(latest[1])} aircraft, 3 samples. Not a real-time feed.")
