import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { t } from "@/lib/neda/i18n";
import type { LangCode } from "@/lib/neda/countries";

interface DangerReport {
  id: string;
  reporter_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  expires_at: string;
}

interface ReportWithDistance extends DangerReport {
  distanceKm: number;
  /** bearing in radians, 0 = north, clockwise. */
  bearing: number;
}

const RADIUS_KM = 5; // visible scope of the radar disc.
const MAX_REPORT_KM = 50; // we still pull within 50km, but plot at edge if outside disc.

// Tehran fallback for demo when GPS is unavailable (e.g. Lovable preview iframe).
const FALLBACK_POS = { lat: 35.6892, lon: 51.389 };

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function bearingRad(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x); // 0 = north, clockwise.
}

/** Cluster nearby reports so overlapping pings render as a single, larger blip. */
function clusterReports(reports: ReportWithDistance[]): Array<ReportWithDistance & { count: number }> {
  const clusters: Array<ReportWithDistance & { count: number }> = [];
  const CLUSTER_KM = 0.15;
  for (const r of reports) {
    const hit = clusters.find(
      (c) =>
        haversine(
          { lat: c.latitude, lon: c.longitude },
          { lat: r.latitude, lon: r.longitude },
        ) < CLUSTER_KM,
    );
    if (hit) {
      hit.count += 1;
    } else {
      clusters.push({ ...r, count: 1 });
    }
  }
  return clusters;
}

