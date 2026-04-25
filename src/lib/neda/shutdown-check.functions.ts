import { createServerFn } from "@tanstack/react-start";

export interface ShutdownStatus {
  active: boolean;
  headline: string;
  source: string;
  lastChecked: string;
}

interface TavilyResult {
  title?: string;
  content?: string;
  url?: string;
}

interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

// Two distinct keyword "groups" must match in the same result for it to count as
// an active shutdown. This avoids false positives from generic news mentions.
const KEYWORD_GROUPS: string[][] = [
  ["shutdown", "shut down", "blackout", "outage", "cut off", "kill switch"],
  ["block", "blocked", "censor", "throttl", "disrupt", "restrict"],
  ["government", "regime", "authorities", "ministry", "state-ordered", "nationwide"],
  ["internet", "mobile data", "broadband", "telecom", "isp", "network"],
];

// Untrusted / social sources — exclude these as primary evidence.
const BLOCKED_DOMAINS = [
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "reddit.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "t.me",
];

// Countries we consider safe for the demo — never trigger a shutdown banner.
const SAFE_COUNTRIES = new Set(
  [
    "germany",
    "deutschland",
    "united states",
    "usa",
    "united kingdom",
    "uk",
    "france",
    "spain",
    "italy",
    "netherlands",
    "switzerland",
    "austria",
    "sweden",
    "norway",
    "denmark",
    "finland",
    "ireland",
    "portugal",
    "belgium",
    "canada",
    "australia",
    "new zealand",
    "japan",
    "south korea",
  ].map((c) => c.toLowerCase()),
);

function isBlockedSource(url?: string): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return BLOCKED_DOMAINS.some((d) => u.includes(d));
}

/** Count how many distinct keyword GROUPS appear in the text. */
function shutdownScore(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const group of KEYWORD_GROUPS) {
    if (group.some((kw) => t.includes(kw))) score += 1;
  }
  return score;
}

export const checkShutdown = createServerFn({ method: "POST" })
  .inputValidator((input: { country: string }) => {
    const country = String(input?.country ?? "").trim().slice(0, 80);
    if (!country) throw new Error("country is required");
    return { country };
  })
  .handler(async ({ data }): Promise<ShutdownStatus> => {
    const apiKey = process.env.TAVILY_API_KEY;
    const lastChecked = new Date().toISOString();

    if (!apiKey) {
      return {
        active: false,
        headline: "shutdown check unavailable",
        source: "",
        lastChecked,
      };
    }

    const year = new Date().getUTCFullYear();
    const query = `internet shutdown ${data.country} ${year}`;

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          api_key: apiKey,
          max_results: 3,
          include_answer: true,
          search_depth: "basic",
        }),
      });

      if (!res.ok) {
        console.error("tavily error", res.status, await res.text());
        return {
          active: false,
          headline: `check failed (${res.status})`,
          source: "",
          lastChecked,
        };
      }

      const json = (await res.json()) as TavilyResponse;
      const results = json.results ?? [];

      const hit = results.find((r) =>
        looksLikeShutdown(`${r.title ?? ""} ${r.content ?? ""}`),
      );

      if (hit) {
        const headline = (hit.title ?? json.answer ?? "Internet shutdown reported")
          .slice(0, 180);
        return {
          active: true,
          headline,
          source: hit.url ?? "",
          lastChecked,
        };
      }

      return {
        active: false,
        headline: json.answer?.slice(0, 180) ?? "no shutdown reported",
        source: results[0]?.url ?? "",
        lastChecked,
      };
    } catch (err) {
      console.error("tavily fetch failed", err);
      return {
        active: false,
        headline: "check failed",
        source: "",
        lastChecked,
      };
    }
  });
