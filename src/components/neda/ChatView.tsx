import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { translateMessage } from "@/lib/neda/translate.functions";
import { notifyIncoming } from "@/lib/neda/notify";
import { isRTL, type LangCode } from "@/lib/neda/countries";
import { t } from "@/lib/neda/i18n";
import { simulatedHopCount } from "@/lib/mesh/protocol";

export interface ChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  group_id: string | null;
  content: string;
  original_language: string;
  translated_content: Record<string, string>;
  created_at: string;
}

interface Props {
  /** Other user id for 1-to-1 chats. */
  peerId?: string;
  peerCode?: string;
  /** Group id for group chats. */
  groupId?: string;
  groupName?: string;
  onBack: () => void;
}

const MAX_LEN = 100;

export function ChatView({ peerId, peerCode, groupId, groupName, onBack }: Props) {
  const { identity } = useIdentity();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());
  const [senderCodes, setSenderCodes] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const lang: LangCode = (identity?.language ?? "en") as LangCode;
  const rtl = isRTL(lang);

  // Initial load.
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);
      if (groupId) {
        q = q.eq("group_id", groupId);
      } else if (peerId) {
        q = q.or(
          `and(sender_id.eq.${identity.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${identity.id})`,
        );
      }
      const { data } = await q;
      if (!cancelled && data) {
        setMessages(
          data.map((m) => ({
            ...m,
            translated_content: (m.translated_content ?? {}) as Record<string, string>,
          })) as ChatMessage[],
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, peerId, groupId]);

  // Realtime subscription.
  useEffect(() => {
    if (!identity) return;
    const channelName = groupId
      ? `chat:group:${groupId}`
      : `chat:dm:${[identity.id, peerId].sort().join(":")}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: groupId ? `group_id=eq.${groupId}` : undefined,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          // For DMs filter client-side (RLS allows reads, but we want this thread only).
          if (!groupId) {
            const a = identity.id;
            const b = peerId;
            const ok =
              (m.sender_id === a && m.recipient_id === b) ||
              (m.sender_id === b && m.recipient_id === a);
            if (!ok) return;
          }
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [
              ...prev,
              {
                ...m,
                translated_content: (m.translated_content ?? {}) as Record<string, string>,
              },
            ];
          });
          if (m.sender_id !== identity.id) {
            setPulseIds((s) => new Set(s).add(m.id));
            notifyIncoming();
            window.setTimeout(() => {
              setPulseIds((s) => {
                const n = new Set(s);
                n.delete(m.id);
                return n;
              });
            }, 5000);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [identity, peerId, groupId]);

  // Auto-scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!identity || !draft.trim() || sending) return;
    const content = draft.trim().slice(0, MAX_LEN);
    setSending(true);
    try {
      // Translate to a small set of common languages so any recipient sees it in theirs.
      const targets: LangCode[] = ["en", "de", "fr", "zh", "fa", "ar"];
      let translated: Record<string, string> = { [identity.language]: content };
      try {
        const r = await translateMessage({
          data: { text: content, fromLang: identity.language, toLangs: targets },
        });
        translated = r.translations;
      } catch (e) {
        console.warn("translation failed, sending original", e);
      }

      const { error } = await supabase.from("messages").insert({
        sender_id: identity.id,
        recipient_id: peerId ?? null,
        group_id: groupId ?? null,
        content,
        original_language: identity.language,
        translated_content: translated,
      });
      if (error) throw error;
      setDraft("");
    } catch (e) {
      console.error("send failed", e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="border-b border-border px-3 py-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs uppercase border border-border px-2 py-1"
        >
          ← {t(lang, "back")}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm uppercase truncate text-signal">
            {groupName ? `# ${groupName}` : peerCode}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {groupId ? "GROUP" : "DIRECT"} · CH 100
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" dir={rtl ? "rtl" : "ltr"}>
        {messages.length === 0 && (
          <div className="text-center text-[11px] text-muted-foreground py-8 uppercase">— no transmissions —</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === identity?.id;
          const txt =
            m.translated_content?.[lang] ?? m.translated_content?.[m.original_language] ?? m.content;
          const showOriginal = !mine && m.original_language !== lang;
          const pulsing = pulseIds.has(m.id);
          return (
            <div
              key={m.id}
              className={`px-3 py-2 border text-sm leading-snug ${
                mine ? "border-border" : "border-signal/40"
              } ${pulsing ? "neda-pulse" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {!mine && pulsing && (
                  <span className="inline-block w-2 h-2 bg-signal neda-blink" />
                )}
                <span className="text-[10px] uppercase text-muted-foreground">
                  {mine ? "YOU" : "PEER"} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words">{txt}</div>
              {showOriginal && (
                <div className="text-[10px] text-muted-foreground mt-1 opacity-70">
                  [{m.original_language}] {m.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-3 py-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={MAX_LEN}
          placeholder={t(lang, "type_message")}
          className="flex-1 bg-transparent border border-border px-3 py-2 outline-none focus:border-signal"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-end">
          {draft.length}/{MAX_LEN}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
          className="px-3 py-2 border border-signal text-signal text-xs uppercase disabled:opacity-30"
        >
          {sending ? "..." : t(lang, "send")}
        </button>
      </div>
    </div>
  );
}
