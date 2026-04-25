import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { ChatView } from "./ChatView";
import { t } from "@/lib/neda/i18n";
import type { LangCode } from "@/lib/neda/countries";
import { USER_CODE_REGEX } from "@/lib/neda/identity";

interface Conversation {
  peerId: string;
  peerCode: string;
  peerName: string | null;
  lastContent: string;
  lastAt: string;
}

interface MessagesTabProps {
  initialPeer?: { peerId: string; peerCode: string } | null;
  onPeerConsumed?: () => void;
}

export function MessagesTab({ initialPeer, onPeerConsumed }: MessagesTabProps = {}) {
  const { identity } = useIdentity();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<{ peerId: string; peerCode: string } | null>(null);

  // Open a chat when a peer is pushed in from outside (e.g. QR verify).
  useEffect(() => {
    if (initialPeer) {
      setActive(initialPeer);
      onPeerConsumed?.();
    }
  }, [initialPeer, onPeerConsumed]);
  const [showNew, setShowNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const lang: LangCode = (identity?.language ?? "en") as LangCode;

  useEffect(() => {
    if (!identity || active) return;
    let cancelled = false;
    async function load() {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${identity!.id},recipient_id.eq.${identity!.id}`)
        .is("group_id", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!msgs || cancelled) return;

      const map = new Map<string, Conversation>();
      const peerIds = new Set<string>();
      for (const m of msgs) {
        const peerId = m.sender_id === identity!.id ? m.recipient_id! : m.sender_id;
        if (!peerId) continue;
        if (map.has(peerId)) continue;
        peerIds.add(peerId);
        map.set(peerId, {
          peerId,
          peerCode: "",
          peerName: null,
          lastContent: m.content,
          lastAt: m.created_at,
        });
      }

      if (peerIds.size > 0) {
        const { data: peers } = await supabase
          .from("users")
          .select("id, user_code, display_name")
          .in("id", Array.from(peerIds));
        for (const p of peers ?? []) {
          const c = map.get(p.id);
          if (c) {
            c.peerCode = p.user_code;
            c.peerName = p.display_name;
          }
        }
      }
      if (!cancelled) setConversations(Array.from(map.values()));
    }
    load();

    const channel = supabase
      .channel(`inbox:${identity.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as {
            sender_id: string;
            recipient_id: string | null;
            group_id: string | null;
            content: string;
            created_at: string;
          };
          if (m.group_id) return;
          if (m.sender_id !== identity.id && m.recipient_id !== identity.id) return;
          const peerId = m.sender_id === identity.id ? m.recipient_id : m.sender_id;
          if (!peerId) return;

          // Update existing conversation OR add a new one — never wipe the list.
          setConversations((prev) => {
            const existingIdx = prev.findIndex((c) => c.peerId === peerId);
            if (existingIdx >= 0) {
              const next = [...prev];
              next[existingIdx] = {
                ...next[existingIdx],
                lastContent: m.content,
                lastAt: m.created_at,
              };
              // Move to top.
              const [moved] = next.splice(existingIdx, 1);
              return [moved, ...next];
            }
            // New peer — add placeholder, fetch peer info async.
            const placeholder: Conversation = {
              peerId,
              peerCode: "…",
              peerName: null,
              lastContent: m.content,
              lastAt: m.created_at,
            };
            return [placeholder, ...prev];
          });

          // Fetch peer info if we don't know it yet.
          const { data: peer } = await supabase
            .from("users")
            .select("id, user_code, display_name")
            .eq("id", peerId)
            .maybeSingle();
          if (peer) {
            setConversations((prev) =>
              prev.map((c) =>
                c.peerId === peer.id
                  ? { ...c, peerCode: peer.user_code, peerName: peer.display_name }
                  : c,
              ),
            );
          }
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [identity, active]);

  async function startNew() {
    if (!identity) return;
    const code = newCode.trim().toLowerCase();
    if (!USER_CODE_REGEX.test(code)) {
      setNewError(t(lang, "invalid_user_id"));
      return;
    }
    if (code === identity.user_code) {
      setNewError(t(lang, "same_user_id"));
      return;
    }
    setCreating(true);
    setNewError(null);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, user_code")
        .eq("user_code", code)
        .maybeSingle();
      if (error || !data) {
        setNewError(t(lang, "user_not_found"));
        return;
      }
      setActive({ peerId: data.id, peerCode: data.user_code });
      setShowNew(false);
      setNewCode("");
    } finally {
      setCreating(false);
    }
  }

  if (active) {
    return (
      <ChatView
        peerId={active.peerId}
        peerCode={active.peerCode}
        onBack={() => setActive(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="px-4 py-12 text-center text-xs text-muted-foreground uppercase">
            {t(lang, "empty_messages")}
          </div>
        )}
        <ul className="divide-y divide-border">
          {conversations.map((c) => (
            <li key={c.peerId}>
              <button
                type="button"
                onClick={() => setActive({ peerId: c.peerId, peerCode: c.peerCode })}
                className="w-full text-start px-4 py-3 hover:bg-secondary transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-signal tracking-wider">{c.peerCode}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {c.peerName && (
                  <div className="text-[11px] text-muted-foreground">{c.peerName}</div>
                )}
                <div className="text-xs text-foreground/80 truncate mt-1">{c.lastContent}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {showNew ? (
        <div className="border-t border-border p-3 flex flex-col gap-2">
          <input
            autoFocus
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/\s/g, ""))}
            placeholder={t(lang, "enter_user_id")}
            className="bg-transparent border border-border px-3 py-2 outline-none focus:border-signal"
          />
          {newError && <div className="text-[11px] text-destructive">{newError}</div>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowNew(false);
                setNewError(null);
                setNewCode("");
              }}
              className="px-3 py-2 border border-border text-xs uppercase"
            >
              {t(lang, "cancel")}
            </button>
            <button
              type="button"
              onClick={startNew}
              disabled={creating}
              className="px-3 py-2 border border-signal text-signal text-xs uppercase disabled:opacity-30"
            >
              {creating ? "..." : t(lang, "start")}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="w-full px-3 py-2 border border-signal text-signal text-xs uppercase"
          >
            + {t(lang, "new_message")}
          </button>
        </div>
      )}
    </div>
  );
}
