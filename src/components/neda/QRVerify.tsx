import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { supabase } from "@/integrations/supabase/client";
import { USER_CODE_REGEX } from "@/lib/neda/identity";

type Tab = "my" | "scan";

interface Props {
  myCode: string;
  myId: string;
  onClose: () => void;
  /** Called with a verified peer (exists in DB and is not self). */
  onPeerVerified: (peer: { peerId: string; peerCode: string }) => void;
}

export function QRVerify({ myCode, myId, onClose, onPeerVerified }: Props) {
  const [tab, setTab] = useState<Tab>("my");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Generate the user's QR.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(myCode, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((e) => console.error("qr generate failed", e));
    return () => {
      cancelled = true;
    };
  }, [myCode]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/95 animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="Verify"
    >
      <div className="w-full max-w-md mx-auto flex flex-col bg-[#0a0a0a] text-[#00d4ff] font-mono">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/30">
          <div className="text-sm tracking-[0.3em] font-bold">VERIFIZIEREN</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center border border-[#00d4ff]/40 hover:bg-[#00d4ff]/10 text-lg"
          >
            ×
          </button>
        </header>

        {/* Tabs */}
        <nav className="grid grid-cols-2 border-b border-[#00d4ff]/30">
          {(["my", "scan"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-[11px] uppercase tracking-wider transition-colors ${
                tab === id
                  ? "text-[#00d4ff] border-b-2 border-[#00d4ff]"
                  : "text-[#00d4ff]/40 border-b-2 border-transparent"
              }`}
            >
              {id === "my" ? "My QR" : "Scan"}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-6 flex flex-col">
          {tab === "my" ? (
            <MyQRPanel code={myCode} qrDataUrl={qrDataUrl} />
          ) : (
            <ScanPanel
              myId={myId}
              myCode={myCode}
              onPeerVerified={onPeerVerified}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function MyQRPanel({ code, qrDataUrl }: { code: string; qrDataUrl: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div className="text-[11px] uppercase tracking-[0.25em] text-[#00d4ff]/80">
        scannen zur verifizierung
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-[0_0_40px_rgba(0,212,255,0.15)]">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR for ${code}`}
            width={260}
            height={260}
            className="block w-[260px] h-[260px]"
          />
        ) : (
          <div className="w-[260px] h-[260px] flex items-center justify-center text-black/40 text-xs uppercase">
            generating...
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-lg tracking-widest text-[#00d4ff]">{code}</div>
        <div className="text-[10px] tracking-[0.4em] text-[#00d4ff]/50 uppercase">neda</div>
      </div>
    </div>
  );
}

interface ScanPanelProps {
  myId: string;
  myCode: string;
  onPeerVerified: (peer: { peerId: string; peerCode: string }) => void;
}

function ScanPanel({ myId, myCode, onPeerVerified }: ScanPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const decodedRef = useRef<string | null>(null);

  // Camera + scan loop.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("KAMERA NICHT VERFÜGBAR");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled || !videoRef.current) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        setCameraReady(true);
        loop();
      } catch (e) {
        console.warn("camera failed", e);
        setError("KAMERA NICHT VERFÜGBAR");
      }
    }

    function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data && !decodedRef.current) {
            decodedRef.current = code.data;
            handleDecoded(code.data);
            return;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecoded(raw: string) {
    const code = raw.trim().toLowerCase();
    if (!USER_CODE_REGEX.test(code)) {
      setManualError("INVALID QR");
      decodedRef.current = null;
      return;
    }
    if (code === myCode.toLowerCase()) {
      setManualError("THAT'S YOU");
      decodedRef.current = null;
      return;
    }
    await verifyAndOpen(code);
  }

  async function verifyAndOpen(code: string) {
    setVerifying(true);
    setManualError(null);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, user_code")
        .eq("user_code", code)
        .maybeSingle();
      if (error || !data) {
        setManualError("USER NOT FOUND");
        decodedRef.current = null;
        return;
      }
      if (data.id === myId) {
        setManualError("THAT'S YOU");
        decodedRef.current = null;
        return;
      }
      onPeerVerified({ peerId: data.id, peerCode: data.user_code });
    } finally {
      setVerifying(false);
    }
  }

  function submitManual() {
    const code = manualCode.trim().toLowerCase();
    if (!USER_CODE_REGEX.test(code)) {
      setManualError("FORMAT: @name1234");
      return;
    }
    if (code === myCode.toLowerCase()) {
      setManualError("THAT'S YOU");
      return;
    }
    verifyAndOpen(code);
  }

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-[#00d4ff]/80 text-center">
        scan a neda qr code
      </div>

      {!error && (
        <div className="relative mx-auto w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-black border border-[#00d4ff]/30 shadow-[0_0_40px_rgba(0,212,255,0.15)]">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan frame overlay */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Corners */}
            <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-[#00d4ff]" />
            <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-[#00d4ff]" />
            <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-[#00d4ff]" />
            <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-[#00d4ff]" />
            {/* Sweep line */}
            <div className="qr-scan-sweep absolute left-3 right-3 h-[2px] bg-[#00d4ff] shadow-[0_0_12px_#00d4ff]" />
          </div>

          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.3em] text-[#00d4ff]/60">
              starting camera...
            </div>
          )}
          {verifying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs uppercase tracking-[0.3em] text-[#00d4ff]">
              verifying...
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mx-auto w-full max-w-[320px] aspect-square rounded-2xl border border-dashed border-[#00d4ff]/40 flex items-center justify-center text-[11px] tracking-[0.3em] text-[#00d4ff]/70 uppercase">
          {error}
        </div>
      )}

      {/* Manual entry (always visible as fallback / quick option) */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[#00d4ff]/20">
        <label className="text-[10px] uppercase tracking-[0.3em] text-[#00d4ff]/60">
          {error ? "enter @name manually" : "or enter manually"}
        </label>
        <div className="flex gap-2">
          <input
            value={manualCode}
            onChange={(e) =>
              setManualCode(e.target.value.toLowerCase().replace(/\s/g, ""))
            }
            placeholder="@sam4805"
            className="flex-1 bg-transparent border border-[#00d4ff]/40 px-3 py-2 outline-none focus:border-[#00d4ff] text-[#00d4ff] placeholder:text-[#00d4ff]/30 text-sm"
          />
          <button
            type="button"
            onClick={submitManual}
            disabled={verifying}
            className="px-4 py-2 border border-[#00d4ff] text-[#00d4ff] text-[11px] uppercase tracking-wider hover:bg-[#00d4ff]/10 disabled:opacity-30"
          >
            go
          </button>
        </div>
        {manualError && (
          <div className="text-[11px] text-red-500 uppercase tracking-wider">
            {manualError}
          </div>
        )}
      </div>

      <style>{`
        @keyframes qr-sweep {
          0%   { top: 12px; opacity: 0.2; }
          50%  { opacity: 1; }
          100% { top: calc(100% - 14px); opacity: 0.2; }
        }
        .qr-scan-sweep {
          animation: qr-sweep 2.2s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
