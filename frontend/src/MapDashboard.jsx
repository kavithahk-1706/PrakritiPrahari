import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import { RefreshCw, Zap, User, Building2, CheckCircle2 } from "lucide-react";
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

/* ── MapController: uses useMap() inside MapContainer to fly to selected incident ── */
function MapController({ flyTarget, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (!flyTarget) return;
    const { incident } = flyTarget;
    map.flyTo(
      [incident.location.lat, incident.location.lng],
      15,
      { animate: true, duration: 0.8 }
    );
    // Open the popup after the fly animation completes
    setTimeout(() => {
      const marker = markerRefs.current[incident.incident_id];
      if (marker) marker.openPopup();
    }, 850);
  }, [flyTarget, map]); // markerRefs.current is mutable — not reactive

  return null;
}

function MapDashboard({ focusedIncidentId, onClearFocusIncident }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  // Sidebar collapsible state
  const [activeOpen, setActiveOpen] = useState(true);
  const [resolvedOpen, setResolvedOpen] = useState(false);

  // Click-to-recenter: flyTarget changes trigger MapController
  const [flyTarget, setFlyTarget] = useState(null);
  const markerRefs = useRef({});

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

  const activeIncidents   = incidents.filter((i) => i.status !== "RESOLVED");
  const resolvedIncidents = incidents.filter((i) => i.status === "RESOLVED");

  // Trigger a fly + popup open from the sidebar list
  function handleSelectIncident(incident) {
    if (incident.status === "RESOLVED") {
      setResolvedOpen(true);
    } else {
      setActiveOpen(true);
    }
    setFlyTarget({ incident, key: Date.now() }); // new key forces effect to re-run even for same incident
  }

  // Handle focusing on a specific incident when selected externally (e.g. from submissions page)
  useEffect(() => {
    if (focusedIncidentId && incidents.length > 0) {
      const target = incidents.find((i) => i.incident_id === focusedIncidentId);
      if (target) {
        handleSelectIncident(target);
      }
      if (onClearFocusIncident) {
        onClearFocusIncident();
      }
    }
  }, [focusedIncidentId, incidents]);

  return (
    <div className="map-layout">

      {/* ── Sidebar ── */}
      <aside className="map-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">Live Incident Map</div>
          <div className="sidebar-subtitle">Hyderabad metropolitan area</div>
        </div>

        <div className="sidebar-top-bar">
          <button
            className="refresh-btn"
            onClick={fetchIncidents}
            disabled={loading}
          >
            <RefreshCw size={12} className="refresh-icon" />
            {loading ? "Loading…" : "Refresh"}
          </button>
          <div className="incident-stats">
            <strong>{activeIncidents.length}</strong> active &middot; <strong>{resolvedIncidents.length}</strong> resolved
          </div>
        </div>

        {error && <div className="map-error">{error}</div>}

        {/* Scrollable incident list */}
        <div className="incident-list-container">

          {/* Active incidents — collapsible */}
          <div className="collapsible-section">
            <button
              className="collapsible-header"
              onClick={() => setActiveOpen((o) => !o)}
            >
              <div className="collapsible-header-left">
                Active
                <span className={`collapsible-count ${activeIncidents.length > 0 ? "has-items" : ""}`}>
                  {activeIncidents.length}
                </span>
              </div>
              <span className={`collapsible-chevron ${activeOpen ? "open" : ""}`}>▼</span>
            </button>
            <div className={`collapsible-body ${activeOpen ? "open" : ""}`}>
              {activeIncidents.length === 0 ? (
                <div className="incident-empty">No active incidents</div>
              ) : (
                activeIncidents.map((incident) => (
                  <button
                    key={incident.incident_id}
                    className="incident-item"
                    onClick={() => handleSelectIncident(incident)}
                  >
                    <span
                      className="incident-sev-dot"
                      style={{ background: SEVERITY_COLORS[incident.severity_score] || "#888" }}
                    />
                    <div className="incident-item-content">
                      <div className="incident-item-type">
                        Sev {incident.severity_score} · {incident.pollutant_type}
                      </div>
                      <div className="incident-item-summary">{incident.summary}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Resolved incidents — collapsible, collapsed by default */}
          <div className="collapsible-section">
            <button
              className="collapsible-header"
              onClick={() => setResolvedOpen((o) => !o)}
            >
              <div className="collapsible-header-left">
                Resolved
                <span className="collapsible-count">{resolvedIncidents.length}</span>
              </div>
              <span className={`collapsible-chevron ${resolvedOpen ? "open" : ""}`}>▼</span>
            </button>
            <div className={`collapsible-body ${resolvedOpen ? "open" : ""}`}>
              {resolvedIncidents.length === 0 ? (
                <div className="incident-empty">No resolved incidents</div>
              ) : (
                resolvedIncidents.map((incident) => (
                  <button
                    key={incident.incident_id}
                    className="incident-item"
                    onClick={() => handleSelectIncident(incident)}
                  >
                    <span className="incident-sev-dot" style={{ background: RESOLVED_GREEN }} />
                    <div className="incident-item-content">
                      <div className="incident-item-type">{incident.pollutant_type}</div>
                      <div className="incident-item-summary">{incident.summary}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Legend — pinned at bottom */}
        <div className="map-legend">
          <div className="legend-label">Severity Scale</div>
          <div className="legend-items">
            {[1, 2, 3, 4, 5].map((level) => (
              <div className="legend-item" key={level}>
                <span className="legend-swatch" style={{ background: SEVERITY_COLORS[level] }} />
                Level {level}
                {level === 1 && " — Minimal"}
                {level === 3 && " — Moderate"}
                {level === 5 && " — Critical"}
              </div>
            ))}
            <div className="legend-item" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
              <span className="legend-swatch" style={{ background: RESOLVED_GREEN }} />
              Resolved
            </div>
          </div>
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="map-area">
        <MapContainer
          center={mapCenter}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          {/* MapController lives inside MapContainer so it can use useMap() */}
          <MapController flyTarget={flyTarget} markerRefs={markerRefs} />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {incidents.map((incident) =>
            incident.status === "RESOLVED" ? (
              <Marker
                key={incident.incident_id}
                position={[incident.location.lat, incident.location.lng]}
                icon={resolvedIcon}
                ref={(ref) => {
                  if (ref) markerRefs.current[incident.incident_id] = ref;
                  else delete markerRefs.current[incident.incident_id];
                }}
              >
                <Popup>
                  <div className="popup-card">
                    <div className="popup-top">
                      <div className="popup-badge-row">
                        <span className="popup-badge" style={{ background: RESOLVED_GREEN }}>
                          Resolved
                        </span>
                        <span className="popup-pollutant">{incident.pollutant_type}</span>
                      </div>
                      <h3 className="popup-heading">{incident.summary}</h3>
                    </div>
                    <div className="popup-mid">
                      <div className="popup-resolved-by" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={13} color={RESOLVED_GREEN} />
                        Resolved by {incident.resolved_by}
                      </div>
                    </div>
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
                ref={(ref) => {
                  if (ref) markerRefs.current[incident.incident_id] = ref;
                  else delete markerRefs.current[incident.incident_id];
                }}
              >
                <Popup>
                  <div className="popup-card">
                    <div className="popup-top">
                      <div className="popup-badge-row">
                        <span
                          className="popup-badge"
                          style={{ background: SEVERITY_COLORS[incident.severity_score] || "#888" }}
                        >
                          Sev {incident.severity_score}
                        </span>
                        <span className="popup-pollutant">{incident.pollutant_type}</span>
                      </div>
                      <h3 className="popup-heading">{incident.summary}</h3>
                    </div>

                    <div className="popup-mid">
                      <div className="popup-action-row">
                        <Zap size={13} className="popup-action-icon" color="var(--amber-400)" />
                        <span className="popup-action-text">{incident.recommended_action}</span>
                      </div>
                    </div>

                    <div className="popup-bottom">
                      <button
                        className="resolve-btn citizen"
                        disabled={resolvingId === incident.incident_id}
                        onClick={() => resolveIncident(incident.incident_id, "CITIZEN")}
                      >
                        <User size={11} />
                        Citizen
                      </button>
                      <button
                        className="resolve-btn authority"
                        disabled={resolvingId === incident.incident_id}
                        onClick={() => resolveIncident(incident.incident_id, "AUTHORITY")}
                      >
                        <Building2 size={11} />
                        Authority
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          )}
        </MapContainer>
      </div>
    </div>
  );
}

export default MapDashboard;