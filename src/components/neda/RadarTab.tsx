import { useEffect, useState } from "react";
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
}

const RADIUS_KM = 50;

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatAgo(iso: string, lang: LangCode): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(1, Math.round(diff / 60000));
  if (m < 60) return `${m}m ${t(lang, "radar_ago")}`;
  const h = Math.round(m / 60);
  return `${h}h ${t(lang, "radar_ago")}`;
}

export function RadarTab() {
  const { identity } = useIdentity();
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [posState, setPosState] = useState<"loading" | "ok" | "denied">("loading");
  const [reports, setReports] = useState<ReportWithDistance[]>([]);
  const [reporting, setReporting] = useState(false);
  const [reportedAt, setReportedAt] = useState<number | null>(null);

  const lang: LangCode = (identity?.language ?? "en") as LangCode;

  // Get geolocation.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setPosState("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        setPosState("ok");
      },
      () => setPosState("denied"),
      { timeout: 8000, maximumAge: 60000 },
    );
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
      }))
      .filter((r) => r.distanceKm <= RADIUS_KM)
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
  }, [pos]);

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Radar visualization */}
      <div className="border-b border-border px-4 py-4 flex flex-col items-center">
        <div className="relative w-48 h-48 border border-signal/40 rounded-none overflow-hidden">
          {/* Concentric squares */}
          <div className="absolute inset-4 border border-signal/20" />
          <div className="absolute inset-10 border border-signal/20" />
          <div className="absolute inset-16 border border-signal/20" />
          {/* Crosshairs */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-signal/20" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-signal/20" />
          {/* Sweep */}
          <div className="absolute inset-0 radar-sweep pointer-events-none" />
          {/* Self dot */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-signal" />
          {/* Plot reports */}
          {pos &&
            reports.map((r) => {
              // Map distance to 0..1, project on bearing.
              const dx = r.longitude - pos.lon;
              const dy = r.latitude - pos.lat;
              const norm = Math.sqrt(dx * dx + dy * dy) || 1;
              const radius = Math.min(0.45, r.distanceKm / RADIUS_KM * 0.45);
              const px = 0.5 + (dx / norm) * radius;
              const py = 0.5 - (dy / norm) * radius;
              return (
                <div
                  key={r.id}
                  className="absolute w-1.5 h-1.5 bg-destructive neda-blink"
                  style={{
                    left: `${px * 100}%`,
                    top: `${py * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              );
            })}
        </div>
        <div className="mt-3 text-[10px] uppercase text-muted-foreground tracking-wider">
          {t(lang, "radar_title")} · {RADIUS_KM} {t(lang, "radar_distance")}
        </div>
        <div className="text-[10px] text-muted-foreground/70 mt-1">
          {t(lang, "radar_hint")}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {posState === "loading" && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground uppercase">
            {t(lang, "radar_loading")}
          </div>
        )}
        {posState === "denied" && (
          <div className="px-4 py-8 text-center text-xs text-destructive uppercase">
            {t(lang, "radar_no_gps")}
          </div>
        )}
        {posState === "ok" && reports.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground uppercase">
            — {t(lang, "radar_empty")} —
          </div>
        )}
        <ul className="divide-y divide-border">
          {reports.map((r) => (
            <li key={r.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-destructive flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-destructive neda-blink" />
                  ⚠ DANGER
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {r.distanceKm.toFixed(1)} {t(lang, "radar_distance")} · {formatAgo(r.created_at, lang)}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Action */}
      <div className="border-t border-border p-3">
        {reportedAt && (
          <div className="text-[11px] text-signal uppercase mb-2 text-center">
            ✓ {t(lang, "reported")}
          </div>
        )}
        <button
          type="button"
          onClick={reportDanger}
          disabled={!pos || reporting}
          className="w-full px-3 py-3 border border-destructive text-destructive text-xs uppercase tracking-wider disabled:opacity-30 hover:bg-destructive/10 transition-colors"
        >
          {reporting ? t(lang, "reporting") : `⚠ ${t(lang, "report_danger")}`}
        </button>
      </div>
    </div>
  );
}