export function RadarTab() {
  const { identity } = useIdentity();
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [posSource, setPosSource] = useState<"gps" | "simulated" | null>(null);
  const [reports, setReports] = useState<ReportWithDistance[]>([]);
  const [reporting, setReporting] = useState(false);
  const [reportedAt, setReportedAt] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reportsRef = useRef<ReportWithDistance[]>([]);
  const rafRef = useRef<number | null>(null);

  const lang: LangCode = (identity?.language ?? "en") as LangCode;

  // Keep latest reports accessible to the animation loop without restart.
  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  // Get geolocation (with fallback to Tehran for demo).
  useEffect(() => {
    let resolved = false;
    const useFallback = () => {
      if (resolved) return;
      resolved = true;
      setPos(FALLBACK_POS);
      setPosSource("simulated");
    };

    if (!("geolocation" in navigator)) {
      useFallback();
      return;
    }

    // Hard timeout in case the browser hangs (common in iframes).
    const timeoutId = window.setTimeout(useFallback, 4000);

    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (resolved) return;
        resolved = true;
        window.clearTimeout(timeoutId);
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        setPosSource("gps");
      },
      () => {
        window.clearTimeout(timeoutId);
        useFallback();
      },
      { timeout: 3500, maximumAge: 60000 },
    );

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function loadReports() {
    if (!pos) return;
    const { data } = await supabase
      .from("danger_reports")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (!data) return;
    const enriched = data
      .map((r) => ({
        ...r,
        distanceKm: haversine(
          { lat: pos.lat, lon: pos.lon },
          { lat: r.latitude, lon: r.longitude },
        ),
        bearing: bearingRad(
          { lat: pos.lat, lon: pos.lon },
          { lat: r.latitude, lon: r.longitude },
        ),
      }))
      .filter((r) => r.distanceKm <= MAX_REPORT_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    setReports(enriched);
  }

  // Initial + realtime updates.
  useEffect(() => {
    if (!pos) return;
    loadReports();
    const channel = supabase
      .channel("danger:all")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "danger_reports" },
        () => loadReports(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Canvas radar render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Persistent phosphor layer — accumulates the sweep glow and slowly fades.
    const phosphor = document.createElement("canvas");
    const pctx = phosphor.getContext("2d");
    if (!pctx) return;

    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Match phosphor buffer to canvas (logical px — we'll draw in CSS units).
      phosphor.width = Math.floor(width * dpr);
      phosphor.height = Math.floor(height * dpr);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.clearRect(0, 0, width, height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const GREEN = "#00ff41";
    const GREEN_DIM = "rgba(0, 255, 65, 0.25)";
    const GREEN_FAINT = "rgba(0, 255, 65, 0.12)";
    const GREEN_LABEL = "rgba(0, 255, 65, 0.55)";
    const BG = "#001208";
    const RED = "#ff2b2b";

    const start = performance.now();
    let lastT = start;

    const draw = (t: number) => {
      const elapsed = (t - start) / 1000;
      const dt = Math.min(0.1, (t - lastT) / 1000);
      lastT = t;

      // Background — dark green/black.
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(width, height) / 2 - 12;

      // Fine grid network across the whole canvas (CRT feel).
      ctx.strokeStyle = "rgba(0, 255, 65, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const GRID = 22;
      for (let x = (cx % GRID); x < width; x += GRID) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = (cy % GRID); y < height; y += GRID) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Outer disc fill (slightly lighter than bg).
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 40, 18, 0.55)";
      ctx.fill();

      // Concentric rings: 1km, 2km, 5km (relative to RADIUS_KM scope).
      const ringDistances = [1, 2, 5];
      ctx.lineWidth = 1;
      for (const km of ringDistances) {
        const r = (km / RADIUS_KM) * maxR;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = GREEN_DIM;
        ctx.stroke();
      }

      // Outer ring (full radius).
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.strokeStyle = GREEN_DIM;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Crosshairs.
      ctx.strokeStyle = GREEN_FAINT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Diagonal grid lines (45°).
      const diag = maxR * Math.SQRT1_2;
      ctx.strokeStyle = "rgba(0, 255, 65, 0.06)";
      ctx.beginPath();
      ctx.moveTo(cx - diag, cy - diag);
      ctx.lineTo(cx + diag, cy + diag);
      ctx.moveTo(cx - diag, cy + diag);
      ctx.lineTo(cx + diag, cy - diag);
      ctx.stroke();

      // Tick marks around the perimeter.
      ctx.strokeStyle = GREEN_DIM;
      for (let i = 0; i < 360; i += 10) {
        const a = (i * Math.PI) / 180;
        const inner = i % 30 === 0 ? maxR - 8 : maxR - 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
        ctx.stroke();
      }

      // Distance labels.
      ctx.fillStyle = GREEN_LABEL;
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const km of ringDistances) {
        const r = (km / RADIUS_KM) * maxR;
        ctx.fillText(`${km}km`, cx + r + 4, cy - 6);
      }

      // Cardinal labels (N/E/S/W).
      ctx.fillStyle = GREEN;
      ctx.font = "bold 11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", cx, cy - maxR - 2);
      ctx.fillText("S", cx, cy + maxR + 2);
      ctx.fillText("E", cx + maxR + 4, cy);
      ctx.fillText("W", cx - maxR - 4, cy);

      // ---------- SWEEP + PHOSPHOR TRAIL ----------
      // Sweep angle (clockwise, ~4s per rotation), 0 = north (-π/2).
      const sweepAngle = (elapsed * (Math.PI * 2)) / 4 - Math.PI / 2;
      const trailRad = (Math.PI * 90) / 180; // 90° wide trail.

      // 1) Fade the persistent phosphor layer slightly each frame (CRT decay).
      pctx.save();
      pctx.globalCompositeOperation = "destination-out";
      // Decay rate tuned so trail fully fades over ~1s (matches 90° at 4s/rev).
      pctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.5, dt * 1.1)})`;
      pctx.fillRect(0, 0, width, height);
      pctx.restore();

      // 2) Paint a fresh wedge into the phosphor layer at the sweep's leading edge,
      //    clipped to the radar disc, with a radial soft edge.
      pctx.save();
      pctx.beginPath();
      pctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      pctx.clip();

      // Narrow, bright leading wedge (the "fresh" phosphor excitation).
      const leadWedge = (Math.PI * 6) / 180; // 6° leading slice
      pctx.beginPath();
      pctx.moveTo(cx, cy);
      pctx.arc(cx, cy, maxR, sweepAngle - leadWedge, sweepAngle);
      pctx.closePath();
      // Radial gradient: dim at center, bright at rim (more energy at scan edge).
      const radial = pctx.createRadialGradient(cx, cy, maxR * 0.1, cx, cy, maxR);
      radial.addColorStop(0, "rgba(0, 255, 65, 0.05)");
      radial.addColorStop(1, "rgba(0, 255, 65, 0.55)");
      pctx.fillStyle = radial;
      pctx.fill();
      pctx.restore();

      // 3) Composite phosphor layer onto main canvas (additive-ish via lighter).
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(phosphor, 0, 0, width, height);
      ctx.restore();

      // 4) Optional extra conic-gradient "afterglow" wedge for visible width
      //    behind the leading edge — gives the wide 90° fade-out look immediately.
      if (ctx.createConicGradient) {
        const grad = ctx.createConicGradient(sweepAngle, cx, cy);
        grad.addColorStop(0, "rgba(0, 255, 65, 0.0)");
        grad.addColorStop(0.0005, "rgba(0, 255, 65, 0.42)");
        grad.addColorStop(trailRad / (Math.PI * 2), "rgba(0, 255, 65, 0.0)");
        grad.addColorStop(1, "rgba(0, 255, 65, 0.0)");
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, sweepAngle - trailRad, sweepAngle);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // 5) Bright leading sweep line — strong glow, like a beam of light.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      ctx.strokeStyle = "#aaffbb";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = GREEN;
      ctx.shadowBlur = 24;
      ctx.stroke();
      // Inner hot core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Self-position pulse (center).
      const pulse = (Math.sin(elapsed * 3) + 1) / 2; // 0..1
      ctx.save();
      ctx.fillStyle = GREEN;
      ctx.shadowColor = GREEN;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4 - pulse * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + pulse * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Plot reports as red pulsing blips.
      const clusters = clusterReports(reportsRef.current);
      for (const c of clusters) {
        // Project: bearing 0=N (up), clockwise. Canvas: angle 0=E (right), clockwise.
        const a = c.bearing - Math.PI / 2;
        const distNorm = Math.min(1, c.distanceKm / RADIUS_KM);
        // If outside scope, place at edge with reduced opacity.
        const edge = c.distanceKm > RADIUS_KM;
        const r = edge ? maxR - 6 : distNorm * maxR;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;

        // Highlight when sweep passes by (within ~20°).
        let angleFromSweep = ((a - sweepAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        // Normalize so brightest right after sweep passes (going backwards in trail direction).
        if (angleFromSweep > Math.PI) angleFromSweep -= Math.PI * 2;
        const sweepProximity = Math.max(
          0,
          1 - Math.abs(angleFromSweep) / (Math.PI / 9), // 20° window
        );

        const baseSize = edge ? 3 : 4 + Math.min(6, c.count * 1.5);
        const localPulse = (Math.sin(elapsed * 4 + c.distanceKm) + 1) / 2;
        const alpha = edge ? 0.45 : 0.7 + sweepProximity * 0.3;

        ctx.save();
        ctx.shadowColor = RED;
        ctx.shadowBlur = 14 + sweepProximity * 16;
        ctx.fillStyle = `rgba(255, 43, 43, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, baseSize, 0, Math.PI * 2);
        ctx.fill();
        // Outer pulse ring.
        ctx.globalAlpha = (0.35 + sweepProximity * 0.35) * (1 - localPulse);
        ctx.strokeStyle = RED;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, baseSize + 4 + localPulse * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Cluster count badge.
        if (c.count > 1) {
          ctx.save();
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.font = "bold 9px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          ctx.fillText(String(c.count), px, py);
          ctx.restore();
        }
      }

      // Subtle scanlines for CRT feel.
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#000";
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1);
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  async function reportDanger() {
    if (!identity || !pos || reporting) return;
    setReporting(true);
    try {
      const { error } = await supabase.from("danger_reports").insert({
        reporter_id: identity.id,
        latitude: pos.lat,
        longitude: pos.lon,
      });
      if (!error) {
        setReportedAt(Date.now());
        window.setTimeout(() => setReportedAt(null), 2500);
        await loadReports();
      }
    } finally {
      setReporting(false);
    }
  }

  const reportCount = reports.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-[#001208]">
      {/* Full-bleed canvas radar */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 block" />

        {/* HUD overlay — top */}
        <div className="absolute top-0 inset-x-0 px-4 py-3 flex items-start justify-between pointer-events-none">
          <div className="text-[10px] tracking-[0.25em] text-[#00ff41]/80">
            ◉ {t(lang, "radar_title")}
          </div>
          <div className="text-[10px] tracking-wider text-[#00ff41]/70 text-right">
            <div>RNG {RADIUS_KM}KM</div>
            <div className="tabular-nums">{reportCount} CONTACTS</div>
          </div>
        </div>

        {/* HUD overlay — bottom-left coords */}
        {pos && (
          <div className="absolute bottom-3 left-3 text-[10px] text-[#00ff41]/70 tracking-wider pointer-events-none tabular-nums">
            <div>LAT {pos.lat.toFixed(4)}</div>
            <div>LON {pos.lon.toFixed(4)}</div>
            {posSource === "simulated" && (
              <div className="mt-1 text-amber-400/90 neda-blink">
                ⚠ {t(lang, "radar_simulated")}
              </div>
            )}
          </div>
        )}

        {/* HUD overlay — bottom-right status */}
        <div className="absolute bottom-3 right-3 text-[10px] text-[#00ff41]/70 tracking-wider pointer-events-none">
          {reportCount === 0 ? (
            <span className="text-[#00ff41]/80">— {t(lang, "radar_empty")} —</span>
          ) : (
            <span className="text-red-400 neda-blink">⚠ THREATS DETECTED</span>
          )}
        </div>
      </div>

      {/* Action button */}
      <div className="border-t border-[#00ff41]/20 p-3 bg-[#001208]">
        {reportedAt && (
          <div className="text-[11px] text-[#00ff41] uppercase mb-2 text-center neda-blink">
            ✓ {t(lang, "reported")}
          </div>
        )}
        <button
          type="button"
          onClick={reportDanger}
          disabled={!pos || reporting}
          className="w-full px-3 py-3 border border-red-500 text-red-400 text-xs uppercase tracking-wider disabled:opacity-30 hover:bg-red-500/10 transition-colors"
        >
          {reporting ? t(lang, "reporting") : `⚠ ${t(lang, "report_danger")}`}
        </button>
      </div>
    </div>
  );
}
