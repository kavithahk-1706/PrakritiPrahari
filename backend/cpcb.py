"""

CPCB Cross-Verification (via OpenAQ v3)
Pulls real-time CAAQMS station data near a citizen's reported incident and
uses it to sanity-check airborne pollution reports.

Data source: OpenAQ v3 (https://api.openaq.org/v3), which aggregates real
CPCB station data and — unlike data.gov.in's own API — returns actual
lat/lng coordinates per station plus a native point+radius search. No
geocoding workaround needed.

Two-step call pattern:
  1. GET /locations?coordinates=lat,lng&radius=meters
     -> which stations are physically near this incident, with their
        sensor list (which pollutants each one measures, and by which
        sensor id)
  2. GET /locations/{id}/latest
     -> current readings for that station, by sensor id

SCOPE: only PM2.5 / PM10 are checked. Other
pollutants (NO2, CO, etc) report in inconsistent units (ppb vs µg/m³)
across different sensor generations at the same station - out of scope
for this pass, PM2.5/PM10 are also the pollutants actually produced by
the incidents this feature exists for (smoke, dust, burning).

NOTE: a single station can have
multiple sensor ids for the same pollutant, from old vs current
instrumentation - one still reporting today, one dead since e.g. 2022.
We only ever trust the freshest timestamped reading per pollutant and
discard anything older than MAX_READING_AGE_HOURS, never "first match."

"""

import os
import requests
from datetime import datetime, timezone
from typing import Optional

OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY")
OPENAQ_BASE_URL = "https://api.openaq.org/v3"

DISTANCE_CUTOFF_M = 5000  # 5km cutoff
MAX_READING_AGE_HOURS = 6  # a "fresh" reading has to be at least this recent

TRACKED_PARAMETERS = {"pm25", "pm10"} #not tracking NO2 or CO due to unit mismatch (µg/m³ vs ppb)

# µg/m³ - valid for pm25/pm10 specifically, since those are the pollutants
# confirmed to report consistently in µg/m³ across currently-live sensors
POLLUTANT_ELEVATED_THRESHOLD = {
    "pm25": 60,
    "pm10": 100,
}

AIRBORNE_CATEGORIES = {
    "Open Waste Burning / Smoke",
    "Vehicular Emissions",
    "Industrial Air Emission",
    "Construction Dust",
    "Chemical Fumes / Gas Leak",
    "Crop / Agricultural Burning",
}

def is_airborne(pollutant_type: str, summary: str = "") -> bool:
    """
    Gate: only airborne/burning-related incidents get cross-checked.
    Sewage, dumping, etc. skip this entirely.
    """
    
    return pollutant_type in AIRBORNE_CATEGORIES


