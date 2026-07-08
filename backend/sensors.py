"""
Sensor-sourced pins, independent of citizen reports.
Design: the station list is fixed (geography doesn't change),
so it's hardcoded below from a one-time run of discover_sensors.py.
The refresh loop ONLY re-fetches READINGS at those fixed stations —
it never re-runs the "find stations near this point" search.
"""
import asyncio
from datetime import datetime, timezone
from cpcb import (
    get_latest_readings,
    POLLUTANT_ELEVATED_THRESHOLD,
    MAX_READING_AGE_HOURS,
    _parse_reading_age_hours,
    _to_float,
)

# Fresh stations from discover_sensors.py — 11 stations with readings < 6h old.
# Re-run discover_sensors.py if you deploy to a different city.
STATIONS = [
    {
        "id": 344140,
        "name": "Somajiguda, Hyderabad - TSPCB",
        "lat": 17.417094, "lng": 78.457437,
        "sensor_map": {12237115: "pm10", 1960606: "pm10", 1960587: "pm25", 12237116: "pm25"},
    },
    {
        "id": 407,
        "name": "Zoo Park, Hyderabad - TSPCB",
        "lat": 17.349694, "lng": 78.451437,
        "sensor_map": {715: "pm10", 12235582: "pm10", 714: "pm25", 12235583: "pm25"},
    },
    {
        "id": 352465,
        "name": "New Malakpet, Hyderabad - TSPCB",
        "lat": 17.37206, "lng": 78.50864,
        "sensor_map": {2002329: "pm10", 12237088: "pm10", 12237089: "pm25", 2002327: "pm25"},
    },
    {
        "id": 5647,
        "name": "Sanathnagar, Hyderabad - TSPCB",
        "lat": 17.4559458, "lng": 78.4332152,
        "sensor_map": {15065: "pm25", 12242129: "pm25"},
    },
    {
        "id": 346258,
        "name": "Kokapet, Hyderabad - TSPCB",
        "lat": 17.393559, "lng": 78.339194,
        "sensor_map": {1970966: "pm10", 12237160: "pm10", 12237161: "pm25", 1970970: "pm25"},
    },
    {
        "id": 344142,
        "name": "Nacharam_TSIIC IALA, Hyderabad - TSPCB",
        "lat": 17.429398, "lng": 78.569354,
        "sensor_map": {12237133: "pm10", 1960597: "pm10", 1960609: "pm25", 12237134: "pm25"},
    },
    {
        "id": 344103,
        "name": "ECIL Kapra, Hyderabad - TSPCB",
        "lat": 17.470431, "lng": 78.566959,
        "sensor_map": {12237097: "pm10", 1960400: "pm10", 1960399: "pm25", 12237098: "pm25"},
    },
    {
        "id": 5623,
        "name": "Central University, Hyderabad - TSPCB",
        "lat": 17.460103, "lng": 78.334361,
        "sensor_map": {12242120: "pm10", 15046: "pm10", 15178: "pm25", 12242121: "pm25"},
    },
    {
        "id": 344104,
        "name": "Kompally Municipal Office, Hyderabad - TSPCB",
        "lat": 17.544899, "lng": 78.486949,
        "sensor_map": {1960404: "pm10", 12237124: "pm10", 12237125: "pm25", 1960394: "pm25"},
    },
    {
        "id": 5645,
        "name": "ICRISAT Patancheru, Hyderabad - TSPCB",
        "lat": 17.5184, "lng": 78.278777,
        "sensor_map": {12235408: "pm10", 15267: "pm10", 12235409: "pm25", 15254: "pm25"},
    },
    {
        "id": 346257,
        "name": "Ramachandrapuram, Hyderabad - TSPCB",
        "lat": 17.528544, "lng": 78.286195,
        "sensor_map": {12242163: "pm10", 1970973: "pm10", 1970968: "pm25", 12242164: "pm25"},
    },
]

SENSOR_REFRESH_INTERVAL_SECONDS = 20 * 60  # ~20 min


def _build_pollutants_dict(station: dict) -> dict:
    """
    For a known station, fetch its latest readings and return only the
    freshest value per pollutant that's within MAX_READING_AGE_HOURS.
    """
    sensor_map = station["sensor_map"]
    readings = get_latest_readings(station["id"])
    best = {}
    for r in readings:
        sensor_id = r.get("sensorsId")
        if sensor_id not in sensor_map:
            continue
        param = sensor_map[sensor_id]
        dt_str = (r.get("datetime") or {}).get("utc")
        age_hours = _parse_reading_age_hours(dt_str) if dt_str else None
        if age_hours is None or age_hours > MAX_READING_AGE_HOURS:
            continue
        value = _to_float(r.get("value"))
        if value is None:
            continue
        existing = best.get(param)
        if existing is None or age_hours < existing["age_hours"]:
            threshold = POLLUTANT_ELEVATED_THRESHOLD.get(param)
            best[param] = {
                "value": value,
                "threshold": threshold,
                "elevated": value >= threshold if threshold is not None else None,
                "age_hours": round(age_hours, 2),
            }
    return best


def refresh_all_sensors(db):
    """
    Pulls latest readings for every hardcoded station, upserts into
    Firestore. Called by BOTH the background loop and the manual
    /admin/refresh-sensors endpoint — same function, two triggers.
    """
    now = datetime.now(timezone.utc).isoformat()
    updated = []
    for station in STATIONS:  
        pollutants = _build_pollutants_dict(station)
        if not pollutants:
            continue  
        doc_id = f"sensor_{station['id']}"
        doc = {
            "incident_id": doc_id,
            "source_type": "SENSOR",
            "station_name": station["name"],
            "location": {"lat": station["lat"], "lng": station["lng"]},
            "pollutants": pollutants,
            "last_updated": now,
        }
        db.collection("incidents").document(doc_id).set(doc)
        updated.append(doc_id)
    return updated


async def sensor_refresh_loop(db):
    """Runs forever alongside the app, started once on startup."""
    while True:
        try:
            updated = refresh_all_sensors(db)
            print(f"[sensor loop] refreshed {len(updated)} stations")
        except Exception as e:
            print(f"[sensor loop] error: {e}")
        await asyncio.sleep(SENSOR_REFRESH_INTERVAL_SECONDS)