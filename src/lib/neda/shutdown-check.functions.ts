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

const SHUTDOWN_KEYWORDS = [
  "shutdown",
  "shut down",
  "blackout",
  "blocked",
  "block",
  "outage",
  "throttl", // throttle, throttling, throttled
  "censor",
  "disrupt",
  "cut off",
];

function looksLikeShutdown(text: string): boolean {
  const t = text.toLowerCase();
  return SHUTDOWN_KEYWORDS.some((kw) => t.includes(kw));
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
