import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { COUNTRIES, searchCountries, type LangCode, type Country } from "@/lib/neda/countries";
import { generateUserCode, type NedaIdentity } from "@/lib/neda/identity";
import { t } from "@/lib/neda/i18n";

interface Props {
  onDone: () => void;
}

export function Onboarding({ onDone }: Props) {
  const { setIdentity } = useIdentity();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [country, setCountry] = useState<Country | null>(null);
  const [query, setQuery] = useState("");
  const [bluetooth, setBluetooth] = useState(false);
  const [gpsGranted, setGpsGranted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [userCode] = useState<string>(() => generateUserCode());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lang: LangCode = country?.language ?? "en";
  const suggestions = useMemo(() => searchCountries(query, 6), [query]);

  async function requestGPS() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsGranted(false);
      return;
    }
    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      setGpsGranted(true);
    } catch {
      setGpsGranted(false);
    }
  }

  async function finish() {
    if (!country) return;
    setSubmitting(true);
    setError(null);
    try {
      const name = displayName.trim().slice(0, 20) || null;

      // Try a few times in case of collision (very unlikely with ~50 names × 9000 numbers).
      let attempt = 0;
      let inserted: { id: string; user_code: string; display_name: string | null; country: string; language: string; bluetooth_enabled: boolean } | null = null;
      let lastErr: string | null = null;
      while (attempt < 5 && !inserted) {
        const code = attempt === 0 ? userCode : generateUserCode();
        const { data, error: dbErr } = await supabase
          .from("users")
          .insert({
            user_code: code,
            display_name: name,
            country: country.name,
            language: country.language,
            bluetooth_enabled: bluetooth,
          })
          .select("id, user_code, display_name, country, language, bluetooth_enabled")
          .single();
        if (data) {
          inserted = data;
          break;
        }
        lastErr = dbErr?.message ?? "insert failed";
        // 23505 = unique_violation -> retry with new random code.
        if (!dbErr || (dbErr as { code?: string }).code !== "23505") break;
        attempt++;
      }
      if (!inserted) throw new Error(lastErr ?? "insert failed");

      const ident: NedaIdentity = {
        id: inserted.id,
        user_code: inserted.user_code,
        display_name: inserted.display_name,
        country: inserted.country,
        language: inserted.language as LangCode,
        bluetooth_enabled: inserted.bluetooth_enabled,
      };
      setIdentity(ident);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="text-lg tracking-[0.3em] font-bold">N E D A</div>
        <div className="text-[10px] text-muted-foreground">STEP {step}/3</div>
      </header>

      {/* Tagline */}
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[11px] leading-relaxed text-muted-foreground italic">
          "{t(lang, "app_tagline")}"
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">{t(lang, "app_tagline_attr")}</div>
      </div>

      {/* Body */}
      <main className="flex-1 px-4 py-6 flex flex-col gap-6">
        {step === 1 && (
          <section className="flex flex-col gap-4">
            <h1 className="text-xl uppercase">{t(lang, "step1_title")}</h1>
            <p className="text-xs text-muted-foreground">{t(lang, "step1_hint")}</p>
            <label className="flex flex-col gap-2 mt-2">
              <span className="text-[11px] uppercase text-muted-foreground">
                {t(lang, "step1_search")}
              </span>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCountry(null);
                }}
                placeholder="..."
                className="bg-transparent border border-border px-3 py-2 outline-none focus:border-signal text-foreground placeholder:text-muted-foreground"
              />
            </label>
            <ul className="border border-border divide-y divide-border max-h-72 overflow-auto">
              {suggestions.length === 0 && query.length > 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">— no matches —</li>
              )}
              {(suggestions.length > 0 ? suggestions : COUNTRIES.slice(0, 6)).map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setCountry(c);
                      setQuery(c.name);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors ${
                      country?.name === c.name ? "bg-secondary text-signal" : ""
                    }`}
                  >
                    <span>{c.name}</span>
                    <span className="text-muted-foreground text-[10px] ms-2 uppercase">
                      [{c.language}]
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-6">
            <h1 className="text-xl uppercase">{t(lang, "step2_title")}</h1>
            <p className="text-xs text-muted-foreground">{t(lang, "step2_hint")}</p>

            <button
              type="button"
              onClick={() => setBluetooth((b) => !b)}
              className="flex items-center justify-between border border-border px-4 py-3"
            >
              <span className="text-sm uppercase">{t(lang, "step2_toggle")}</span>
              <span
                className={`px-2 py-1 text-[10px] border ${
                  bluetooth
                    ? "bg-signal text-background border-signal"
                    : "border-border text-muted-foreground"
                }`}
              >
                {bluetooth ? "ON" : "OFF"}
              </span>
            </button>

            <button
              type="button"
              onClick={requestGPS}
              className="flex items-center justify-between border border-border px-4 py-3"
            >
              <span className="text-start">
                <span className="block text-sm uppercase">{t(lang, "step2_gps")}</span>
                <span className="block text-[10px] text-muted-foreground mt-1">
                  {t(lang, "step2_gps_hint")}
                </span>
              </span>
              <span
                className={`px-2 py-1 text-[10px] border ${
                  gpsGranted
                    ? "bg-radar text-background border-radar"
                    : "border-border text-muted-foreground"
                }`}
              >
                {gpsGranted ? "OK" : "REQ"}
              </span>
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col gap-6">
            <h1 className="text-xl uppercase">{t(lang, "step3_title")}</h1>
            <p className="text-xs text-muted-foreground">{t(lang, "step3_hint")}</p>

            <div className="border border-signal px-4 py-6 text-center">
              <div className="text-[10px] uppercase text-muted-foreground tracking-widest">
                IDENTITY
              </div>
              <div className="text-3xl tracking-[0.2em] mt-2 text-signal">{userCode}</div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase text-muted-foreground">
                {t(lang, "step3_name_label")}
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                placeholder={t(lang, "step3_name_placeholder")}
                maxLength={20}
                className="bg-transparent border border-border px-3 py-2 outline-none focus:border-signal"
              />
              <span className="text-[10px] text-muted-foreground self-end">
                {displayName.length}/20
              </span>
            </label>

            {error && <div className="text-xs text-destructive border border-destructive px-3 py-2">{error}</div>}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
          disabled={step === 1}
          className="px-4 py-2 border border-border text-xs uppercase disabled:opacity-30"
        >
          {t(lang, "back")}
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3))}
            disabled={step === 1 && !country}
            className="px-6 py-2 border border-signal text-signal text-xs uppercase disabled:opacity-30"
          >
            {t(lang, "next")} →
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={submitting}
            className="px-6 py-2 border border-signal bg-signal text-background text-xs uppercase disabled:opacity-30"
          >
            {submitting ? "..." : t(lang, "finish")}
          </button>
        )}
      </footer>
    </div>
  );
}
