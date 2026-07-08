import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import { RefreshCw, Zap, User, Building2, CheckCircle2, Menu, X, ChevronDown } from "lucide-react";
import L from "leaflet";
import { getIdToken, auth } from "./firebase";


const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const POLLUTANT_TYPES = [
  "Open Waste Burning / Smoke",
  "Vehicular Emissions",
  "Industrial Air Emission",
  "Construction Dust",
  "Chemical Fumes / Gas Leak",
  "Crop / Agricultural Burning",
  "Foul Odor / Unidentified Emission",
  "Illegal Waste Dumping",
  "Uncollected Garbage / Overflowing Bins",
  "Construction & Demolition Debris",
  "E-Waste / Hazardous Waste",
  "Sewage / Wastewater Discharge",
  "Industrial Effluent Discharge",
  "Water Body Contamination",
  "Stagnant Water / Mosquito Breeding",
  "Other",
];

function CategoryDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const label = value === "all" ? "All categories" : value;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const ALL_OPTIONS = [{ value: "all", label: "All categories" }, ...POLLUTANT_TYPES.map((t) => ({ value: t, label: t }))];

  return (
    <div className="catdd" ref={containerRef}>
      <button
        className={`catdd-trigger ${open ? "open" : ""} ${value !== "all" ? "has-value" : ""}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="catdd-label">{label}</span>
        <ChevronDown size={11} className={`catdd-chevron ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="catdd-panel">
          {ALL_OPTIONS.map(({ value: v, label: l }) => (
            <button
              key={v}
              type="button"
              className={`catdd-option ${value === v ? "active" : ""}`}
              onClick={() => { onChange(v); setOpen(false); }}
            >
              {value === v && <span className="catdd-check">✓</span>}
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// severity 1-5 mapped to color - matches the legend and pin fill
// NOTE: Level 1 intentionally uses a blue-teal, not green, to stay visually
// distinct from RESOLVED_GREEN (#3fae5c) in the legend.
const SEVERITY_COLORS = {
  1: "#3a8fc4",
  2: "#8fae4a",
  3: "#d9a83e",
  4: "#d9702f",
  5: "#c9432c",
};

// Derive a severity bucket (1-5) for a sensor incident based on worst
// value/threshold ratio across whichever pollutants are present.
function getSensorSeverity(pollutants) {
  if (!pollutants) return null;
  const ratios = Object.values(pollutants)
    .filter((p) => p && p.threshold)
    .map((p) => p.value / p.threshold);
  if (!ratios.length) return null;
  const worst = Math.max(...ratios);
  if (worst < 0.5) return 1;
  if (worst < 0.75) return 2;
  if (worst < 1.0) return 3;
  if (worst < 1.5) return 4;
  return 5;
}

// Factory: returns a diamond-shaped L.divIcon filled with the severity color.
// The diamond is a square div rotated 45 °, matching the overall size/border
// treatment of resolvedIcon so the two shapes sit at the same visual weight.
function sensorIcon(bucket) {
  const color = SEVERITY_COLORS[bucket] || "#888";
  return L.divIcon({
    className: "sensor-marker",
    html: `<div style="
      background: ${color};
      width: 18px; height: 18px;
      transform: rotate(45deg);
      border: 2px solid #fff;
      box-shadow: 0 0 4px rgba(0,0,0,0.4);
    "></div>`,
    // iconSize/Anchor account for the rotated square visually centering on
    // the lat/lng point. The visual diagonal is ~25px but DOM size stays 22.
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

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

  // Resizable sidebar state (defaulting to 380px)
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isDragging, setIsDragging] = useState(false);

  // Sidebar collapsible state
  const [activeOpen, setActiveOpen] = useState(true);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [sensorOpen, setSensorOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Floating legend state
  const [legendExpanded, setLegendExpanded] = useState(false);
  const legendRef = useRef(null);

  // "All" / "Mine" filter toggle (citizen reports only)
  const [filterMode, setFilterMode] = useState("all");

  // Source-type filter: "citizen" | "sensor" | "both"
  const [sourceFilter, setSourceFilter] = useState("both");

  // Pollution category filter (citizen mode only)
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Sensor manual-refresh loading state (separate from citizen fetchIncidents loading)
  const [refreshingSensors, setRefreshingSensors] = useState(false);

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

  // POST /admin/refresh-sensors, then pull fresh data so new sensor docs land on map
  async function refreshSensors() {
    setRefreshingSensors(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/refresh-sensors`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Sensor refresh failed (${res.status})`);
      }
    } catch (err) {
      setError(err.message || "Sensor refresh failed");
    } finally {
      setRefreshingSensors(false);
      // Always re-fetch incidents so updated sensor docs appear on map
      fetchIncidents();
    }
  }

  async function resolveIncident(incidentId, note) {
    setResolvingId(incidentId);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      if (note) formData.append("resolution_note", note);

      const response = await fetch(
        `${API_BASE}/incidents/${incidentId}/resolve`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
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
            ? { ...incident, status: "RESOLVED", resolved_by: data.resolved_by, resolution_note: data.resolution_note }
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

  // Handle sidebar resize dragging (horizontal)
  useEffect(() => {
    if (!isDragging) return;
    function handleMouseMove(e) {
      // Clamp between 240px and 500px
      const newWidth = Math.max(240, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    }
    function handleMouseUp() {
      setIsDragging(false);
    }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Handle click outside for floating legend
  useEffect(() => {
    function handleClickOutside(e) {
      if (legendRef.current && !legendRef.current.contains(e.target)) {
        setLegendExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  // Split by source type
  const citizenIncidents = incidents.filter((i) => i.source_type !== "SENSOR");
  const sensorIncidents = incidents.filter((i) => i.source_type === "SENSOR");

  // Which incidents appear on the map based on sourceFilter
  const visibleOnMap = sourceFilter === "citizen"
    ? citizenIncidents
    : sourceFilter === "sensor"
      ? sensorIncidents
      : incidents;

  // Citizen-only sidebar lists
  const allActive = citizenIncidents.filter((i) => i.status !== "RESOLVED");
  const allResolved = citizenIncidents.filter((i) => i.status === "RESOLVED");

  // "Mine" toggle applies only to citizen reports
  const mineDisabled = sourceFilter === "sensor" || !currentUid;
  const effectiveFilterMode = mineDisabled ? "all" : filterMode;

  const activeByMode = effectiveFilterMode === "mine" && currentUid
    ? allActive.filter((i) => i.submitted_by_uid === currentUid)
    : allActive;
  const resolvedByMode = effectiveFilterMode === "mine" && currentUid
    ? allResolved.filter((i) => i.submitted_by_uid === currentUid)
    : allResolved;

  // Category filter is citizen-only and ignored in sensor mode
  const activeIncidents = (sourceFilter === "sensor") ? [] :
    categoryFilter === "all"
      ? activeByMode
      : activeByMode.filter((i) => i.pollutant_type === categoryFilter);
  const resolvedIncidents = (sourceFilter === "sensor") ? [] :
    categoryFilter === "all"
      ? resolvedByMode
      : resolvedByMode.filter((i) => i.pollutant_type === categoryFilter);

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
    <div className="map-layout" style={{ gridTemplateColumns: `${sidebarWidth}px 1fr` }}>
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
      <aside className={`map-sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`} style={{ position: "relative" }}>
        {/* Resize handle */}
        <div
          className="sidebar-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
        />
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

        {/* ── Source-type filter (Citizen / Sensor / Both) — sits above refresh row ── */}
        <div className="source-filter-row">
          <div className="filter-toggle source-toggle">
            <button
              className={`filter-toggle-btn ${sourceFilter === "citizen" ? "active" : ""}`}
              onClick={() => setSourceFilter("citizen")}
            >
              <User size={11} style={{ marginRight: 3 }} />
              Citizen
            </button>
            <button
              className={`filter-toggle-btn ${sourceFilter === "sensor" ? "active" : ""}`}
              onClick={() => setSourceFilter("sensor")}
            >
              <Building2 size={11} style={{ marginRight: 3 }} />
              Sensor
            </button>
            <button
              className={`filter-toggle-btn ${sourceFilter === "both" ? "active" : ""}`}
              onClick={() => setSourceFilter("both")}
            >
              Both
            </button>
          </div>
        </div>

        {/* ── Refresh / All-Mine row — content depends on active source mode ── */}
        {sourceFilter !== "sensor" && (
          <div className="sidebar-top-bar">
            {/* ─ Citizen mode: standard Refresh button ─ */}
            <button
              className="refresh-btn"
              onClick={fetchIncidents}
              disabled={loading}
            >
              <RefreshCw size={12} className="refresh-icon" />
              {loading ? "Loading…" : "Refresh Reports"}
            </button>

            {/* ─ All/Mine toggle: hidden entirely in Sensor-only mode ─ */}
            {!isAuthority && (
              <div className="filter-toggle">
                <button
                  className={`filter-toggle-btn ${effectiveFilterMode === "all" ? "active" : ""}`}
                  onClick={() => setFilterMode("all")}
                >
                  All
                </button>
                <button
                  className={`filter-toggle-btn ${effectiveFilterMode === "mine" ? "active" : ""}`}
                  onClick={() => setFilterMode("mine")}
                  disabled={!currentUid}
                >
                  Mine
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─ Sensor / Both mode: Refresh Sensors button is on its own row ─ */}
        {sourceFilter !== "citizen" && (
          <div className="sidebar-top-bar" style={sourceFilter === "both" ? { borderTop: "none", paddingTop: 0 } : {}}>
            <button
              className="refresh-btn"
              style={{ width: sourceFilter === "both" ? "100%" : "auto", justifyContent: "center" }}
              onClick={refreshSensors}
              disabled={refreshingSensors || loading}
              title="POST /admin/refresh-sensors then reload"
            >
              <RefreshCw size={12} className="refresh-icon" />
              {refreshingSensors ? "Refreshing…" : "Refresh Sensors"}
            </button>
          </div>
        )}

        {/* ── Category filter — shown in Citizen and Both modes, hidden in Sensor-only ── */}
        {sourceFilter !== "sensor" && (
          <div className="category-filter-row">
            <CategoryDropdown value={categoryFilter} onChange={setCategoryFilter} />
          </div>
        )}

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

          {/* ── Citizen sections: Active & Resolved ── */}
          {sourceFilter !== "sensor" && (
            <>
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
            </>
          )}

          {/* ── Sensor station list — shown in Sensor or Both mode ── */}
          {sourceFilter !== "citizen" && (
            <div className="collapsible-section">
              <button
                className="collapsible-header"
                onClick={() => setSensorOpen((o) => !o)}
              >
                <div className="collapsible-header-left">
                  <Building2 size={12} style={{ marginRight: 4, opacity: 0.7 }} />
                  Sensor Stations
                  <span className={`collapsible-count ${sensorIncidents.length > 0 ? "has-active" : ""}`}>
                    {sensorIncidents.length}
                  </span>
                </div>
                <span className={`collapsible-chevron ${sensorOpen ? "open" : ""}`}>▼</span>
              </button>
              <div className={`collapsible-body ${sensorOpen ? "open" : ""}`}>
                {sensorIncidents.length === 0 ? (
                  <div className="incident-empty">No sensor data</div>
                ) : (
                  sensorIncidents.map((incident) => {
                    const bucket = getSensorSeverity(incident.pollutants);
                    const worstEntry = incident.pollutants
                      ? Object.entries(incident.pollutants).reduce((best, [key, data]) => {
                        if (!data || !data.threshold) return best;
                        const ratio = data.value / data.threshold;
                        return (!best || ratio > best.ratio) ? { key, data, ratio } : best;
                      }, null)
                      : null;
                    return (
                      <button
                        key={incident.incident_id}
                        className="incident-item"
                        onClick={() => handleSelectIncident(incident)}
                      >
                        {/* Diamond shape indicator */}
                        <span
                          className="incident-sev-dot sensor-dot"
                          style={{
                            background: SEVERITY_COLORS[bucket] || "#888",
                            transform: "rotate(45deg)",
                            borderRadius: 2,
                            width: 10,
                            height: 10,
                            flexShrink: 0,
                          }}
                        />
                        <div className="incident-item-content">
                          <div className="incident-item-type" style={{ fontSize: 12 }}>
                            {incident.station_name}
                          </div>
                          <div className="incident-item-summary">
                            {worstEntry
                              ? `${worstEntry.key === "pm25" ? "PM2.5" : worstEntry.key === "pm10" ? "PM10" : worstEntry.key.toUpperCase()}: ${worstEntry.data.value.toFixed(1)
                              } µg/m³ ${worstEntry.data.elevated ? "⚠ elevated" : ""}`
                              : "No pollutant data"}
                          </div>
                          <div className="incident-item-summary" style={{ color: "var(--text-secondary)", marginTop: 2 }}>
                            {incident.last_updated
                              ? formatRelativeTime(incident.last_updated)
                              : ""}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>

      </aside>

      {/* ── Map ── */}
      <div className="map-area">
        {/* Floating Legend Overlay */}
        <div className={`floating-legend-container ${legendExpanded ? "expanded" : ""}`} ref={legendRef}>
          <button className="floating-legend-toggle" onClick={() => setLegendExpanded((prev) => !prev)}>
            <span>Severity Scale</span>
            <span className="floating-legend-chevron">▼</span>
          </button>
          
          <div className="floating-legend-panel">
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
              {/* Shape key */}
              <div
                className="legend-item"
                style={{
                  marginTop: 5,
                  paddingTop: 5,
                  borderTop: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  fontSize: "9px",
                  lineHeight: 1.4,
                }}
              >
                ● Circle = citizen&nbsp;&nbsp;◆ Diamond = sensor
              </div>
              {/* Resolved */}
              <div
                className="legend-item"
                style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid var(--border-subtle)" }}
              >
                <span
                  className="legend-swatch"
                  style={{
                    background: RESOLVED_GREEN,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 8,
                    fontWeight: 700,
                    width: "10px",
                    height: "10px",
                    lineHeight: "10px",
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
                Resolved (citizen)
              </div>
            </div>
          </div>
        </div>
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

          {visibleOnMap.map((incident) =>
            // SENSOR incidents get a diamond-shaped divIcon
            incident.source_type === "SENSOR" ? (
              <Marker
                key={incident.incident_id}
                position={[incident.location.lat, incident.location.lng]}
                icon={sensorIcon(getSensorSeverity(incident.pollutants))}
                ref={(ref) => {
                  if (ref) markerRefs.current[incident.incident_id] = ref;
                  else delete markerRefs.current[incident.incident_id];
                }}
              >
                <Popup>
                  <SensorPopupContent incident={incident} />
                </Popup>
              </Marker>
            ) : incident.status === "RESOLVED" ? (
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
                      {incident.resolution_note && (
                        <div className="popup-action-row" style={{ marginTop: 8, alignItems: "flex-start" }}>
                          <span className="popup-action-text" style={{ fontWeight: 600, flexShrink: 0 }}>Note:</span>
                          <span className="popup-action-text">{incident.resolution_note}</span>
                        </div>
                      )}
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
                  <ActiveIncidentPopupContent
                    incident={incident}
                    resolvingId={resolvingId}
                    onResolve={resolveIncident}
                    currentUid={currentUid}
                    isAuthority={isAuthority}
                    onError={setError}
                  />
                </Popup>
              </CircleMarker>
            )
          )}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Utility: format an ISO timestamp as a relative "Updated X ago" string ──
function formatRelativeTime(isoString) {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return `Updated ${diff}s ago`;
    if (diff < 3600) return `Updated ${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `Updated ${Math.floor(diff / 3600)}h ago`;
    return `Updated ${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
}

// ── SensorPopupContent ──────────────────────────────────────────────────────
// Dedicated popup for SENSOR-sourced incidents. Does NOT reuse
// ActiveIncidentPopupContent; corroboration chrome is citizen-only.
function SensorPopupContent({ incident }) {
  const { station_name, pollutants, last_updated } = incident;

  return (
    <div className="popup-card sensor-popup-card">
      <div className="popup-top">
        <div className="popup-badge-row">
          <span
            className="popup-badge"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Building2 size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
            Air Quality Sensor
          </span>
        </div>
        <h3 className="popup-heading" style={{ marginTop: 6, fontSize: 13 }}>
          {station_name}
        </h3>
      </div>

      {pollutants && Object.keys(pollutants).length > 0 && (
        <div className="popup-mid" style={{ paddingTop: 8 }}>
          <ul className="sensor-pollutant-list">
            {Object.entries(pollutants).map(([key, data]) => {
              if (!data) return null;
              const label =
                key === "pm25" ? "PM2.5" :
                  key === "pm10" ? "PM10" :
                    key.toUpperCase();
              return (
                <li key={key} className="sensor-pollutant-item">
                  <span className="sensor-pollutant-name">{label}</span>
                  <span
                    className={`sensor-pollutant-value ${data.elevated ? "elevated" : "normal"}`}
                  >
                    {data.value != null ? `${data.value.toFixed(2)} µg/m³` : "—"}
                  </span>
                  {data.threshold != null && (
                    <span className="sensor-pollutant-threshold">
                      / {data.threshold} limit
                    </span>
                  )}
                  <span
                    className={`sensor-pollutant-status ${data.elevated ? "elevated" : "normal"}`}
                  >
                    {data.elevated ? "⚠ elevated" : "✓ normal"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {last_updated && (
        <div className="popup-bottom" style={{ paddingTop: 6, borderTop: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)" }}>
          {formatRelativeTime(last_updated)}
        </div>
      )}
    </div>
  );
}

function ConfidenceCorroboration({ score, basis }) {
  const [expanded, setExpanded] = useState(false);

  if (score === null || score === undefined) return null;

  const reasonText =
    basis?.reason === "elevated_corroborated"
      ? "Nearby sensor confirms elevated pollution"
      : basis?.reason === "not_elevated"
        ? "Nearby sensor doesn't currently show elevated readings — uncorroborated, not disproven"
        : null;

  const pollutants = basis?.pollutants;
  const hasPollutants = pollutants && Object.keys(pollutants).length > 0;
  const hasDetails = basis?.station || hasPollutants || reasonText;

  return (
    <div className="confidence-corroboration">
      <div className="confidence-header-row">
        <span className="confidence-badge">Confidence: {score}%</span>
        {hasDetails && (
          <button
            className="confidence-toggle-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            aria-expanded={expanded}
          >
            Sensor corroboration
            <span className={`confidence-chevron ${expanded ? "open" : ""}`}>▾</span>
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="confidence-detail-panel">
          {basis?.station && (
            <div className="confidence-station-row">
              <span className="confidence-station-name">{basis.station}</span>
              {basis.distance_km != null && (
                <span className="confidence-distance">{basis.distance_km.toFixed(1)} km away</span>
              )}
            </div>
          )}

          {hasPollutants && (
            <ul className="confidence-pollutant-list">
              {Object.entries(pollutants).map(([name, data]) => (
                <li key={name} className="confidence-pollutant-item">
                  <span className="confidence-pollutant-name">
                    {name === "pm25" ? "PM2.5" : name === "pm10" ? "PM10" : name.toUpperCase()}
                  </span>
                  <span className={`confidence-pollutant-reading ${data.elevated ? "elevated" : "normal"}`}>
                    {data.value.toFixed(2)} µg/m³
                  </span>
                  <span className="confidence-pollutant-threshold">(threshold {data.threshold})</span>
                  <span className={`confidence-pollutant-status ${data.elevated ? "elevated" : "normal"}`}>
                    — {data.elevated ? "elevated" : "not elevated"}
                  </span>
                  {data.age_hours != null && (
                    <span className="confidence-pollutant-age">{data.age_hours.toFixed(1)}h ago</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {reasonText && (
            <p className="confidence-reason-text">{reasonText}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveIncidentPopupContent({ incident, resolvingId, onResolve, currentUid, isAuthority, onError }) {
  const [isResolving, setIsResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState("");

  return (
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
        <ConfidenceCorroboration
          score={incident.confidence_score ?? null}
          basis={incident.confidence_basis ?? null}
        />
      </div>

      <div className="popup-bottom">
        {isResolving ? (
          <div className="resolve-flow" style={{ width: "100%" }}>
            <textarea
              placeholder="Briefly describe how this was resolved..."
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              rows={3}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid var(--border-default)",
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: "13px",
                marginBottom: "8px",
                resize: "none"
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="resolve-btn"
                style={{ flex: 1, background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsResolving(false);
                  setResolveNote("");
                }}
                disabled={resolvingId === incident.incident_id}
              >
                Cancel
              </button>
              <button
                className="resolve-btn citizen"
                style={{ flex: 1 }}
                disabled={resolvingId === incident.incident_id || !resolveNote.trim()}
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve(incident.incident_id, resolveNote);
                }}
              >
                {resolvingId === incident.incident_id ? "Saving..." : "Confirm Resolution"}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="resolve-btn citizen"
            disabled={resolvingId === incident.incident_id}
            onClick={(e) => {
              e.stopPropagation();
              if (!isAuthority && incident.submitted_by_uid !== currentUid) {
                onError("You can only resolve your own reports.");
                return;
              }
              setIsResolving(true);
              setResolveNote("");
            }}
          >
            <CheckCircle2 size={11} />
            Mark Resolved
          </button>
        )}
      </div>
    </div>
  );
}

export default MapDashboard;