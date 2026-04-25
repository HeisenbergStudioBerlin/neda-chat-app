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

// Short, friendly first-name pool (mix of Persian, Arabic, international).
export const NAME_POOL: readonly string[] = [
  "sam", "nima", "dara", "kian", "sara", "mina", "zara", "reza", "amir", "tara",
  "lina", "noah", "aria", "yara", "sami", "leya", "rumi", "azad", "noor", "layla",
  "cyrus", "omid", "navid", "parsa", "rana", "soha", "ziba", "ramin", "shiva", "neda",
  "luca", "milo", "enzo", "ava", "ela", "ines", "kai", "iva", "anya", "elia",
  "maya", "ilya", "rami", "sana", "yusra", "hadi", "jana", "leon", "nora", "zaid",
];

export function pickName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

/** Generates a code like "@sam4805". Uniqueness must be enforced by the caller. */
export function generateUserCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `@${pickName()}${n}`;
}

/** Regex for the new code format. */
export const USER_CODE_REGEX = /^@[a-z]{3,5}\d{4}$/;

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
