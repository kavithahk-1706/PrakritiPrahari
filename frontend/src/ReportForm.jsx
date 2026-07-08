import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Mic, Video, MapPin, RotateCcw, Loader2, X, Circle, Square } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

import { getIdToken } from "./firebase";


function hasAnyInput() {
  return Boolean((text.trim() || photo || audio || video) && locationStatus === "acquired");
}


/* ── Reverse geocode via Nominatim ── */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "User-Agent": "PrakritiPrahari-Hackathon/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

/* ── Format coordinates to D.DDDD° N/S, D.DDDD° E/W ── */
function formatCoords(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return "";
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

function ReportForm({ onViewOnMap }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [audio, setAudio] = useState(null);
  const [video, setVideo] = useState(null);

  const [location, setLocation] = useState(null);               // { lat, lng } sent to backend
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | acquiring | acquired | error
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [locationAddress, setLocationAddress] = useState(null); // display only — never sent to backend
  const [geocoding, setGeocoding] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  /* ── High-accuracy location: watchPosition until 5s or <50m ── */
  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }

    setLocationStatus("acquiring");
    setLocationAddress(null);
    setLocationAccuracy(null);

    let bestPos = null;
    let watchId = null;
    let finished = false;

    async function finish(pos) {
      if (finished) return;
      finished = true;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      // Raw lat/lng stored — this is what gets sent to the backend on submit
      setLocation({ lat, lng });
      setLocationAccuracy(Math.round(accuracy));
      setLocationStatus("acquired");

      // Reverse geocode for human-readable display only
      setGeocoding(true);
      const address = await reverseGeocode(lat, lng);
      setLocationAddress(address);
      setGeocoding(false);
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Track the best (lowest accuracy value = highest precision) reading
        if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
          bestPos = pos;
        }
        // If accuracy is already under 50m, lock in immediately
        if (pos.coords.accuracy <= 50) {
          finish(bestPos);
        }
      },
      () => {
        if (!finished) {
          finished = true;
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
          setLocationStatus("error");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    // After 5 seconds, lock in best reading seen so far
    setTimeout(() => {
      if (!finished) {
        if (bestPos) {
          finish(bestPos);
        } else {
          finished = true;
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
          setLocationStatus("error");
        }
      }
    }, 5000);
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
    if (photo) formData.append("image", photo);
    if (audio) formData.append("audio", audio);
    if (video) formData.append("video", video);

    try {
      const token = await getIdToken();

      const response = await fetch(`${API_BASE}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || `Request failed (${response.status})`);
      }

      const data = await response.json();
      setResult(data);

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
  const hasEvidence = Boolean(photo || audio || video);
  const hasLocation = locationStatus === "acquired";

  return (
    <form onSubmit={handleSubmit} className="report-form">

      {/* ── STEP 1: Description ── */}
      <div className={`form-step ${text.trim() ? "active" : ""}`}>
        <div className="step-aside">
          <div className="step-number">1</div>
        </div>
        <div className="step-body">
          <div className="step-label">Step one</div>
          <h2 className="step-title">Describe the incident</h2>
          <textarea
            className="report-textarea"
            rows={5}
            placeholder="What's happening? Any language, any detail — Gemini will analyze it."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>

      {/* ── STEP 2: Evidence ── */}
      <div className={`form-step ${hasEvidence ? "active" : ""}`}>
        <div className="step-aside">
          <div className="step-number">2</div>
        </div>
        <div className="step-body">
          <div className="step-label">Step two</div>
          <h2 className="step-title">Attach evidence</h2>
          <div className="evidence-container">
            <div className="evidence-tabs">
              <MediaInput label="Photo" accept="image/*" file={photo} onChange={setPhoto} />
              <MediaInput label="Audio" accept="audio/*" file={audio} onChange={setAudio} />
              <MediaInput label="Video" accept="video/*" file={video} onChange={setVideo} />
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 3: Location ── */}
      <div className={`form-step ${hasLocation ? "active" : ""}`}>
        <div className="step-aside">
          <div className="step-number">3</div>
        </div>
        <div className="step-body">
          <div className="step-label">Step three</div>
          <h2 className="step-title">Tag your location</h2>

          <div className="location-widget">
            <button
              type="button"
              className="location-trigger"
              onClick={requestLocation}
            >
              <MapPin size={15} strokeWidth={2} color="var(--green-400)" />
              {locationStatus === "acquired" ? "Re-detect" : "Use My Location"}
            </button>

            <div className="location-status-area">
              <span className={`loc-pulse ${locationStatus}`} />
              {locationStatus === "idle" && <span>No location attached</span>}
              {locationStatus === "acquiring" && <span>Detecting, please wait...</span>}
              {locationStatus === "error" && <span style={{ color: "var(--sev-5)" }}>Location unavailable</span>}
              {locationStatus === "acquired" && (
                <span style={{ color: "var(--green-400)", fontWeight: 600 }}>Location acquired</span>
              )}
            </div>
          </div>

          {/* Address display — shown after acquired, display only */}
          {locationStatus === "acquired" && (
            <div className="location-result">
              {geocoding ? (
                <div className="location-address-loading" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  Resolving address...
                </div>
              ) : locationAddress ? (
                <div className="location-address">{locationAddress}</div>
              ) : (
                <div className="location-address-loading">Address unavailable</div>
              )}
              {location && (
                <div className="location-coords" style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px", fontFamily: "var(--font-ui)", fontWeight: "500" }}>
                  {formatCoords(location.lat, location.lng)}
                </div>
              )}
              {locationAccuracy !== null && (
                <div className="location-accuracy">Accurate to ~{locationAccuracy}m</div>
              )}
              <button type="button" className="location-retry-btn" onClick={requestLocation}>
                <RotateCcw size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
                Retry detection
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SUBMIT ── */}
      <div className="submit-step">
        <button
          type="submit"
          className="submit-btn"
          disabled={!hasAnyInput() || submitting}
        >
          {submitting
            ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Analyzing with Gemini...</>
            : "Submit Report →"
          }
        </button>

        {submitting && (
          <div className="status-banner pending">
            <div className="banner-title">Analyzing Data...</div>
            <div className="banner-body">
              Sending to Gemini for analysis. This can take a few seconds.
            </div>
          </div>
        )}

        {error && (
          <div className="status-banner error">
            <div className="banner-title">Error Submitting Report</div>
            <div className="banner-body">{error}</div>
          </div>
        )}

        {result && (
          <div className="status-banner success">
            <div className="banner-title">Report Logged Successfully</div>
            <div className="banner-body">
              Severity {result.severity_score}/5 — {result.pollutant_type}
            </div>
            <div className="result-detail">
              <div className="result-row">
                <strong>Summary</strong>
                <span>{result.summary}</span>
              </div>
              <div className="result-row">
                <strong>Recommended action</strong>
                <span>{result.recommended_action}</span>
              </div>
              {result.incident_id && (
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: "8px 16px", fontSize: "13px" }}
                    onClick={() => onViewOnMap && onViewOnMap(result.incident_id)}
                  >
                    View on Map
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </form>
  );
}

/* ── MediaInput: container for Upload or Capture ── */
function MediaInput({ label, accept, file, onChange }) {
  const [showCapture, setShowCapture] = useState(false);
  const fileInputRef = useRef(null);

  const IconMap = { Photo: Camera, Audio: Mic, Video };
  const hints = { Photo: "JPG, PNG, WEBP", Audio: "MP3, WAV, M4A", Video: "MP4, MOV, WEBM" };
  const Icon = IconMap[label];

  const handleCapture = (capturedFile) => {
    onChange(capturedFile);
    setShowCapture(false);
  };

  return (
    <>
      <div className={`upload-card ${file ? "filled" : ""}`}>
        <input
          type="file"
          accept={accept}
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={(e) => onChange(e.target.files[0] || null)}
        />
        <div className="upload-icon-ring">
          <Icon size={20} strokeWidth={1.6} />
        </div>
        <div className="upload-type">{label}</div>

        {!file && (
          <div className="upload-hint">{hints[label]}</div>
        )}

        {file ? (
          <>
            <div className="upload-filename">{file.name}</div>
            <button
              type="button"
              className="file-clear-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              title="Remove file"
            >
              Remove
            </button>
          </>
        ) : (
          <div className="media-actions">
            <button type="button" className="media-action-btn" onClick={() => fileInputRef.current?.click()}>Upload</button>
            <button type="button" className="media-action-btn capture" onClick={() => setShowCapture(true)}>Capture</button>
          </div>
        )}
      </div>

      {showCapture && (
        <CaptureModal
          type={label}
          onCapture={handleCapture}
          onClose={() => setShowCapture(false)}
        />
      )}
    </>
  );
}

function getMimeType(type) {
  if (type === "Photo") return "image/jpeg";
  if (type === "Video") {
    if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
    if (MediaRecorder.isTypeSupported("video/mp4")) return "video/mp4";
    return "";
  }
  if (type === "Audio") {
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
    return "";
  }
  return "";
}

function getFileExtension(mime) {
  if (!mime) return "bin";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  return "bin";
}

function CaptureModal({ type, onCapture, onClose }) {
  const [error, setError] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const streamRef = useRef(null);
  const abortInitRef = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  const mimeType = getMimeType(type);

  // Stop stream and clean up function
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(e => console.error(e));
    }
  }, []);

  // Clean up on unmount or manual close
  useEffect(() => {
    return () => cleanupStream();
  }, [cleanupStream]);

  const initCapture = useCallback(async () => {
    abortInitRef.current = false;
    setError(null);
    setPreviewBlob(null);
    setRecordTime(0);
    setIsRecording(false);
    chunksRef.current = [];

    try {
      let s;
      if (type === "Photo" || type === "Video") {
        try {
          s = await navigator.mediaDevices.getUserMedia({
            audio: type === "Video",
            video: { facingMode: { exact: "environment" } }
          });
        } catch (err) {
          if (err.name === "OverconstrainedError" || err.name === "NotFoundError") {
            s = await navigator.mediaDevices.getUserMedia({
              audio: type === "Video",
              video: { facingMode: "user" }
            });
          } else {
            throw err;
          }
        }
      } else {
        s = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (abortInitRef.current) {
        s.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = s;

      if (videoRef.current && (type === "Photo" || type === "Video")) {
        videoRef.current.srcObject = s;
      }

      if (type === "Audio") {
        // Setup audio level analyser
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        const source = ctx.createMediaStreamSource(s);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          setAudioLevel(sum / dataArray.length);
          rafRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }
    } catch (err) {
      if (abortInitRef.current) return;
      if (err.name === "NotAllowedError" || err.name === "NotFoundError") {
        let msg = `Camera access was denied.`;
        if (type === "Audio") msg = `Microphone access was denied.`;
        if (type === "Video") msg = `Camera and Microphone access was denied.`;
        setError(`${msg} Please allow access in your browser settings to report with a ${type.toLowerCase()}.`);
      } else {
        setError("An error occurred accessing media devices: " + err.message);
      }
    }
  }, [type]);

  // Initialize on mount
  useEffect(() => {
    initCapture();
    return () => {
      abortInitRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetake = () => {
    initCapture();
  };

  const handleUse = () => {
    if (previewBlob) {
      const ext = getFileExtension(previewBlob.type);
      const filename = `captured_${type.toLowerCase()}_${Date.now()}.${ext}`;
      const file = new File([previewBlob], filename, { type: previewBlob.type });
      onCapture(file);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      // STOP STREAM IMMEDIATELY
      cleanupStream();
      setPreviewBlob(blob);
    }, "image/jpeg", 0.9);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const startRecording = () => {
    const currentStream = streamRef.current;
    if (!currentStream || currentStream.getTracks().some(t => t.readyState === "ended")) {
      initCapture();
      return;
    }

    try {
      chunksRef.current = [];
      const options = mimeType ? { mimeType } : undefined;
      const mr = new MediaRecorder(currentStream, options);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const finalMime = mimeType || mr.mimeType;
        const blob = new Blob(chunksRef.current, { type: finalMime });
        // STOP STREAM IMMEDIATELY
        cleanupStream();
        setPreviewBlob(blob);
      };

      mr.start();
      setIsRecording(true);
      setRecordTime(0);

      timerRef.current = setInterval(() => {
        setRecordTime(prev => {
          const next = prev + 1;
          const max = type === "Audio" ? 120 : 60;
          if (next >= max) {
            stopRecording();
            return max;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setError("Recording failed to start — please try again.");
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleBackdropClick = (e) => {
    if (e.target.classList.contains("capture-modal-overlay")) {
      onClose();
    }
  };

  return (
    <div className="capture-modal-overlay" onClick={handleBackdropClick}>
      <div className="capture-modal-window">
        <div className="capture-modal-header">
          <h3>Capture {type}</h3>
          <button className="capture-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="capture-modal-body">
          {error ? (
            <div className="capture-error">{error}</div>
          ) : previewBlob ? (
            <div className="capture-preview-container">
              {type === "Photo" && <img src={URL.createObjectURL(previewBlob)} alt="Preview" />}
              {type === "Audio" && <audio src={URL.createObjectURL(previewBlob)} controls />}
              {type === "Video" && <video src={URL.createObjectURL(previewBlob)} controls playsInline />}
            </div>
          ) : (
            <div className="capture-live-container">
              {(type === "Photo" || type === "Video") && (
                <video ref={videoRef} autoPlay playsInline muted className="capture-live-video" />
              )}
              {type === "Photo" && (
                <canvas ref={canvasRef} style={{ display: "none" }} />
              )}
              {type === "Audio" && (
                <div className="capture-audio-visualizer">
                  <div className="audio-level-dot" style={{ transform: `scale(${1 + audioLevel / 100})`, opacity: 0.5 + (audioLevel / 255) }}></div>
                  <div className="audio-timer">{formatTime(recordTime)} / 2:00</div>
                </div>
              )}
              {type === "Video" && isRecording && (
                <div className="capture-video-timer">
                  <div className="record-pulse-dot" />
                  {formatTime(recordTime)} / 1:00
                </div>
              )}
            </div>
          )}
        </div>

        <div className="capture-modal-footer">
          {!previewBlob && !error && (
            <div className="capture-controls">
              {type === "Photo" && (
                <button className="btn-capture-shutter" onClick={takePhoto}>
                  <div className="shutter-inner"></div>
                </button>
              )}
              {(type === "Video" || type === "Audio") && (
                !isRecording ? (
                  <button className="btn-capture-record" onClick={startRecording}>
                    <Circle size={16} fill="currentColor" /> Start Recording
                  </button>
                ) : (
                  <button className="btn-capture-stop" onClick={stopRecording}>
                    <Square size={16} fill="currentColor" /> Stop Recording
                  </button>
                )
              )}
            </div>
          )}

          {previewBlob && (
            <div className="capture-preview-actions">
              <button className="btn-secondary" onClick={handleRetake}>Retake</button>
              <button className="btn-primary" onClick={handleUse}>Use {type}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReportForm;