import type { LangCode } from "./countries";

const STORAGE_KEY = "neda.identity.v1";

export interface NedaIdentity {
  id: string;            // supabase users.id (uuid)
  user_code: string;     // e.g. NEDA-7291
  display_name: string | null;
  country: string;
  language: LangCode;
  bluetooth_enabled: boolean;
}

export function generateUserCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `NEDA-${n}`;
}

export function loadIdentity(): NedaIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NedaIdentity;
  } catch {
    return null;
  }
}

export function saveIdentity(id: NedaIdentity): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
}

export function clearIdentity(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
