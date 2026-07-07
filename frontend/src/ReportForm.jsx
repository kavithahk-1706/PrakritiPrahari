import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function ReportForm() {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [audio, setAudio] = useState(null);
  const [video, setVideo] = useState(null);

  const [location, setLocation] = useState(null); // { lat, lng } | null
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | acquiring | acquired | error

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // successful response json
  const [error, setError] = useState(null);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("acquiring");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationStatus("acquired");
      },
      () => {
        setLocationStatus("error");
      }
    );
  }

  function hasAnyInput() {
    return Boolean(text.trim() || photo || audio || video);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasAnyInput() || submitting) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    if (text.trim()) formData.append("text", text.trim());
    if (location) {
      formData.append("lat", location.lat);
      formData.append("lng", location.lng);
    }
    if (photo) formData.append("photo", photo);
    if (audio) formData.append("audio", audio);
    if (video) formData.append("video", video);

    try {
      const response = await fetch(`${API_BASE}/report`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || `Request failed (${response.status})`);
      }

      const data = await response.json();
      setResult(data);

      // reset the form for the next report
      setText("");
      setPhoto(null);
      setAudio(null);
      setVideo(null);
    } catch (err) {
      setError(err.message || "Something went wrong submitting this report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field-group">
        <label className="field-label">
          Description <span className="optional">(optional if media attached)</span>
        </label>
        <textarea
          rows={4}
          placeholder="What's happening here? Describe it in any language."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <MediaInput
        label="Photo"
        accept="image/*"
        file={photo}
        onChange={setPhoto}
      />
      <MediaInput
        label="Audio"
        accept="audio/*"
        file={audio}
        onChange={setAudio}
      />
      <MediaInput
        label="Video"
        accept="video/*"
        file={video}
        onChange={setVideo}
      />

      <div className="field-group">
        <label className="field-label">Location</label>
        <button
          type="button"
          className="submit-btn"
          style={{ background: "var(--panel-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
          onClick={requestLocation}
        >
          {locationStatus === "acquired" ? "Location Captured" : "Use My Location"}
        </button>
        <div className="location-status">
          <span
            className={`location-dot ${
              locationStatus === "acquired" ? "acquired" : locationStatus === "error" ? "error" : ""
            }`}
          />
          {locationStatus === "idle" && "No location attached yet"}
          {locationStatus === "acquiring" && "Requesting location..."}
          {locationStatus === "acquired" && `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
          {locationStatus === "error" && "Couldn't get location - report will submit without it"}
        </div>
      </div>

      <button type="submit" className="submit-btn" disabled={!hasAnyInput() || submitting}>
        {submitting ? "Processing..." : "Submit Report"}
      </button>

      {submitting && (
        <div className="status-banner pending">
          Sending to Gemini for analysis. This can take a few seconds.
        </div>
      )}

      {error && <div className="status-banner error">{error}</div>}

      {result && (
        <div className="status-banner success">
          Report logged - severity {result.severity_score}/5 ({result.pollutant_type})
          <div className="result-detail">
            <div><strong>Summary:</strong> {result.summary}</div>
            <div><strong>Recommended action:</strong> {result.recommended_action}</div>
          </div>
        </div>
      )}
    </form>
  );
}

function MediaInput({ label, accept, file, onChange }) {
  return (
    <div className="field-group">
      <label className="field-label">
        {label} <span className="optional">(optional)</span>
      </label>
      <div className={`file-drop ${file ? "filled" : ""}`}>
        <input
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files[0] || null)}
        />
        {file && (
          <button type="button" className="file-clear-btn" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default ReportForm;