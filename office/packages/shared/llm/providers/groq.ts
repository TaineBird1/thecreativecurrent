import { RateLimitedError, type ProviderCall } from "../types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Groq, OpenAI-compatible. The fallback when Gemini is rate limited or down. */
export const callGroq: ProviderCall = async ({
  system,
  user,
  model,
  json,
  temperature,
  maxOutputTokens,
  apiKey,
  signal,
}) => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: maxOutputTokens,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new RateLimitedError("groq", Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Groq returned an empty completion.");

  const u = data.usage ?? {};
  return {
    text,
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
};
