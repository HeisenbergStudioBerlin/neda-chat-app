import { useEffect, useState } from "react";
import { Bluetooth, Wifi, Link2, Check, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
}

type Mode = "menu" | "bt" | "wifi";

interface Step {
  label: string;
  /** ms to wait before this step appears */
  at: number;
}

const BT_STEPS: Step[] = [
  { label: "Searching for devices...", at: 0 },
  { label: "Device found: Samsung A54", at: 1400 },
  { label: "Pairing...", at: 2600 },
  { label: "Sending NEDA (4.2 MB)...", at: 3800 },
  { label: "Transferring 100%", at: 6200 },
  { label: "✓ Complete!", at: 7100 },
];

const WIFI_STEPS: Step[] = [
  { label: "Starting WiFi Direct...", at: 0 },
  { label: "Broadcasting NEDA hotspot", at: 1200 },
  { label: "Peer connected: Pixel 8", at: 2600 },
  { label: "Sending NEDA (4.2 MB)...", at: 3700 },
  { label: "Transferring 100%", at: 5800 },
  { label: "✓ Complete!", at: 6700 },
];

export function ShareNeda({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [linkToast, setLinkToast] = useState<string | null>(null);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleLinkShare() {
    const url =
      typeof window !== "undefined" ? window.location.origin : "https://neda-chat-app.lovable.app";
    const shareData = {
      title: "NEDA",
      text: "NEDA — peer-to-peer emergency messaging.",
      url,
    };
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkToast("LINK COPIED!");
    } catch {
      setLinkToast(url);
    }
    window.setTimeout(() => setLinkToast(null), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Share NEDA"
    >
      <div className="w-full max-w-md mx-auto flex flex-col bg-[#0a0a0a] text-[#00d4ff] font-mono">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/30">
          <div className="text-sm tracking-[0.3em] font-bold">NEDA VERBREITEN</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center border border-[#00d4ff]/40 hover:bg-[#00d4ff]/10 text-lg"
          >
            ×
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {mode === "menu" && (
            <>
              <ShareCard
                icon={<Bluetooth size={26} strokeWidth={1.6} />}
                title="PER BLUETOOTH SENDEN"
                description="Sende NEDA direkt an ein Gerät in der Nähe"
                badge="ANDROID ONLY"
                onClick={() => setMode("bt")}
              />
              <ShareCard
                icon={<Wifi size={26} strokeWidth={1.6} />}
                title="PER WIFI DIRECT"
                description="Teile NEDA über WiFi Direct, kein Internet nötig"
                badge="ANDROID ONLY"
                onClick={() => setMode("wifi")}
              />
              <ShareCard
                icon={<Link2 size={26} strokeWidth={1.6} />}
                title="PER LINK / QR"
                description="Teile den NEDA-Link (braucht Internet beim Empfänger)"
                onClick={handleLinkShare}
              />

              {linkToast && (
                <div className="mt-1 text-[11px] tracking-[0.25em] uppercase text-[#00d4ff] border border-[#00d4ff]/40 bg-[#00d4ff]/5 px-3 py-2 text-center neda-blink">
                  ✓ {linkToast}
                </div>
              )}

              <p className="mt-auto pt-6 text-[10px] leading-relaxed tracking-wide text-[#00d4ff]/55">
                In der nativen Android-Version kann NEDA als APK direkt per Bluetooth oder WiFi
                Direct von Gerät zu Gerät weitergegeben werden, komplett ohne Internet. Die App
                verbreitet sich wie ein Lauffeuer.
              </p>
            </>
          )}

          {mode === "bt" && (
            <TransferSimulation
              title="BLUETOOTH TRANSFER"
              steps={BT_STEPS}
              onBack={() => setMode("menu")}
              icon={<Bluetooth size={20} strokeWidth={1.6} />}
            />
          )}

          {mode === "wifi" && (
            <TransferSimulation
              title="WIFI DIRECT TRANSFER"
              steps={WIFI_STEPS}
              onBack={() => setMode("menu")}
              icon={<Wifi size={20} strokeWidth={1.6} />}
            />
          )}
        </main>
      </div>
    </div>
  );
}

interface ShareCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}

function ShareCard({ icon, title, description, badge, onClick }: ShareCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-start gap-4 p-4 rounded-md border border-[#00d4ff]/30 hover:border-[#00d4ff] hover:bg-[#00d4ff]/[0.04] transition-colors"
    >
      <div className="shrink-0 w-11 h-11 flex items-center justify-center border border-[#00d4ff]/40 text-[#00d4ff] group-hover:border-[#00d4ff]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] tracking-[0.18em] text-[#00d4ff] font-bold">{title}</span>
          {badge && (
            <span className="text-[9px] tracking-[0.2em] text-amber-400/90 border border-amber-400/50 px-1.5 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-[#00d4ff]/65 tracking-wide normal-case">
          {description}
        </p>
      </div>
    </button>
  );
}

interface TransferSimulationProps {
  title: string;
  steps: Step[];
  icon: React.ReactNode;
  onBack: () => void;
}

function TransferSimulation({ title, steps, icon, onBack }: TransferSimulationProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  const totalDuration = steps[steps.length - 1].at + 600;
  const done = activeIdx >= steps.length - 1 && progress >= 100;

  // Schedule each step.
  useEffect(() => {
    const timers: number[] = [];
    steps.forEach((s, idx) => {
      const id = window.setTimeout(() => setActiveIdx(idx), s.at);
      timers.push(id);
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [steps]);

  // Drive progress bar smoothly across total duration.
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const pct = Math.min(100, ((t - start) / totalDuration) * 100);
      setProgress(pct);
      if (pct < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalDuration]);

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center border border-[#00d4ff]/50 text-[#00d4ff]">
          {icon}
        </div>
        <div>
          <div className="text-[12px] tracking-[0.25em] font-bold text-[#00d4ff]">{title}</div>
          <div className="text-[10px] tracking-[0.2em] text-[#00d4ff]/50 uppercase">
            simulated · demo
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="border border-[#00d4ff]/30 h-3 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-[#00d4ff]/70"
          style={{ width: `${progress}%`, transition: "width 80ms linear" }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-[9px] tracking-[0.3em] text-[#0a0a0a] font-bold mix-blend-difference">
          {Math.floor(progress)}%
        </div>
      </div>

      {/* Step log */}
      <ul className="flex flex-col gap-2 text-[12px] tracking-wide">
        {steps.map((s, idx) => {
          const reached = idx <= activeIdx;
          const isCurrent = idx === activeIdx && !done;
          const isComplete = idx < activeIdx || done;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-2 transition-opacity ${
                reached ? "opacity-100" : "opacity-30"
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center text-[#00d4ff]">
                {isComplete ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : isCurrent ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]/40" />
                )}
              </span>
              <span className={isComplete ? "text-[#00d4ff]" : "text-[#00d4ff]/80"}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-3 py-2 border border-[#00d4ff]/40 text-[#00d4ff] text-[11px] uppercase tracking-wider hover:bg-[#00d4ff]/10"
        >
          ← back
        </button>
      </div>

      <p className="text-[10px] leading-relaxed tracking-wide text-[#00d4ff]/55">
        Im echten Android-Build wird hier eine APK von Gerät zu Gerät gesendet — ohne Internet,
        ohne App Store. So verbreitet sich NEDA während eines Shutdowns.
      </p>
    </div>
  );
}
