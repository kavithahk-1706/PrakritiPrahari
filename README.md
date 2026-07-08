# PrakritiPrahari 🍃

**Hyperlocal pollution reporting & mapping — Build with AI: Code for Communities, Track 02 (Environment / CleanAir & Clear Streets)**

City-wide AQI apps report averages. They miss the garbage-dump fire two streets from your house, the construction dust choking one intersection, the smoke pocket no municipal sensor is anywhere near. PrakritiPrahari lets any citizen report a hyperlocal pollution incident — in any combination of text, photo, audio, or video, in any of 11 Indian languages — and have it classified, mapped, cross-verified against real CPCB government sensor data, and routed to authorities in seconds using Gemini.

## 🔗 Links

**Live app:** [prakriti-prahari.vercel.app](https://prakriti-prahari.vercel.app/)
**API:** [prakritiprahari.onrender.com](https://prakritiprahari.onrender.com/)

---

> ### 🎥 Demo Video
> **The link in the pitch deck has a typo — use this one instead:**
>
> ### 👉 [Watch the Demo Video](PASTE_CORRECT_YOUTUBE_LINK_HERE) 👈
>
> *Unlisted YouTube link — the deck's URL has a broken character, this one works.*


---

## How it works

1. **Citizen reports** — a user submits any combination of text / photo / audio / video (not fixed slots — one input or all four, doesn't matter) plus their location, via GPS or address search.
2. **Gemini processes it in one call** — transcribes and translates any native-language audio/text (11 languages), analyzes visual hazard context in photos/video, and returns structured JSON: pollutant type, severity score (1–5), plain-English summary, and a recommended action.
3. **Cross-verified against real CPCB data** — for airborne incidents (smoke, dust, burning), the backend queries live OpenAQ v3 government sensor stations within a 5km radius, compares against official CPCB NAAQS 2009 24-hour thresholds (PM2.5: 60 µg/m³, PM10: 100 µg/m³), and generates a `confidence_score`. Always uses the freshest timestamped reading per pollutant to avoid stale sensor data.
4. **Saved to Firestore, pinned on a live map** — citizen reports and live sensor stations both show up on a real-time Leaflet dashboard, visually distinct by source and severity.
5. **Resolution loop** — the reporting citizen or an authority account can mark an incident resolved with a mandatory note.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React (Vite), Leaflet / react-leaflet, lucide-react — deployed on **Vercel** |
| Backend | FastAPI (Python) — deployed on **Render** |
| AI | Gemini API via `google-genai` SDK — model fallback chain: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash` |
| Database | Firebase Firestore (incident records) |
| Media storage | Cloudinary (permanent storage of uploaded photo/audio/video) |
| Auth | Firebase Authentication (anonymous sessions for citizens, email/password + custom claims for authority accounts) |
| Reference sensor data | **OpenAQ v3** (CPCB government stations, point+radius geospatial query, `X-API-Key` auth) |
| Geocoding | OpenStreetMap Nominatim (reverse geocode + address search) |
| Map tiles | OpenStreetMap |

## Testing the Authority Flow

A pre-configured authority account is available for judges/testers to try the resolve flow (authority-only resolve access, mandatory resolution note):

Email:    authority-test@prakritiprahari.com
Password: mgmVLLvgsNPL0409

Log in via the authority login screen on the deployed frontend to access the resolve dashboard.

## Data model (Firestore `incidents` collection)

```json
{
  "incident_id": "uuid",
  "timestamp": "iso datetime",
  "location": { "lat": 0.0, "lng": 0.0 },
  "location_address": "string | null",
  "source_type": "CITIZEN | SENSOR",
  "submitted_by_uid": "string",
  "input_types_used": ["text", "image", "audio", "video"],
  "media_urls": { "image": "url", "audio": "url", "video": "url" },
  "native_transcript": "string | null",
  "translated_transcript": "string | null",
  "pollutant_type": "string",
  "severity_score": 1,
  "confidence_score": "0-100 | null",
  "summary": "string",
  "recommended_action": "string",
  "status": "ACTIVE | RESOLVED",
  "resolved_by": "CITIZEN | AUTHORITY | null",
  "resolution_note": "string | null"
}
```

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- A Firebase project (Firestore + Authentication enabled, Anonymous sign-in enabled)
- A Firebase service account key (JSON) for the backend
- A Google AI Studio API key (Gemini)
- A Cloudinary account (cloud name, API key, API secret)
- An OpenAQ API key (free, from `explore.openaq.org`)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn python-dotenv google-genai firebase-admin cloudinary anyio python-multipart httpx
```

Create `backend/.env`:
```
GOOGLE_API_KEY=your_gemini_api_key
FIREBASE_SERVICE_ACCOUNT_PATH=path/to/serviceAccountKey.json
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
OPENAQ_API_KEY=your_openaq_key
```

Run locally:
```bash
uvicorn main:app --reload --port 8000
```

To grant an account authority privileges (dashboard access, resolve-any-incident):
```bash
python set_authority.py   # edit the UID constant in the file first
```

**Deployed on Render** — set the same env vars in the Render dashboard, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:
```
VITE_API_BASE=http://localhost:8000
```

Run locally:
```bash
npm run dev
```

**Deployed on Vercel** — set `VITE_API_BASE` to the live Render backend URL in Vercel project env vars.

## Data sources & attributions

- **Gemini API (Google AI Studio)** — Google's multimodal foundation model. We send it a dynamically-built list of whatever a citizen actually submitted (text/photo/audio/video, any combination) in a single call, and it returns structured JSON: transcription + translation of native-language audio/text (11 Indian languages), visual hazard analysis on photos/video, pollutant type, severity score (1–5), plain-English summary, and recommended action. Model fallback chain (`gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash`) for reliability under quota limits.

- **OpenAQ v3** (`api.openaq.org`) — an open-data nonprofit aggregator that ingests real-time CPCB (Central Pollution Control Board) and SPCB station data directly; `provider.name: "CPCB"` is confirmed on every relevant station in the API response, so this is official government monitoring data, not third-party estimation. We use OpenAQ specifically because its `/v3/locations` endpoint supports a native point+radius geospatial query — send `lat,lng` + a radius in meters, get back only stations within range with distance already calculated server-side. This is what powers our cross-verification: on an airborne-pollutant report (smoke/dust/burning), we query for CPCB stations within 5km, pull the freshest PM2.5/PM10 reading per pollutant (never first-match, since a station can carry a live sensor and a long-dead one under different sensor IDs for the same pollutant), and use it to compute a `confidence_score`. Beyond 5km, confidence stays `null` rather than forcing a misleading comparison. Auth is a free API key sent as an `X-API-Key` header.

- **CPCB National Ambient Air Quality Standards (NAAQS), 2009** — the official gazetted 24-hour thresholds (PM2.5: 60 µg/m³, PM10: 100 µg/m³) that the OpenAQ readings above are compared against to decide whether a location is having "a bad air day." This is the legal government baseline, not an arbitrary cutoff — the only heuristic part is the confidence-score *deltas* applied on top (see Honest scope notes below).

- **OpenStreetMap** (© OpenStreetMap contributors) — the underlying map data and tile imagery rendered by Leaflet for the dashboard.

- **Nominatim (OpenStreetMap)** — free geocoding service. Used two ways: reverse-geocoding a citizen's GPS coordinates into a readable address on report submission, and forward address search/autocomplete so citizens can type a location instead of relying on GPS alone.

- **Firebase (Google)** — Firestore is the primary datastore for incident records (see schema above); Firebase Authentication handles anonymous sessions for citizens (no signup friction) and email/password + custom claims for authority accounts (role-gated resolve access).

- **Cloudinary** — permanent storage and CDN delivery for uploaded photo/audio/video evidence attached to each report.

## Future scope & technical roadmap
- **Full gas pollutant coverage (NO2, CO, O3).** Cross-verification currently runs on PM2.5/PM10, since these come back from live OpenAQ sensors in `µg/m³` — directly comparable to CPCB NAAQS thresholds — while gas pollutants report in `ppb` on the currently-active sensors. Next step: apply the standard ppb-to-µg/m³ conversion (concentration × molecular weight ÷ molar volume at reference temperature/pressure) per pollutant before comparison.
- **Calibrated confidence scoring.** Confidence-score deltas for corroborated vs. uncorroborated reports are currently a reasoned heuristic layered on real CPCB NAAQS thresholds. As resolved incidents accumulate as labeled ground truth, those fixed deltas can be replaced with a calibrated model (e.g. logistic regression over corroboration signal, distance, time-to-resolution).
- **Persistent citizen identity across devices.** Citizen sessions use Firebase anonymous auth, tied to browser + device by design, for zero-friction reporting. Next step: Firebase's built-in anonymous-to-permanent account linking (`linkWithCredential`), letting a citizen optionally link a phone/email without losing report history or a fresh signup flow.
- **Role-based access, jurisdiction routing, and engagement features.** Once persistent accounts exist via the linking above, Firebase custom claims can scope authority accounts to a jurisdiction, Firestore security rules can enforce that scoping server-side, and a points/recognition layer can trigger off the same corroboration event that already computes `confidence_score` today.

## Team
Kavitha Haima Kidambi — solo build.