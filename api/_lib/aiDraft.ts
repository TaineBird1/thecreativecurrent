import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getAnthropic() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type AiOpeningParams = {
  businessName: string;
  category: string | null;
  reason: "no_website" | "poor_website";
  emailDefect: string | null;
  address: string | null;
};

// Writes just the opening paragraph -- the fact-grounded hook that names the
// prospect's actual situation -- not the whole email. The pitch and
// signature stay as outreachTemplate.ts's fixed copy: reliable, on-brand,
// and immune to a bad generation inventing contact details or an offer we
// don't make. Grounded in the same facts the rule-based opener already had
// (websiteHealth.ts's emailDefect), so this is strictly a rewrite of the
// hook, not a new source of claims about the prospect.
//
// Returns null on any failure (missing key, rate limit, network, malformed
// response) so every caller falls back to buildOutreachDraft's rule-based
// opener -- an LLM outage must never be the reason a lead fails to draft.
export async function generateAiOpening(params: AiOpeningParams): Promise<string | null> {
  try {
    const anthropic = getAnthropic();

    const facts = [
      `Business name: ${params.businessName}`,
      params.category ? `Category: ${params.category}` : null,
      params.address ? `Location: ${params.address}` : null,
      params.reason === "poor_website"
        ? `They have a website. Here is the specific, verifiable problem with it: ${
            params.emailDefect ?? "it performs poorly overall (slow, dated, or not mobile-friendly)"
          }`
        : "They do not have a website at all.",
    ]
      .filter(Boolean)
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { opening: { type: "string" } },
            required: ["opening"],
            additionalProperties: false,
          },
        },
      },
      system:
        "You write the opening paragraph of a short, honest cold outreach email from The Creative Current, " +
        "a Durban-based web design and management agency, to a small South African business. Write 2-4 " +
        "sentences. Reference the business by name and lead with the specific fact you were given -- never " +
        "invent a detail that wasn't given to you. Tone: direct, respectful, no hype, no exclamation marks, " +
        "no 'I hope this finds you well'. Write like someone who actually looked at their business, not a " +
        "template. Do not include a greeting, a sign-off, a pitch for services, or a call to action -- those " +
        "are added separately. Return only the opening paragraph.",
      messages: [{ role: "user", content: facts }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(textBlock.text) as { opening?: string };
    return parsed.opening?.trim() || null;
  } catch (e) {
    console.error("generateAiOpening failed, falling back to template:", e);
    return null;
  }
}
