// Phase 1 placeholder for Groups + Radar tabs. Will be filled in Phase 2.
import { t } from "@/lib/neda/i18n";
import type { LangCode } from "@/lib/neda/countries";

export function PlaceholderTab({ lang, label }: { lang: LangCode; label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className="text-xs mt-2 text-muted-foreground">
          {t(lang, "back")} — phase 2
        </div>
      </div>
    </div>
  );
}
