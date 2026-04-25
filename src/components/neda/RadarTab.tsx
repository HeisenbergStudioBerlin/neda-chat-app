import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { t } from "@/lib/neda/i18n";
import type { LangCode } from "@/lib/neda/countries";
import radarMapBg from "@/assets/radar-map.png";

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
const TILE_ZOOM = 13; // OSM zoom level — ~5km radius fits well at z13.

// Tehran fallback for demo when GPS is unavailable (e.g. Lovable preview iframe).
const FALLBACK_POS = { lat: 35.6892, lon: 51.389 };

// ---- Simulated contacts (demo / hackathon) ----
interface SimContact {
  id: string;
  kind: "threat" | "peer";
  /** offset from user in km (north +, east +) */
  dx: number;
  dy: number;
  /** seconds since app start when it appeared */
  bornAt: number;
  /** total lifetime in seconds */
  life: number;
}

function randomInRadius(maxKm: number): { dx: number; dy: number } {
  const r = Math.sqrt(Math.random()) * maxKm * 0.95;
  const a = Math.random() * Math.PI * 2;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

/** Convert a lat/lon to an OSM tile (x,y,z) at integer zoom. */
function lonLatToTile(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const xt = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yt =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x: xt, y: yt, z };
}


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
  const simContactsRef = useRef<SimContact[]>([]);
  const [simStats, setSimStats] = useState<{ threats: number; peers: number }>({
    threats: 0,
    peers: 0,
  });
  const rafRef = useRef<number | null>(null);

  // Compass heading: target = latest device alpha, smoothed = lerped value drawn to canvas.
  const headingTargetRef = useRef<number | null>(null);
  const headingSmoothedRef = useRef<number>(0);
  const [hasCompass, setHasCompass] = useState(false);
  const [headingDisplay, setHeadingDisplay] = useState<number | null>(null);

  const lang: LangCode = (identity?.language ?? "en") as LangCode;

  // Keep latest reports accessible to the animation loop without restart.
  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  // ---- Simulated contacts spawner (demo / hackathon) ----
  useEffect(() => {
    const start = performance.now();
    const MAX_THREATS = 6;

    const spawnThreat = () => {
      const list = simContactsRef.current;
      const threats = list.filter((s) => s.kind === "threat").length;
      if (threats >= MAX_THREATS) return;
      const { dx, dy } = randomInRadius(RADIUS_KM);
      const t = (performance.now() - start) / 1000;
      list.push({
        id: `t_${t.toFixed(3)}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "threat",
        dx,
        dy,
        bornAt: t,
        life: 20 + Math.random() * 10,
      });
    };

    const spawnPeer = () => {
      const list = simContactsRef.current;
      const { dx, dy } = randomInRadius(RADIUS_KM);
      const t = (performance.now() - start) / 1000;
      list.push({
        id: `p_${t.toFixed(3)}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "peer",
        dx,
        dy,
        bornAt: t,
        life: 18 + Math.random() * 14,
      });
    };

    // Initial population so the radar isn't empty on first paint.
    for (let i = 0; i < 3; i++) spawnThreat();
    for (let i = 0; i < 9; i++) spawnPeer();

    const tick = window.setInterval(() => {
      const t = (performance.now() - start) / 1000;
      simContactsRef.current = simContactsRef.current.filter(
        (s) => t - s.bornAt < s.life,
      );
      if (Math.random() < 0.35) spawnThreat();
      const threats = simContactsRef.current.filter((s) => s.kind === "threat").length;
      const peers = simContactsRef.current.filter((s) => s.kind === "peer").length;
      const targetPeers = Math.max(threats * 3, 6);
      if (peers < targetPeers) spawnPeer();
      setSimStats({ threats, peers });
    }, 2500);

    return () => window.clearInterval(tick);
  }, []);

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

  // Device compass — use deviceorientation alpha as heading.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handle = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading on iOS Safari is the "true" compass heading (already inverted).
      const w = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let alpha: number | null = null;
      if (typeof w.webkitCompassHeading === "number") {
        alpha = w.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        alpha = 360 - e.alpha; // alpha is counter-clockwise from N → invert.
      }
      if (alpha === null || Number.isNaN(alpha)) return;
      headingTargetRef.current = ((alpha % 360) + 360) % 360;
      setHasCompass(true);
    };

    // iOS 13+ requires explicit permission after a user gesture.
    type IOSOrientationCtor = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const Ctor = DeviceOrientationEvent as unknown as IOSOrientationCtor;
    const needsIOSPermission = typeof Ctor.requestPermission === "function";

    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      window.addEventListener("deviceorientation", handle, true);
    };

    if (needsIOSPermission) {
      // Wait for any user interaction to request permission, then attach.
      const onGesture = async () => {
        try {
          const res = await Ctor.requestPermission!();
          if (res === "granted") attach();
        } catch {
          // ignore — falls back to static labels.
        }
        window.removeEventListener("touchend", onGesture);
        window.removeEventListener("click", onGesture);
      };
      window.addEventListener("touchend", onGesture, { once: true });
      window.addEventListener("click", onGesture, { once: true });
    } else {
      attach();
    }

    return () => {
      if (attached) window.removeEventListener("deviceorientation", handle, true);
    };
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

    const GREEN = "#00d4ff";
    const GREEN_DIM = "rgba(0, 212, 255, 0.25)";
    const GREEN_FAINT = "rgba(0, 212, 255, 0.12)";
    const GREEN_LABEL = "rgba(0, 212, 255, 0.55)";
    const BG_WASH = "rgba(0, 10, 18, 0.46)";
    const RED = "#ff2b2b";

    const start = performance.now();
    let lastT = start;
    let lastHudFrame = -1;

    const draw = (t: number) => {
      const elapsed = (t - start) / 1000;
      const dt = Math.min(0.1, (t - lastT) / 1000);
      lastT = t;

      // Background wash — keep alpha so the street map layer directly behind the
      // radar remains visible while points/sweep stay on the top canvas.
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG_WASH;
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(width, height) / 2 - 12;

      // Fine grid network across the whole canvas (CRT feel).
      ctx.strokeStyle = "rgba(0, 212, 255, 0.06)";
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
      ctx.fillStyle = "rgba(0, 20, 40, 0.26)";
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
      ctx.strokeStyle = "rgba(0, 212, 255, 0.06)";
      ctx.beginPath();
      ctx.moveTo(cx - diag, cy - diag);
      ctx.lineTo(cx + diag, cy + diag);
      ctx.moveTo(cx - diag, cy + diag);
      ctx.lineTo(cx + diag, cy - diag);
      ctx.stroke();

      // ---------- COMPASS HEADING (smoothed lerp) ----------
      // Lerp smoothed → target with shortest-path angular interpolation.
      const target = headingTargetRef.current;
      if (target !== null) {
        let cur = headingSmoothedRef.current;
        let diff = ((target - cur + 540) % 360) - 180; // shortest path in [-180, 180]
        cur = (cur + diff * 0.15 + 360) % 360;
        headingSmoothedRef.current = cur;
      }
      // Convert heading (0=N, clockwise) to canvas rotation: rotate ring by -heading
      // so that N marker points to true north regardless of device orientation.
      const headingRad = (headingSmoothedRef.current * Math.PI) / 180;
      const ringRotation = -headingRad;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ringRotation);

      // Tick marks around the perimeter (rotated with compass).
      ctx.strokeStyle = GREEN_DIM;
      for (let i = 0; i < 360; i += 10) {
        // Canvas 0 = east; subtract π/2 so tick "0" sits at top (north).
        const a = (i * Math.PI) / 180 - Math.PI / 2;
        const inner = i % 30 === 0 ? maxR - 8 : maxR - 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * maxR, Math.sin(a) * maxR);
        ctx.stroke();
      }

      // Cardinal labels (N/E/S/W) — drawn rotated with the ring, but each
      // glyph itself counter-rotated so it stays upright/readable.
      ctx.fillStyle = GREEN;
      ctx.font = "bold 11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cardinals: Array<[string, number]> = [
        ["N", -Math.PI / 2],
        ["E", 0],
        ["S", Math.PI / 2],
        ["W", Math.PI],
      ];
      const labelR = maxR + 8;
      for (const [label, ang] of cardinals) {
        const lx = Math.cos(ang) * labelR;
        const ly = Math.sin(ang) * labelR;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(-ringRotation); // keep glyphs upright
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      ctx.restore();

      // Distance labels (NOT rotated — relative to user).
      ctx.fillStyle = GREEN_LABEL;
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const km of ringDistances) {
        const r = (km / RADIUS_KM) * maxR;
        ctx.fillText(`${km}km`, cx + r + 4, cy - 6);
      }


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
      radial.addColorStop(0, "rgba(0, 212, 255, 0.05)");
      radial.addColorStop(1, "rgba(0, 212, 255, 0.55)");
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
        grad.addColorStop(0, "rgba(0, 212, 255, 0.0)");
        grad.addColorStop(0.0005, "rgba(0, 212, 255, 0.42)");
        grad.addColorStop(trailRad / (Math.PI * 2), "rgba(0, 212, 255, 0.0)");
        grad.addColorStop(1, "rgba(0, 212, 255, 0.0)");
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
      ctx.strokeStyle = "#aaeeff";
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

        // Sweep flash: brightest right as the beam crosses, decays over ~1.2s.
        // angleFromSweep > 0 means sweep already passed (in trail direction).
        let angleFromSweep = ((a - sweepAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (angleFromSweep > Math.PI) angleFromSweep -= Math.PI * 2;

        // Time (s) since the sweep last hit this bearing (sweep does 2π in 4s → π/2 rad/s).
        // If beam not yet reached, treat as "long ago" (no flash).
        const radPerSec = (Math.PI * 2) / 4;
        const timeSinceHit = angleFromSweep >= 0 ? angleFromSweep / radPerSec : 999;
        // Flash envelope: 1 at hit, exponential decay, gone after ~1.2s.
        const flash = Math.max(0, Math.exp(-timeSinceHit * 2.2));

        const baseSize = edge ? 3 : 4 + Math.min(6, c.count * 1.5);
        const localPulse = (Math.sin(elapsed * 5 + c.distanceKm * 2) + 1) / 2;
        const alpha = edge ? 0.45 + flash * 0.4 : 0.55 + flash * 0.45;

        ctx.save();
        ctx.shadowColor = RED;
        ctx.shadowBlur = 12 + flash * 28;
        ctx.fillStyle = `rgba(255, 43, 43, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, baseSize + flash * 2, 0, Math.PI * 2);
        ctx.fill();

        // Bright hot core during flash.
        if (flash > 0.3) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(255, 220, 220, ${flash * 0.9})`;
          ctx.beginPath();
          ctx.arc(px, py, baseSize * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        // Continuous pulse ring (always visible, stronger right after flash).
        ctx.globalAlpha = (0.35 + flash * 0.5) * (1 - localPulse);
        ctx.strokeStyle = RED;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, baseSize + 4 + localPulse * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Cluster count badge.
        if (c.count > 1) {
          ctx.save();
          ctx.font = "bold 9px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          ctx.fillText(String(c.count), px, py);
          ctx.restore();
        }
      }

      // ---------- SIMULATED CONTACTS (peers + threats) ----------
      const kmToPx = maxR / RADIUS_KM;
      const sims = simContactsRef.current;
      const radPerSecSim = (Math.PI * 2) / 4;
      for (const s of sims) {
        const px = cx + s.dx * kmToPx;
        const py = cy - s.dy * kmToPx;
        const dist = Math.hypot(px - cx, py - cy);
        if (dist > maxR - 2) continue;

        const age = elapsed - s.bornAt;
        const remaining = s.life - age;
        const lifeAlpha =
          age < 1 ? Math.max(0, age) : remaining < 1.5 ? Math.max(0, remaining / 1.5) : 1;
        if (lifeAlpha <= 0) continue;

        const a = Math.atan2(py - cy, px - cx);
        let angleFromSweep =
          (((a - sweepAngle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (angleFromSweep > Math.PI) angleFromSweep -= Math.PI * 2;
        const timeSinceHit = angleFromSweep >= 0 ? angleFromSweep / radPerSecSim : 999;
        const flash = Math.max(0, Math.exp(-timeSinceHit * 2.4));

        const isPeer = s.kind === "peer";
        const baseSize = isPeer ? 3 : 4;
        const color = isPeer ? "#00d4ff" : RED;
        const colorRgba = isPeer
          ? (al: number) => `rgba(0, 212, 255, ${al})`
          : (al: number) => `rgba(255, 43, 43, ${al})`;
        const localPulse = (Math.sin(elapsed * 4 + s.dx * 3 + s.dy * 5) + 1) / 2;
        const alpha = (0.5 + flash * 0.45) * lifeAlpha;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 + flash * 22;
        ctx.fillStyle = colorRgba(alpha);
        ctx.beginPath();
        ctx.arc(px, py, baseSize + flash * 1.6, 0, Math.PI * 2);
        ctx.fill();

        if (flash > 0.35) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = isPeer
            ? `rgba(220, 245, 255, ${flash * 0.85 * lifeAlpha})`
            : `rgba(255, 220, 220, ${flash * 0.9 * lifeAlpha})`;
          ctx.beginPath();
          ctx.arc(px, py, baseSize * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = (0.3 + flash * 0.45) * (1 - localPulse) * lifeAlpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, py, baseSize + 3 + localPulse * 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Subtle scanlines for CRT feel.
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#000";
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1);
      }
      ctx.restore();

      // Throttled HUD heading update (~5 Hz) so React doesn't re-render every frame.
      if (headingTargetRef.current !== null && Math.floor(elapsed * 5) !== lastHudFrame) {
        lastHudFrame = Math.floor(elapsed * 5);
        setHeadingDisplay(Math.round(headingSmoothedRef.current));
      }

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

  // Compute the 3×3 OSM tile grid centered on the user's position.
  // Renders behind the canvas, dark-inverted via CSS filters.
  const mapTiles = (() => {
    if (!pos) return null;
    const { x: tx, y: ty } = lonLatToTile(pos.lat, pos.lon, TILE_ZOOM);
    const xi = Math.floor(tx);
    const yi = Math.floor(ty);
    // Sub-tile offset (0..1) of the user inside the central tile.
    const offX = tx - xi;
    const offY = ty - yi;
    const TILE = 256;
    // Translate the 3-tile strip so the user's exact pixel sits at center.
    // Center = 1.5 tiles in; user is at xi + offX → shift by (offX - 0.5) tiles.
    const shiftX = -(offX - 0.5) * TILE - TILE * 1.5;
    const shiftY = -(offY - 0.5) * TILE - TILE * 1.5;
    const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        // Carto Dark — already dark-blue styled, no CSS filter required, no CORS issues.
        const url = `https://a.basemaps.cartocdn.com/dark_all/${TILE_ZOOM}/${xi + dx}/${yi + dy}@2x.png`;
        tiles.push({
          key: `${xi + dx}_${yi + dy}`,
          url,
          left: shiftX + (dx + 1) * TILE,
          top: shiftY + (dy + 1) * TILE,
        });
      }
    }
    return tiles;
  })();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-[#000a12]">
      {/* Full-bleed canvas radar */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {/* Carto Dark street-map tiles — clipped to a perfect circle behind the radar. */}
        {mapTiles && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            aria-hidden="true"
            style={{ zIndex: 1 }}
          >
            <div
              className="relative aspect-square h-full max-h-full"
              style={{
                clipPath: "circle(50% at 50% 50%)",
                WebkitClipPath: "circle(50% at 50% 50%)",
              }}
            >
              {/* Tile grid, anchored to user position at the center */}
              <div
                className="absolute"
                style={{
                  left: "50%",
                  top: "50%",
                  width: 0,
                  height: 0,
                  opacity: 0.85,
                }}
              >
                {mapTiles.map((tile) => (
                  <img
                    key={tile.key}
                    src={tile.url}
                    alt=""
                    width={256}
                    height={256}
                    loading="lazy"
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: `${tile.left}px`,
                      top: `${tile.top}px`,
                      width: 256,
                      height: 256,
                    }}
                  />
                ))}
              </div>
              {/* Subtle wash so streets read as faint texture, not foreground content. */}
              <div
                className="absolute inset-0"
                style={{ backgroundColor: "rgba(0, 10, 18, 0.4)" }}
              />
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 block"
          style={{ zIndex: 2 }}
        />


        {/* HUD overlay — top */}
        <div className="absolute top-0 inset-x-0 px-4 py-3 flex items-start justify-between pointer-events-none">
          <div className="text-[10px] tracking-[0.25em] text-[#00d4ff]/80">
            ◉ {t(lang, "radar_title")}
          </div>
          <div className="text-[10px] tracking-wider text-right tabular-nums leading-tight">
            <div className="text-[#00d4ff]/70">RNG {RADIUS_KM}KM</div>
            <div className="text-red-400">⚠ {simStats.threats + reportCount} THREATS</div>
            <div className="text-[#00d4ff]">◉ {simStats.peers} PEERS</div>
          </div>
        </div>

        {/* HUD overlay — bottom-left coords */}
        {pos && (
          <div className="absolute bottom-3 left-3 text-[10px] text-[#00d4ff]/70 tracking-wider pointer-events-none tabular-nums">
            <div>LAT {pos.lat.toFixed(4)}</div>
            <div>LON {pos.lon.toFixed(4)}</div>
            {hasCompass && headingDisplay !== null && (
              <div>HDG {String(headingDisplay).padStart(3, "0")}°</div>
            )}
            {posSource === "simulated" && (
              <div className="mt-1 text-amber-400/90 neda-blink">
                ⚠ {t(lang, "radar_simulated")}
              </div>
            )}
          </div>
        )}

        {/* HUD overlay — bottom-right status */}
        <div className="absolute bottom-3 right-3 text-[10px] tracking-wider pointer-events-none">
          {(simStats.threats + reportCount) === 0 ? (
            <span className="text-[#00d4ff]/80">— {t(lang, "radar_empty")} —</span>
          ) : (
            <span className="text-red-400 neda-blink">⚠ THREATS DETECTED</span>
          )}
        </div>
      </div>

      {/* Action button */}
      <div className="border-t border-[#00d4ff]/20 p-3 bg-[#000a12]">
        {reportedAt && (
          <div className="text-[11px] text-[#00d4ff] uppercase mb-2 text-center neda-blink">
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
