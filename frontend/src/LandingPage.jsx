import { useEffect, useRef, useState } from "react";
import { ClipboardList, MapIcon, Cpu, ArrowRight } from "lucide-react";

/* ── Radar mock map — self-contained canvas component ── */
function RadarMockMap() {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const startRef  = useRef(null);

  // Incident dots scattered across the full width of the screen
  const DOTS = [
    { x: 0.15, y: 0.25, r: 7,  color: "#c9432c" },
    { x: 0.82, y: 0.65, r: 6,  color: "#d9a83e" },
    { x: 0.45, y: 0.85, r: 6.5,color: "#d9702f" },
    { x: 0.65, y: 0.15, r: 5.5,color: "#3fae5c" },
    { x: 0.30, y: 0.60, r: 5,  color: "#4a9d6e" },
    { x: 0.88, y: 0.25, r: 5.5,color: "#3fae5c" },
    { x: 0.12, y: 0.75, r: 5,  color: "#d9a83e" },
  ];

  const LIVE_DOT = { x: 0.70, y: 0.45, r: 6, color: "#c9432c", appearAt: 1200 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    function draw(timestamp) {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current; // ms
      const t = elapsed / 1000; // seconds

      const W = canvas.width;
      const H = canvas.height;
      
      ctx.clearRect(0, 0, W, H);

      // ── 1. Concentric circles centered in the hero section ──
      const cx = W * 0.5, cy = H * 0.5;
      ctx.save();
      const ringSpacing = 90; // evenly spaced [X]px apart
      const maxDist = Math.max(W, H);
      const numRings = Math.ceil(maxDist / ringSpacing); // [N]

      for (let i = 1; i <= numRings; i++) {
        const ringR = i * ringSpacing;
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Radar-ping pulse animation: expanding and fading sonar ping
      for (let p = 0; p < 3; p++) {
        let pTime = (t * 0.4 + p * 0.333) % 1; // 0 to 1 over 2.5 seconds, staggered
        let pulseR = pTime * maxDist;
        let pulseAlpha = (1 - pTime) * 0.15;
        
        if (pTime > 0) {
          ctx.globalAlpha = pulseAlpha;
          ctx.strokeStyle = "#34d068";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 0.03;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
      ctx.restore();

      // ── 2. Radar sweep ──
      const sweepAngle = (t * (Math.PI * 2 / 4)) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      const sweepLen = maxDist;
      const fanSpan  = Math.PI * 0.4;

      for (let i = 0; i < 30; i++) {
        const ratio = i / 30;
        const angle = sweepAngle - fanSpan * (1 - ratio);
        ctx.globalAlpha = ratio * 0.12;
        ctx.fillStyle = "#22a85a";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, sweepLen, angle, angle + fanSpan / 30);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#34d068";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        Math.cos(sweepAngle) * sweepLen,
        Math.sin(sweepAngle) * sweepLen
      );
      ctx.stroke();
      ctx.restore();

      // ── 3. Dots ──
      for (const dot of DOTS) {
        const px = W * dot.x;
        const py = H * dot.y;
        const dotAngle = Math.atan2(py - cy, px - cx);
        let behind = (sweepAngle - dotAngle + Math.PI * 2) % (Math.PI * 2);
        if (behind > Math.PI * 2) behind -= Math.PI * 2;
        const glowFade = 1.5;
        const glow = behind < glowFade ? (1 - behind / glowFade) : 0;

        if (glow > 0.02) {
          ctx.save();
          ctx.globalAlpha = glow * 0.35;
          ctx.fillStyle = dot.color;
          ctx.beginPath();
          ctx.arc(px, py, dot.r + 5 + glow * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = 0.55 + glow * 0.45;
        ctx.fillStyle = dot.color;
        ctx.beginPath();
        ctx.arc(px, py, dot.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3 + glow * 0.4;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // ── 4. Live Dot ──
      if (elapsed > LIVE_DOT.appearAt) {
        const age = (elapsed - LIVE_DOT.appearAt) / 1000;
        const px  = W * LIVE_DOT.x;
        const py  = H * LIVE_DOT.y;

        for (let ring = 0; ring < 3; ring++) {
          const ringAge = age - ring * 0.25;
          if (ringAge < 0) continue;
          const rippleProgress = Math.min(ringAge / 1.2, 1);
          const rippleR = LIVE_DOT.r + rippleProgress * 28;
          const rippleAlpha = (1 - rippleProgress) * 0.6;
          ctx.save();
          ctx.globalAlpha = rippleAlpha;
          ctx.strokeStyle = LIVE_DOT.color;
          ctx.lineWidth = 1.5 * (1 - rippleProgress);
          ctx.beginPath();
          ctx.arc(px, py, rippleR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        const dotAlpha = Math.min(age / 0.3, 1);
        const dotAngle = Math.atan2(py - cy, px - cx);
        let behind = (sweepAngle - dotAngle + Math.PI * 2) % (Math.PI * 2);
        const glow = behind < 1.5 ? (1 - behind / 1.5) : 0;

        ctx.save();
        ctx.globalAlpha = dotAlpha * (0.55 + glow * 0.45);
        ctx.fillStyle = LIVE_DOT.color;
        ctx.beginPath();
        ctx.arc(px, py, LIVE_DOT.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = dotAlpha * 0.5;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

/* ── LandingPage ── */
function LandingPage({ onNavigate }) {
  return (
    <div className="landing">

      {/* ── Hero ── */}
      <section className="hero-section">
        <RadarMockMap />
        
        <div className="hero-content">
          <div className="hero-eyebrow">
            Hyperlocal · Environmental · Monitoring
          </div>

          <h1 className="hero-h1">
            The pollution your<br />
            city doesn't<br />
            <span className="hero-h1-accent">track yet.</span>
          </h1>

          <p className="hero-p">
            City-wide AQI sensors measure averages. They miss the burning trash
            heap 200 metres from your school, the chemical dump behind the
            housing complex, the diesel generator running next to a playground.
            PrakritiPrahari fills that gap — one report at a time.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={() => onNavigate("submit")}>
              <ClipboardList size={16} />
              Report an Incident
            </button>
            <button className="btn-ghost" onClick={() => onNavigate("map")}>
              View Live Map
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="hero-stats">
            <div className="hero-stat-item">
              <div className="hero-stat-num">Live</div>
              <div className="hero-stat-label">Every report pinned to the map instantly</div>
            </div>
            <div className="hero-stat-item">
              <div className="hero-stat-num">AI</div>
              <div className="hero-stat-label">Gemini severity scoring</div>
            </div>
            <div className="hero-stat-item">
              <div className="hero-stat-num">13</div>
              <div className="hero-stat-label">Indian languages supported</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem statement (no statistic, no citation needed) ── */}
      <section className="problem-section">
        <div className="problem-inner">
          <p className="problem-text">
            <strong>Street-level pollution hotspots are invisible to existing monitoring networks.</strong>{" "}
            Open burning, illegal dumping, construction dust, and industrial leaks happen on specific
            streets — not statistical averages. Residents near them have no way to report, escalate,
            or track resolution. PrakritiPrahari gives them that tool.
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="steps-section">
        <div className="steps-inner">
          <div className="steps-eyebrow">How it works</div>
          <h2 className="steps-heading">From report to resolution</h2>
          <div className="steps-grid">

            <div className="step-card">
              <div className="step-card-num">01</div>
              <div className="step-card-icon">
                <ClipboardList size={26} strokeWidth={1.5} />
              </div>
              <h3 className="step-card-title">Document</h3>
              <p className="step-card-body">
                Describe what you see in any language. Attach a photo, audio clip,
                or video — any combination. Even a single text message is enough to start a report.
              </p>
            </div>

            <div className="step-card">
              <div className="step-card-num">02</div>
              <div className="step-card-icon">
                <Cpu size={26} strokeWidth={1.5} />
              </div>
              <h3 className="step-card-title">Analyze</h3>
              <p className="step-card-body">
                Gemini classifies the incident automatically: pollutant type, severity score
                (1–5), and a recommended response action — in seconds.
              </p>
            </div>

            <div className="step-card">
              <div className="step-card-num">03</div>
              <div className="step-card-icon">
                <MapIcon size={26} strokeWidth={1.5} />
              </div>
              <h3 className="step-card-title">Map</h3>
              <p className="step-card-body">
                The incident pins to a live community map. Citizens and authorities
                can view it, discuss it, and mark it resolved once addressed.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="landing-cta">
        <div className="cta-inner">
          <h2 className="cta-heading">See something? Report it.</h2>
          <p className="cta-body">
            Every report makes the map more accurate for your street and your neighbourhood.
          </p>
          <button className="btn-primary" onClick={() => onNavigate("submit")}>
            Start a Report
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-name">Kavitha Haima Kidambi</div>
        <div className="landing-footer-tagline">
          PrakritiPrahari — Hyperlocal pollution tracking that city sensors miss.
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
