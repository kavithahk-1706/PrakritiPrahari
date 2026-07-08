# backend/discover_sensors.py
"""
Run once: python discover_sensors.py

Finds real OpenAQ stations near YOUR CURRENT LOCATION + which ones have
fresh PM data right now. Location is auto-detected via IP geolocation
(ip-api.com, no key required) so this works wherever the judges run it.

Only stations marked [FRESH] have readings within the last 6 hours and
would actually contribute to corroboration in the running app — paste
only those into sensors.py's HYDERABAD_STATIONS list.

This script is never called by the running app.
"""

import requests
from datetime import datetime, timezone
from cpcb import (
    find_nearby_stations,
    get_latest_readings,
    TRACKED_PARAMETERS,
    MAX_READING_AGE_HOURS,
    _parse_reading_age_hours,
)

RADIUS_M = 25_000  


def get_current_location() -> tuple[float, float, str]:
    """
    Detects the caller's approximate lat/lng via IP geolocation.
    Falls back to Hyderabad if the lookup fails.
    Returns (lat, lng, city_label).
    """
    try:
        resp = requests.get("http://ip-api.com/json/", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "success":
            lat = data["lat"]
            lng = data["lon"]
            city = data.get("city", "Unknown city")
            region = data.get("regionName", "")
            label = f"{city}, {region}".strip(", ")
            return lat, lng, label
    except Exception as e:
        print(f"[warn] IP geolocation failed ({e}), falling back to Hyderabad.\n")

    return 17.385, 78.4867, "Hyderabad, Telangana (fallback)"


def check_freshness(readings: list, sensor_map: dict) -> tuple[bool, list[str]]:
    """
    Returns (has_fresh, summary_lines) where has_fresh is True if at least
    one reading for a tracked pollutant is within MAX_READING_AGE_HOURS.
    summary_lines are human-readable per-pollutant freshness notes.
    """
    best = {}  # param -> age_hours of freshest reading
    for r in readings:
        sensor_id = r.get("sensorsId")
        if sensor_id not in sensor_map:
            continue
        param = sensor_map[sensor_id]
        dt_str = (r.get("datetime") or {}).get("utc")
        age = _parse_reading_age_hours(dt_str) if dt_str else None
        if age is None:
            continue
        if param not in best or age < best[param]:
            best[param] = age

    lines = []
    has_fresh = False
    for param, age in best.items():
        fresh = age <= MAX_READING_AGE_HOURS
        if fresh:
            has_fresh = True
        status = f"✓ {age:.1f}h ago  [FRESH]" if fresh else f"✗ {age:.1f}h ago  [STALE — skip]"
        lines.append(f"    {param}: {status}")

    return has_fresh, lines


if __name__ == "__main__":
    lat, lng, label = get_current_location()
    print(f"Detected location : {label}")
    print(f"Coordinates       : {lat:.4f}°, {lng:.4f}°")
    print(f"Search radius     : {RADIUS_M / 1000:.0f} km")
    print(f"Freshness cutoff  : {MAX_READING_AGE_HOURS}h\n")

    stations = find_nearby_stations(lat, lng, radius_m=RADIUS_M, limit=25)
    print(f"Found {len(stations)} stations within {RADIUS_M / 1000:.0f} km\n")
    print("=" * 60)

    fresh_count = 0
    for s in stations:
        sensor_map = {
            sen.get("id"): (sen.get("parameter") or {}).get("name")
            for sen in s.get("sensors", [])
            if (sen.get("parameter") or {}).get("name") in TRACKED_PARAMETERS
        }
        coords = s.get("coordinates", {})

        print(f"id={s.get('id')}  name={s.get('name')}")
        print(f"  lat={coords.get('latitude')} lng={coords.get('longitude')} "
              f"dist={round(s.get('distance', 0) / 1000, 1)} km")

        if not sensor_map:
            print("  (no PM sensors at this station)")
        else:
            print(f"  sensor_map={sensor_map}")
            readings = get_latest_readings(s.get("id"))
            has_fresh, freshness_lines = check_freshness(readings, sensor_map)
            for line in freshness_lines:
                print(line)
            if has_fresh:
                fresh_count += 1
                print("  --> PASTE THIS ONE into HYDERABAD_STATIONS")

        print()

    print("=" * 60)
    print(f"Stations with fresh PM data: {fresh_count} / {len(stations)}")
    print("Only paste [FRESH] stations into sensors.py")