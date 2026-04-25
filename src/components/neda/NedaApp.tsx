import { useEffect, useState } from "react";
import { useIdentity } from "@/hooks/use-identity";
import { Onboarding } from "./Onboarding";
import { MessagesTab } from "./MessagesTab";
import { GroupsTab } from "./GroupsTab";
import { RadarTab } from "./RadarTab";
import { QRVerify } from "./QRVerify";
import { ShutdownBanner } from "./ShutdownBanner";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/neda/i18n";
import type { LangCode } from "@/lib/neda/countries";

type Tab = "messages" | "groups" | "radar";

export function NedaApp() {
  const { identity, hydrated, clearIdentity } = useIdentity();
  const [tab, setTab] = useState<Tab>("messages");
  const [titleTaps, setTitleTaps] = useState(0);
  const [panicMessage, setPanicMessage] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [pendingPeer, setPendingPeer] = useState<{ peerId: string; peerCode: string } | null>(null);

  // Reset taps after a window.
  useEffect(() => {
    if (titleTaps === 0) return;
    const id = window.setTimeout(() => setTitleTaps(0), 1500);
    return () => window.clearTimeout(id);
  }, [titleTaps]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground uppercase">
        booting...
      </div>
    );
  }

  if (!identity) {
    return <Onboarding onDone={() => undefined} />;
  }

  const lang: LangCode = identity.language as LangCode;

  async function handleTitleTap() {
    const next = titleTaps + 1;
    setTitleTaps(next);
    if (next >= 3 && identity) {
      // PANIC.
      setPanicMessage(t(lang, "panic_done"));
      try {
        await supabase.from("users").delete().eq("id", identity.id);
      } catch (e) {
        console.error("panic delete failed", e);
      }
      clearIdentity();
      window.setTimeout(() => setPanicMessage(null), 1500);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={handleTitleTap}
          className={`text-lg tracking-[0.3em] font-bold ${
            titleTaps > 0 ? "text-destructive" : "text-foreground"
          }`}
          aria-label="NEDA"
        >
          N E D A
        </button>
        <div className="flex items-center gap-3 text-[10px] tracking-wider text-muted-foreground">
          <button
            type="button"
            onClick={() => setShowQR(true)}
            aria-label="Verify via QR"
            className="w-7 h-7 flex items-center justify-center border border-signal/40 text-signal hover:bg-signal/10 transition-colors"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="3" height="3" />
              <rect x="18" y="14" width="3" height="3" />
              <rect x="14" y="18" width="3" height="3" />
              <rect x="18" y="18" width="3" height="3" />
            </svg>
          </button>
          <span>
            {identity.user_code}
            {identity.display_name && (
              <span className="ms-2 text-foreground/60">· {identity.display_name}</span>
            )}
          </span>
        </div>
      </header>

      {titleTaps > 0 && titleTaps < 3 && (
        <div className="bg-destructive/10 border-b border-destructive px-4 py-1 text-[11px] text-destructive uppercase">
          {t(lang, "panic_armed")} ({titleTaps}/3)
        </div>
      )}
      {panicMessage && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 text-xs uppercase">
          {panicMessage}
        </div>
      )}

      <ShutdownBanner country={identity.country} />

      {/* Tabs */}
      <nav className="grid grid-cols-3 border-b border-border">
        {(
          [
            { id: "messages", label: t(lang, "tab_messages") },
            { id: "groups", label: t(lang, "tab_groups") },
            { id: "radar", label: t(lang, "tab_radar") },
          ] as Array<{ id: Tab; label: string }>
        ).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setTab(c.id)}
            className={`px-3 py-2 text-[11px] uppercase tracking-wider border-e border-border last:border-e-0 ${
              tab === c.id
                ? "bg-secondary text-signal border-b-2 border-b-signal -mb-px"
                : "text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>

      {/* Body */}
      <main className="flex-1 flex flex-col min-h-0">
        {tab === "messages" && (
          <MessagesTab
            initialPeer={pendingPeer}
            onPeerConsumed={() => setPendingPeer(null)}
          />
        )}
        {tab === "groups" && <GroupsTab />}
        {tab === "radar" && <RadarTab />}
      </main>

      {showQR && (
        <QRVerify
          myCode={identity.user_code}
          myId={identity.id}
          onClose={() => setShowQR(false)}
          onPeerVerified={(peer) => {
            setPendingPeer(peer);
            setTab("messages");
            setShowQR(false);
          }}
        />
      )}
    </div>
  );
}
