import type { TranslationRegion } from "@/types/translation";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-3.5-flash",
  "google/gemini-2.0-flash-exp:free",
];

interface TranslateOptions {
  imageBase64: string;
  mimeType: string;
  targetLang: string;
  model?: string;
}

function buildModelCandidates(preferred?: string): string[] {
  const envModel = process.env.OPENROUTER_MODEL?.trim();
  const primary = preferred ?? envModel ?? DEFAULT_MODEL;
  return [...new Set([primary, ...FALLBACK_MODELS])];
}

async function callOpenRouter(
  model: string,
  dataUrl: string,
  targetLang: string,
  apiKey: string
): Promise<{ regions: TranslationRegion[]; model: string }> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Comic Book Reader",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this comic/manga page. Detect all speech bubbles and text regions.
For each text region return bounding box as percentages of image dimensions [x, y, width, height] where x,y is top-left.
Translate all dialogue and narration to ${targetLang}. Keep sound effects (SFX) in original unless they have clear meaning.
Return ONLY valid JSON in this format:
{"regions":[{"bbox":[x,y,w,h],"original":"...","translated":"...","confidence":0.95}]}
If no text found return {"regions":[]}.`,
            },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error (${model}): ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '{"regions":[]}';

  let parsed: { regions: TranslationRegion[] };
  try {
    parsed = JSON.parse(content) as { regions: TranslationRegion[] };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    parsed = match
      ? (JSON.parse(match[0]) as { regions: TranslationRegion[] })
      : { regions: [] };
  }

  return { regions: parsed.regions ?? [], model };
}

export async function translateComicPage(
  options: TranslateOptions
): Promise<{ regions: TranslationRegion[]; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const dataUrl = `data:${options.mimeType};base64,${options.imageBase64}`;
  const candidates = buildModelCandidates(options.model);
  let lastError: Error | null = null;

  for (const model of candidates) {
    try {
      return await callOpenRouter(model, dataUrl, options.targetLang, apiKey);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        lastError.message.includes("404") ||
        lastError.message.includes("No endpoints found") ||
        lastError.message.includes("503");
      if (!retryable) throw lastError;
      console.warn(`OpenRouter model ${model} unavailable, trying fallback...`);
    }
  }

  throw lastError ?? new Error("OpenRouter translation failed");
}
