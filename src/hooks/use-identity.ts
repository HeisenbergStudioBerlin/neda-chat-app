import { useCallback, useEffect, useState } from "react";
import { loadIdentity, saveIdentity, clearIdentity, type NedaIdentity } from "@/lib/neda/identity";
import { isRTL } from "@/lib/neda/countries";

let listeners: Array<(id: NedaIdentity | null) => void> = [];
let cached: NedaIdentity | null | undefined = undefined;

function emit(id: NedaIdentity | null) {
  cached = id;
  for (const l of listeners) l(id);
}

export function useIdentity() {
  const [identity, setIdentity] = useState<NedaIdentity | null>(() => {
    if (cached !== undefined) return cached;
    return null;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = loadIdentity();
    cached = initial;
    setIdentity(initial);
    setHydrated(true);
    const handler = (id: NedaIdentity | null) => setIdentity(id);
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((l) => l !== handler);
    };
  }, []);

  // Apply RTL/lang to <html>.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    if (identity) {
      html.lang = identity.language;
      html.dir = isRTL(identity.language) ? "rtl" : "ltr";
    } else {
      html.lang = "en";
      html.dir = "ltr";
    }
  }, [identity]);

  const set = useCallback((id: NedaIdentity) => {
    saveIdentity(id);
    emit(id);
  }, []);

  const clear = useCallback(() => {
    clearIdentity();
    emit(null);
  }, []);

  return { identity, hydrated, setIdentity: set, clearIdentity: clear };
}
