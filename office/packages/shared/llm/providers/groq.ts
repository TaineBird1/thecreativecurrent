import { RateLimitedError, type ProviderCall } from "../types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Groq, OpenAI-compatible. The fallback when Gemini is rate limited or down. */
export const callGroq: ProviderCall = async (args) => {
  try {
    return await send(args, args.json);
  } catch (err) {
    // Not every model on Groq accepts response_format. Losing the whole
    // provider over a formatting flag would be silly when parseJson already
    // copes with a fenced or chatty reply — so ask again without it.
    const message = err instanceof Error ? err.message : String(err);
    if (args.json && /response_format|json_object|json_validate/i.test(message)) {
      return await send(args, false);
    }
    throw err;
  }
};

/** `json` is passed separately so the retry can turn it off without lying about the request. */
async function send(
  args: Parameters<ProviderCall>[0],
  json: boolean,
): ReturnType<ProviderCall> {
  const { system, user, model, temperature, maxOutputTokens, apiKey, signal } = args;
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
        // Without response_format the model has to be told in words. Cheap
        // insurance: parseJson strips a fence either way.
        { role: "user", content: json ? user : `${user}\n\nReply with JSON only. No prose, no code fence.` },
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
}
