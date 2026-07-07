import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup } from "react-leaflet";
import L from "leaflet";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// severity 1-5 mapped to color - matches the legend and pin fill
const SEVERITY_COLORS = {
  1: "#4a9d6e",
  2: "#8fae4a",
  3: "#d9a83e",
  4: "#d9702f",
  5: "#c9432c",
};

const RESOLVED_GREEN = "#3fae5c";

// resolved incidents get a checkmark divIcon instead of a severity-colored
// circle, so they read as visually distinct from active ones on the map
const resolvedIcon = L.divIcon({
  className: "resolved-marker",
  html: `<div style="
    background: ${RESOLVED_GREEN};
    width: 22px; height: 22px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #fff;
    box-shadow: 0 0 4px rgba(0,0,0,0.4);
    color: #fff; font-size: 13px; font-weight: bold;
  ">✓</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const HYDERABAD_CENTER = [17.385, 78.4867]; // fallback map center if no incidents yet

function MapDashboard() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null); // incident_id currently being resolved, for button disabling

  async function fetchIncidents() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/incidents`);
      if (!response.ok) throw new Error(`Failed to load incidents (${response.status})`);
      const data = await response.json();
      setIncidents(data.filter((incident) => incident.location));
    } catch (err) {
      setError(err.message || "Couldn't load incidents");
    } finally {
      setLoading(false);
    }
  }

  async function resolveIncident(incidentId, resolvedBy) {
    setResolvingId(incidentId);
    try {
      const response = await fetch(
        `${API_BASE}/incidents/${incidentId}/resolve?resolved_by=${resolvedBy}`,
        { method: "PATCH" }
      );
      if (!response.ok) throw new Error(`Resolve failed (${response.status})`);

      // update this incident's status in place instead of removing it -
      // resolved incidents now stay on the map as green checkmarks
      setIncidents((prev) =>
        prev.map((incident) =>
          incident.incident_id === incidentId
            ? { ...incident, status: "RESOLVED", resolved_by: resolvedBy }
            : incident
        )
      );
    } catch (err) {
      setError(err.message || "Couldn't resolve this incident");
    } finally {
      setResolvingId(null);
    }
  }

  useEffect(() => {
    fetchIncidents();
  }, []);

  const mapCenter =
    incidents.length > 0
      ? [incidents[0].location.lat, incidents[0].location.lng]
      : HYDERABAD_CENTER;

  return (
    <div className="map-wrapper">
      <button className="map-refresh-btn" onClick={fetchIncidents}>
        {loading ? "Loading..." : "Refresh"}
      </button>

      {error && (
        <div className="status-banner error" style={{ position: "absolute", top: 60, right: 16, zIndex: 1000, maxWidth: 280 }}>
          {error}
        </div>
      )}

      <MapContainer center={mapCenter} zoom={12} scrollWheelZoom={true}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {incidents.map((incident) =>
          incident.status === "RESOLVED" ? (
            <Marker
              key={incident.incident_id}
              position={[incident.location.lat, incident.location.lng]}
              icon={resolvedIcon}
            >
              <Popup>
                <div className="popup-content">
                  <span className="popup-severity" style={{ background: RESOLVED_GREEN }}>
                    Resolved
                  </span>
                  <div className="popup-title">{incident.pollutant_type}</div>
                  <div className="popup-summary">{incident.summary}</div>
                  <div className="popup-action">Resolved by {incident.resolved_by}</div>
                </div>
              </Popup>
            </Marker>
          ) : (
            <CircleMarker
              key={incident.incident_id}
              center={[incident.location.lat, incident.location.lng]}
              radius={10}
              pathOptions={{
                color: SEVERITY_COLORS[incident.severity_score] || "#888",
                fillColor: SEVERITY_COLORS[incident.severity_score] || "#888",
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="popup-content">
                  <span
                    className="popup-severity"
                    style={{ background: SEVERITY_COLORS[incident.severity_score] || "#888" }}
                  >
                    Severity {incident.severity_score}/5
                  </span>
                  <div className="popup-title">{incident.pollutant_type}</div>
                  <div className="popup-summary">{incident.summary}</div>
                  <div className="popup-action">{incident.recommended_action}</div>

                  <div className="popup-resolve-row">
                    <button
                      className="popup-resolve-btn citizen"
                      disabled={resolvingId === incident.incident_id}
                      onClick={() => resolveIncident(incident.incident_id, "CITIZEN")}
                    >
                      Resolved by Citizen
                    </button>
                    <button
                      className="popup-resolve-btn authority"
                      disabled={resolvingId === incident.incident_id}
                      onClick={() => resolveIncident(incident.incident_id, "AUTHORITY")}
                    >
                      Resolved by Authority
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        )}
      </MapContainer>

      <div className="legend">
        <div className="legend-title">Severity</div>
        {[1, 2, 3, 4, 5].map((level) => (
          <div className="legend-row" key={level}>
            <span className="legend-dot" style={{ background: SEVERITY_COLORS[level] }} />
            {level}
          </div>
        ))}
        <div className="legend-row" style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
          <span className="legend-dot" style={{ background: RESOLVED_GREEN }} />
          Resolved
        </div>
      </div>
    </div>
  );
}

export default MapDashboard;