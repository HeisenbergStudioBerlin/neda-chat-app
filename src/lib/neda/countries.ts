// Country -> primary language mapping for NEDA.
// Supported UI languages: en, de, fr, zh, fa (RTL), ar (RTL).
export type LangCode = "en" | "de" | "fr" | "zh" | "fa" | "ar";

export interface Country {
  name: string;
  language: LangCode;
}

export const COUNTRIES: Country[] = [
  { name: "Afghanistan", language: "fa" },
  { name: "Algeria", language: "ar" },
  { name: "Argentina", language: "en" },
  { name: "Australia", language: "en" },
  { name: "Austria", language: "de" },
  { name: "Bahrain", language: "ar" },
  { name: "Belarus", language: "en" },
  { name: "Belgium", language: "fr" },
  { name: "Brazil", language: "en" },
  { name: "Canada", language: "en" },
  { name: "China", language: "zh" },
  { name: "Egypt", language: "ar" },
  { name: "France", language: "fr" },
  { name: "Germany", language: "de" },
  { name: "Hong Kong", language: "zh" },
  { name: "India", language: "en" },
  { name: "Iran", language: "fa" },
  { name: "Iraq", language: "ar" },
  { name: "Israel", language: "en" },
  { name: "Italy", language: "en" },
  { name: "Japan", language: "en" },
  { name: "Jordan", language: "ar" },
  { name: "Kuwait", language: "ar" },
  { name: "Lebanon", language: "ar" },
  { name: "Libya", language: "ar" },
  { name: "Luxembourg", language: "fr" },
  { name: "Mexico", language: "en" },
  { name: "Morocco", language: "ar" },
  { name: "Myanmar", language: "en" },
  { name: "Netherlands", language: "en" },
  { name: "Oman", language: "ar" },
  { name: "Pakistan", language: "en" },
  { name: "Palestine", language: "ar" },
  { name: "Poland", language: "en" },
  { name: "Qatar", language: "ar" },
  { name: "Russia", language: "en" },
  { name: "Saudi Arabia", language: "ar" },
  { name: "Spain", language: "en" },
  { name: "Sudan", language: "ar" },
  { name: "Switzerland", language: "de" },
  { name: "Syria", language: "ar" },
  { name: "Taiwan", language: "zh" },
  { name: "Tajikistan", language: "fa" },
  { name: "Tunisia", language: "ar" },
  { name: "Turkey", language: "en" },
  { name: "Ukraine", language: "en" },
  { name: "United Arab Emirates", language: "ar" },
  { name: "United Kingdom", language: "en" },
  { name: "United States", language: "en" },
  { name: "Venezuela", language: "en" },
  { name: "Vietnam", language: "en" },
  { name: "Yemen", language: "ar" },
];

export const RTL_LANGS: LangCode[] = ["fa", "ar"];

export function isRTL(lang: LangCode): boolean {
  return RTL_LANGS.includes(lang);
}

export function findCountry(name: string): Country | undefined {
  const n = name.trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === n);
}

export function searchCountries(query: string, limit = 8): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, limit);
}
