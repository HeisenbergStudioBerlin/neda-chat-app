import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TranslateInput = z.object({
  text: z.string().min(1).max(200),
  fromLang: z.string().min(2).max(8),
  toLangs: z.array(z.string().min(2).max(8)).min(1).max(8),
});

const LANG_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  zh: "Chinese (Simplified)",
  fa: "Persian (Farsi)",
  ar: "Arabic",
};

/**
 * Translates a short message from one language into multiple target languages
 * using the Lovable AI Gateway (google/gemini-2.5-flash). Returns a map of
 * { langCode: translatedText }. The source language is included unchanged.
 */
export const translateMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data }) => {
    const { text, fromLang, toLangs } = data;

    // Always include source language untranslated.
    const result: Record<string, string> = { [fromLang]: text };

    // Filter targets: skip source and unknown codes.
    const targets = toLangs.filter((l) => l !== fromLang && LANG_NAMES[l]);
    if (targets.length === 0) {
      return { translations: result, error: null as string | null };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      // No key — return original for every target.
      for (const l of targets) result[l] = text;
      return { translations: result, error: "LOVABLE_API_KEY missing" };
    }

    const fromName = LANG_NAMES[fromLang] ?? fromLang;
    const targetList = targets.map((l) => `${l}=${LANG_NAMES[l]}`).join(", ");

    const systemPrompt =
      "You are a precise translator. Translate the user's short message from " +
      `${fromName} into the requested target languages. Preserve meaning and tone. ` +
      "Do NOT add commentary. Return STRICT JSON of the form " +
      `{"translations":{"<code>":"<text>",...}} where keys are exactly the requested ` +
      `language codes and values are the translated strings only.`;

    const userPrompt =
      `Source language: ${fromName} (${fromLang})\n` +
      `Target languages: ${targetList}\n` +
      `Message: "${text}"`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("translate failed", res.status, body);
        for (const l of targets) result[l] = text;
        return {
          translations: result,
          error: `gateway ${res.status}`,
        };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      let parsed: { translations?: Record<string, string> } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        // ignore
      }
      const t = parsed.translations ?? {};
      for (const l of targets) {
        result[l] = typeof t[l] === "string" && t[l].length > 0 ? t[l] : text;
      }
      return { translations: result, error: null };
    } catch (err) {
      console.error("translate error", err);
      for (const l of targets) result[l] = text;
      return {
        translations: result,
        error: err instanceof Error ? err.message : "unknown",
      };
    }
  });