def _to_float(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None



def _headers():
    return {"X-API-Key": OPENAQ_API_KEY}


def _parse_reading_age_hours(datetime_utc: str) -> Optional[float]:
    try:
        reading_time = datetime.fromisoformat(datetime_utc.replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - reading_time
        return age.total_seconds() / 3600
    except (ValueError, AttributeError):
        return None


def find_nearby_stations(lat: float, lng: float, radius_m: int = DISTANCE_CUTOFF_M, limit: int = 100) -> list:
    """
    Step 1: which stations physically exist near this point, sorted nearest
    first, each with its sensor list (sensor id -> pollutant name mapping
    lives inside each station's "sensors" array).
    """
    try:
        resp = requests.get(
            f"{OPENAQ_BASE_URL}/locations",
            params={"coordinates": f"{lat},{lng}", "radius": radius_m, "limit": limit},
            headers=_headers(),
            timeout=8,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return sorted(results, key=lambda r: r.get("distance", float("inf")))
    except Exception as e:
        print(f"find_nearby_stations failed: {e}")
        return []


def get_latest_readings(location_id: int) -> list:
    """Step 2: current readings for one specific station, by sensor id."""
    try:
        resp = requests.get(
            f"{OPENAQ_BASE_URL}/locations/{location_id}/latest",
            headers=_headers(),
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as e:
        print(f"get_latest_readings failed for location {location_id}: {e}")
        return []


def get_nearby_pm_reading(lat: float, lng: float) -> Optional[dict]:
    """
    Returns the nearest station's fresh PM2.5/PM10 readings, or None if
    nothing usable was found within DISTANCE_CUTOFF_M.

    Tries stations nearest-first; if the closest one has no fresh PM
    readings (sensor dead, or only measures gases), moves to the next
    nearest station within the cutoff before giving up.

    Caller is responsible for gating this on is_airborne() first.
    """
    stations = find_nearby_stations(lat, lng)
    if not stations:
        return None

    for station in stations:
        # sensor id -> pollutant name, only for the params we track
        sensor_map = {}
        for s in station.get("sensors", []):
            pname = (s.get("parameter") or {}).get("name")
            if pname in TRACKED_PARAMETERS:
                sensor_map[s.get("id")] = pname

        if not sensor_map:
            continue  # this station doesn't measure PM at all, skip it

        readings = get_latest_readings(station.get("id"))
        if not readings:
            continue

        # freshest reading per pollutant - a station can have multiple
        # sensor ids for the same pollutant (old dead one + current one)
        best_per_param: dict = {}
        for r in readings:
            sensor_id = r.get("sensorsId")
            if sensor_id not in sensor_map:
                continue
            param = sensor_map[sensor_id]
            dt_str = (r.get("datetime") or {}).get("utc")
            age_hours = _parse_reading_age_hours(dt_str) if dt_str else None
            if age_hours is None or age_hours > MAX_READING_AGE_HOURS:
                continue  # too old to trust as "current"

            value = _to_float(r.get("value"))
            if value is None:
                continue

            existing = best_per_param.get(param)
            if existing is None or age_hours < existing["age_hours"]:
                best_per_param[param] = {"value": value, "age_hours": round(age_hours, 2)}

        if best_per_param:
            return {
                "station": station.get("name"),
                "distance_km": round(station.get("distance", 0) / 1000, 2),
                "pollutants": best_per_param,
            }
        # else: this station had PM sensors but nothing fresh - try the next one

    return None  # no station within cutoff had anything fresh

def get_cpcb_corroboration(pollutant_type: str, summary: str, lat: float, lng: float) -> dict:
    """
    The full gate -> lookup -> score chain in one call, returning both the
    confidence_score AND the reasoning behind it, so the frontend can show
    the actual station/reading/distance instead of a bare number.

    Always returns the same shape, so the frontend never has to branch on
    "is this field present":
        {
            "confidence_score": int | None,
            "reason": str,             # machine-readable, for logic/debugging
            "station": str | None,
            "distance_km": float | None,
            "pollutants": dict | None, # per-pollutant value/threshold/elevated/age
        }
    """
    empty = {
        "confidence_score": None,
        "reason": None,
        "station": None,
        "distance_km": None,
        "pollutants": None,
    }

    if not is_airborne(pollutant_type, summary):
        return {**empty, "reason": "not_airborne"}

    nearby = get_nearby_pm_reading(lat, lng)
    if nearby is None:
        return {**empty, "reason": "no_nearby_station"}

    pollutants = nearby["pollutants"]
    annotated = {}
    for p, vals in pollutants.items():
        threshold = POLLUTANT_ELEVATED_THRESHOLD.get(p)
        elevated = vals["value"] >= threshold if threshold is not None else None
        annotated[p] = {
            "value": vals["value"],
            "threshold": threshold,
            "elevated": elevated,
            "age_hours": vals["age_hours"],
        }

    any_elevated = any(v["elevated"] for v in annotated.values() if v["elevated"] is not None)
    confidence = 80 if any_elevated else 35

    return {
        "confidence_score": confidence,
        "reason": "elevated_corroborated" if any_elevated else "not_elevated",
        "station": nearby["station"],
        "distance_km": nearby["distance_km"],
        "pollutants": annotated,
    }