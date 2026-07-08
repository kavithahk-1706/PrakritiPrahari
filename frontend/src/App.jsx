import { useState, useEffect } from "react";
import ReportForm from "./ReportForm";
import MapDashboard from "./MapDashboard";
import LandingPage from "./LandingPage";
import "./index.css";
import { ensureSignedIn, signInAsAuthority, signOutAuthority, auth, onAuthStateChanged } from "./firebase";

function App() {
  const [activeTab, setActiveTab] = useState("home"); // "home" | "submit" | "map"
  const [focusedIncidentId, setFocusedIncidentId] = useState(null);

  // Authority auth state
  const [isAuthority, setIsAuthority] = useState(false);
  const [authorityEmail, setAuthorityEmail] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    ensureSignedIn();
  }, []);

  // Track auth state and check for authority custom claim
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !user.isAnonymous) {
        try {
          const tokenResult = await user.getIdTokenResult();
          if (tokenResult.claims.role === "authority") {
            setIsAuthority(true);
            setAuthorityEmail(user.email || "Authority");
            return;
          }
        } catch {
          // fall through to reset
        }
      }
      setIsAuthority(false);
      setAuthorityEmail("");
    });
    return () => unsubscribe();
  }, []);

  const handleViewOnMap = (incidentId) => {
    setFocusedIncidentId(incidentId);
    setActiveTab("map");
  };

  // Authorities don't submit reports — redirect them away from the submit tab
  useEffect(() => {
    if (isAuthority && activeTab === "submit") {
      setActiveTab("map");
    }
  }, [isAuthority, activeTab]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await signInAsAuthority(loginEmail, loginPassword);
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    } catch (err) {
      // Map Firebase error codes to human-readable messages
      const code = err.code || "";
      if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        setLoginError("Incorrect email or password.");
      } else if (code.includes("user-not-found")) {
        setLoginError("No authority account found with that email.");
      } else if (code.includes("too-many-requests")) {
        setLoginError("Too many failed attempts. Try again later.");
      } else {
        setLoginError(err.message || "Login failed. Please try again.");
      }
    } finally {
      setLoginLoading(false);
    }
  }

  function handleCloseModal() {
    setShowLoginModal(false);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
  }

  return (
    <div className="app">
      {/* Persistent header across all views */}
      <header className="app-header">
        <div className="header-brand" onClick={() => setActiveTab("home")}>
          <div className="brand-icon">
            {/* Leaf icon from lucide-react rendered inline as SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#72e09a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
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
          {!isAuthority && (
            <button
              className={`tab-button ${activeTab === "submit" ? "active" : ""}`}
              onClick={() => setActiveTab("submit")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tab-icon">
                <rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
              </svg>
              Report
            </button>
          )}
          <button
            className={`tab-button ${activeTab === "map" ? "active" : ""}`}
            onClick={() => setActiveTab("map")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tab-icon">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" x2="9" y1="3" y2="18" />
              <line x1="15" x2="15" y1="6" y2="21" />
            </svg>
            Live Map
          </button>
        </nav>

        {/* Authority login / signed-in indicator — outside header-nav pill */}
        <div className="header-authority">
          {isAuthority ? (
            <>
              <span className="authority-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                {authorityEmail}
              </span>
              <button className="authority-signout-btn" onClick={signOutAuthority}>
                Sign Out
              </button>
            </>
          ) : (
            <button className="authority-login-btn" onClick={() => setShowLoginModal(true)}>
              Authority Login
            </button>
          )}
        </div>
      </header>

      {/* Authority Login Modal */}
      {showLoginModal && (
        <div className="auth-modal-overlay" onClick={handleCloseModal}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <div className="auth-modal-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Authority Login
              </div>
              <button className="auth-modal-close" onClick={handleCloseModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form className="auth-modal-body" onSubmit={handleLogin}>
              {loginError && (
                <div className="auth-modal-error">{loginError}</div>
              )}
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  className="auth-input"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="authority@example.com"
                  required
                  autoComplete="username"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  className="auth-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loginLoading}
              >
                {loginLoading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main content — each view controls its own layout/padding */}
      <main className="main-shell">
        {activeTab === "home" && (
          <LandingPage onNavigate={setActiveTab} isAuthority={isAuthority} />
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
            isAuthority={isAuthority}
          />
        )}
      </main>
    </div>
  );
}

export default App;