import { useState } from "react";
import ReportForm from "./ReportForm";
import MapDashboard from "./MapDashboard";
import LandingPage from "./LandingPage";
import "./index.css";

function App() {
  const [activeTab, setActiveTab] = useState("home"); // "home" | "submit" | "map"
  const [focusedIncidentId, setFocusedIncidentId] = useState(null);

  const handleViewOnMap = (incidentId) => {
    setFocusedIncidentId(incidentId);
    setActiveTab("map");
  };

  return (
    <div className="app">
      {/* Persistent header across all views */}
      <header className="app-header">
        <div className="header-brand" onClick={() => setActiveTab("home")}>
          <div className="brand-icon">
            {/* Leaf icon from lucide-react rendered inline as SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#72e09a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
            </svg>
          </div>
          <div className="brand-text">
            <h1 className="app-title">
              <span>Prakriti</span>Prahari
            </h1>
            <p className="app-subtitle">Environmental monitoring</p>
          </div>
        </div>

        <nav className="header-nav">
          <button
            className={`tab-button ${activeTab === "home" ? "active" : ""}`}
            onClick={() => setActiveTab("home")}
          >
            Home
          </button>
          <button
            className={`tab-button ${activeTab === "submit" ? "active" : ""}`}
            onClick={() => setActiveTab("submit")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tab-icon">
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
            </svg>
            Report
          </button>
          <button
            className={`tab-button ${activeTab === "map" ? "active" : ""}`}
            onClick={() => setActiveTab("map")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tab-icon">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
              <line x1="9" x2="9" y1="3" y2="18"/>
              <line x1="15" x2="15" y1="6" y2="21"/>
            </svg>
            Live Map
          </button>
        </nav>
      </header>

      {/* Main content — each view controls its own layout/padding */}
      <main className="main-shell">
        {activeTab === "home" && (
          <LandingPage onNavigate={setActiveTab} />
        )}
        {activeTab === "submit" && (
          <div className="form-shell">
            <ReportForm onViewOnMap={handleViewOnMap} />
          </div>
        )}
        {activeTab === "map" && (
          <MapDashboard
            focusedIncidentId={focusedIncidentId}
            onClearFocusIncident={() => setFocusedIncidentId(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;