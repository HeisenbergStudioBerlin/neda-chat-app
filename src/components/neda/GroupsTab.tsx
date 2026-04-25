import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { ChatView } from "./ChatView";
import { t } from "@/lib/neda/i18n";
import type { LangCode } from "@/lib/neda/countries";

interface Group {
  id: string;
  name: string;
  country: string | null;
  is_custom: boolean;
  member_count: number;
  joined: boolean;
}

export function GroupsTab() {
  const { identity } = useIdentity();
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const lang: LangCode = (identity?.language ?? "en") as LangCode;

  async function load() {
    if (!identity) return;
    const { data: gs } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!gs) return;

    const ids = gs.map((g) => g.id);
    const { data: members } = await supabase
      .from("group_members")
      .select("group_id, user_id")
      .in("group_id", ids);

    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const m of members ?? []) {
      counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
      if (m.user_id === identity.id) mine.add(m.group_id);
    }

    setGroups(
      gs.map((g) => ({
        id: g.id,
        name: g.name,
        country: g.country,
        is_custom: g.is_custom,
        member_count: counts.get(g.id) ?? 0,
        joined: mine.has(g.id),
      })),
    );
  }

  useEffect(() => {
    if (!identity || active) return;
    load();
  }, [identity, active]);

  async function toggleJoin(g: Group) {
    if (!identity || busy) return;
    setBusy(true);
    try {
      if (g.joined) {
        await supabase
          .from("group_members")
          .delete()
          .eq("group_id", g.id)
          .eq("user_id", identity.id);
      } else {
        await supabase
          .from("group_members")
          .insert({ group_id: g.id, user_id: identity.id });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!identity || !newName.trim() || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("groups")
        .insert({
          name: newName.trim().slice(0, 40),
          country: identity.country,
          is_custom: true,
        })
        .select()
        .single();
      if (error || !data) return;
      await supabase
        .from("group_members")
        .insert({ group_id: data.id, user_id: identity.id });
      setNewName("");
      setShowCreate(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <ChatView
        groupId={active.id}
        groupName={active.name}
        onBack={() => setActive(null)}
      />
    );
  }

  const joined = groups.filter((g) => g.joined);
  const open = groups.filter((g) => !g.joined);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="px-4 py-12 text-center text-xs text-muted-foreground uppercase">
            {t(lang, "empty_groups")}
          </div>
        )}

        {joined.length > 0 && (
          <Section label={t(lang, "my_groups")}>
            {joined.map((g) => (
              <GroupRow
                key={g.id}
                g={g}
                onOpen={() => setActive({ id: g.id, name: g.name })}
                onToggle={() => toggleJoin(g)}
                lang={lang}
                busy={busy}
              />
            ))}
          </Section>
        )}

        {open.length > 0 && (
          <Section label={t(lang, "open_groups")}>
            {open.map((g) => (
              <GroupRow
                key={g.id}
                g={g}
                onOpen={() => setActive({ id: g.id, name: g.name })}
                onToggle={() => toggleJoin(g)}
                lang={lang}
                busy={busy}
              />
            ))}
          </Section>
        )}
      </div>

      {showCreate ? (
        <div className="border-t border-border p-3 flex flex-col gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 40))}
            placeholder={t(lang, "group_name")}
            className="bg-transparent border border-border px-3 py-2 outline-none focus:border-signal"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
              }}
              className="px-3 py-2 border border-border text-xs uppercase"
            >
              {t(lang, "cancel")}
            </button>
            <button
              type="button"
              onClick={createGroup}
              disabled={busy || !newName.trim()}
              className="px-3 py-2 border border-signal text-signal text-xs uppercase disabled:opacity-30"
            >
              {busy ? "..." : t(lang, "create")}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-full px-3 py-2 border border-signal text-signal text-xs uppercase"
          >
            + {t(lang, "group_create")}
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
        {label}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </div>
  );
}

function GroupRow({
  g,
  onOpen,
  onToggle,
  lang,
  busy,
}: {
  g: Group;
  onOpen: () => void;
  onToggle: () => void;
  lang: LangCode;
  busy: boolean;
}) {
  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <button type="button" onClick={onOpen} className="flex-1 text-start min-w-0">
        <div className="text-sm text-signal truncate">
          # {g.name}
          {g.country && (
            <span className="ms-2 text-[10px] text-muted-foreground">[{g.country}]</span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {g.member_count} {t(lang, "members")}
        </div>
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`px-2 py-1 text-[10px] uppercase border disabled:opacity-30 ${
          g.joined
            ? "border-border text-muted-foreground"
            : "border-signal text-signal"
        }`}
      >
        {g.joined ? t(lang, "leave") : t(lang, "join")}
      </button>
    </li>
  );
}
