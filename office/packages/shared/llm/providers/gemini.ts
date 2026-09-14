import { RateLimitedError, type ProviderCall } from "../types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini via plain REST. No SDK on purpose: the Convex runtime is not Node, and
 * a fetch call has no install footprint, no version drift, and no surprises.
 */
export const callGemini: ProviderCall = async ({
  system,
  user,
  model,
  json,
  temperature,
  maxOutputTokens,
  apiKey,
  signal,
}) => {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
      // Free tier defaults block a fair amount. Outreach copy discussing a
      // "broken" site should not trip a safety filter, so these are loosened to
      // the highest threshold Google allows — not disabled, which is not offered.
      safetySettings: [
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })),
    }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new RateLimitedError("gemini", Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    // MAX_TOKENS with no text means the model spent its whole budget on
    // reasoning and produced nothing usable. Worth naming, because the fix is
    // a bigger maxOutputTokens, not a retry.
    throw new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason ?? "unknown"})`);
  }

  const u = data.usageMetadata ?? {};
  return {
    text,
    promptTokens: u.promptTokenCount ?? 0,
    completionTokens: u.candidatesTokenCount ?? 0,
    totalTokens: u.totalTokenCount ?? 0,
  };
};
