# test_cpcb.py — throwaway test script, not part of the real app
# run with: python test_cpcb.py
# (make sure OPENAQ_API_KEY is set in your environment or .env first)

from dotenv import load_dotenv
load_dotenv()

from cpcb import is_airborne, get_nearby_pm_reading, compute_confidence

# New Malakpet coords, the closest station we already confirmed is alive
lat, lng = 17.372, 78.5086

pollutant_type = "Open Waste Burning"
summary = "thick black smoke from a burning trash pile near the road"

print("is_airborne:", is_airborne(pollutant_type, summary))

nearby = get_nearby_pm_reading(lat, lng)
print("nearby station data:", nearby)

confidence = compute_confidence(pollutant_type, summary, nearby)
print("confidence_score:", confidence)