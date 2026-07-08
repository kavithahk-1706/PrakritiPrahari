import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import { RefreshCw, Zap, User, Building2, CheckCircle2, Menu, X } from "lucide-react";
import L from "leaflet";
import { getIdToken, auth } from "./firebase";


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

function MapDashboard({ focusedIncidentId, onClearFocusIncident, isAuthority }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  // Sidebar collapsible state
  const [activeOpen, setActiveOpen] = useState(true);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // "All" / "Mine" filter toggle
  const [filterMode, setFilterMode] = useState("all");

  // Click-to-recenter: flyTarget changes trigger MapController
  const [flyTarget, setFlyTarget] = useState(null);
  const markerRefs = useRef({});

  const currentUid = auth.currentUser?.uid ?? null;

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

  async function resolveIncident(incidentId) {
    setResolvingId(incidentId);
    try {
      const token = await getIdToken();
      const response = await fetch(
        `${API_BASE}/incidents/${incidentId}/resolve`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || `Resolve failed (${response.status})`);
      }

      const data = await response.json();

      setIncidents((prev) =>
        prev.map((incident) =>
          incident.incident_id === incidentId
            ? { ...incident, status: "RESOLVED", resolved_by: data.resolved_by }
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

  // Auto-dismiss error toast after 4 seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const mapCenter =
    incidents.length > 0
      ? [incidents[0].location.lat, incidents[0].location.lng]
      : HYDERABAD_CENTER;

  const allActive = incidents.filter((i) => i.status !== "RESOLVED");
  const allResolved = incidents.filter((i) => i.status === "RESOLVED");

  const activeIncidents = filterMode === "mine" && currentUid
    ? allActive.filter((i) => i.submitted_by_uid === currentUid)
    : allActive;
  const resolvedIncidents = filterMode === "mine" && currentUid
    ? allResolved.filter((i) => i.submitted_by_uid === currentUid)
    : allResolved;

  // Trigger a fly + popup open from the sidebar list
  function handleSelectIncident(incident) {
    if (incident.status === "RESOLVED") {
      setResolvedOpen(true);
    } else {
      setActiveOpen(true);
    }
    setFlyTarget({ incident, key: Date.now() }); // new key forces effect to re-run even for same incident
    setMobileSidebarOpen(false); // Close sidebar on mobile when an incident is selected to view it
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
      {/* ── Mobile Sidebar Toggle ── */}
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setMobileSidebarOpen(true)}
      >
        <Menu size={24} />
      </button>

      {/* ── Sidebar Overlay (Mobile) ── */}
      <div
        className={`mobile-sidebar-overlay ${mobileSidebarOpen ? "mobile-open" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* ── Sidebar ── */}
      <aside className={`map-sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="sidebar-title">Live Incident Map</div>
            <div className="sidebar-subtitle">Hyderabad metropolitan area</div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setMobileSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* ── Authority stats strip ── */}
        {isAuthority && (
          <div className="authority-stats-strip">
            <div className="authority-stat">
              <span className="authority-stat-num">{allActive.length}</span>
              <span className="authority-stat-label">Active</span>
            </div>
            <div className="authority-stat-divider" />
            <div className="authority-stat">
              <span className="authority-stat-num authority-stat-critical">
                {allActive.filter((i) => i.severity_score === 5).length}
              </span>
              <span className="authority-stat-label">Critical</span>
            </div>
            <div className="authority-stat-divider" />
            <div className="authority-stat">
              <span className="authority-stat-num">{allResolved.length}</span>
              <span className="authority-stat-label">Resolved</span>
            </div>
          </div>
        )}

        <div className="sidebar-top-bar">
          <button
            className="refresh-btn"
            onClick={fetchIncidents}
            disabled={loading}
          >
            <RefreshCw size={12} className="refresh-icon" />
            {loading ? "Loading…" : "Refresh"}
          </button>
          {!isAuthority && (
            <div className="filter-toggle">
              <button
                className={`filter-toggle-btn ${filterMode === "all" ? "active" : ""}`}
                onClick={() => setFilterMode("all")}
              >
                All
              </button>
              <button
                className={`filter-toggle-btn ${filterMode === "mine" ? "active" : ""}`}
                onClick={() => setFilterMode("mine")}
                disabled={!currentUid}
              >
                Mine
              </button>
            </div>
          )}
        </div>

        {/* ── Error Toast ── */}
        {error && (
          <div className="map-toast-error">
            <span>{error}</span>
            <button className="map-toast-close" onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

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
                <span className={`collapsible-count ${activeIncidents.length > 0 ? "has-active" : ""}`}>
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
                        {currentUid && incident.submitted_by_uid === currentUid && (
                          <span className="incident-yours-badge">Yours</span>
                        )}
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
                <span className={`collapsible-count ${resolvedIncidents.length > 0 ? "has-resolved" : ""}`}>
                  {resolvedIncidents.length}
                </span>
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
                      <div className="incident-item-type">
                        {incident.pollutant_type}
                        {currentUid && incident.submitted_by_uid === currentUid && (
                          <span className="incident-yours-badge">Yours</span>
                        )}
                      </div>
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
                      {incident.location_address && (
                        <p className="popup-action-text" style={{ marginTop: 4 }}>
                          {incident.location_address}
                        </p>
                      )}
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
                      {incident.location_address && (
                        <p className="popup-action-text" style={{ marginTop: 4 }}>
                          {incident.location_address}
                        </p>
                      )}
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
                        onClick={() => resolveIncident(incident.incident_id)}
                      >
                        <CheckCircle2 size={11} />
                        Mark Resolved
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