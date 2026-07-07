import { useState } from "react";
import ReportForm from "./ReportForm";
import MapDashboard from "./MapDashboard";
import "./index.css";

function App() {
  const [activeTab, setActiveTab] = useState("submit"); // "submit" | "map"

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">PrakritiPrahari</h1>
        <p className="app-subtitle">Hyperlocal pollution reporting</p>
      </header>
      <div className="hazard-stripe" />

      <div className="tab-bar">
        <button
          className={`tab-button ${activeTab === "submit" ? "active" : ""}`}
          onClick={() => setActiveTab("submit")}
        >
          Report an Incident
        </button>
        <button
          className={`tab-button ${activeTab === "map" ? "active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          Live Map
        </button>
      </div>

      <div className={activeTab === "map" ? "content map-content" : "content"}>
        {activeTab === "submit" ? <ReportForm /> : <MapDashboard />}
      </div>
    </div>
  );
}

export default App;