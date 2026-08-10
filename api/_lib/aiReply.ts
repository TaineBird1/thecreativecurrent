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

export type AiReplyParams = {
  businessName: string;
  originalSubject: string;
  originalBody: string;
  replyBody: string;
};

// Drafts a suggested response to a prospect's reply -- never sent
// automatically (see api/prospects-send-reply.ts, which is the explicit
// human-approval step every other send in this system already requires).
// Grounded in the exact outreach email that was sent and the exact reply
// text received, so it answers what was actually asked rather than
// generically re-pitching. Returns null on any failure so a reply always
// still gets flagged (status='replied') even without a suggestion attached
// -- the admin can write one from scratch in that case.
export async function generateSuggestedReply(params: AiReplyParams): Promise<string | null> {
  try {
    const anthropic = getAnthropic();

    const context = [
      `Business: ${params.businessName}`,
      `--- The outreach email that was sent ---`,
      `Subject: ${params.originalSubject}`,
      params.originalBody,
      `--- Their reply ---`,
      params.replyBody,
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 500,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { reply: { type: "string" } },
            required: ["reply"],
            additionalProperties: false,
          },
        },
      },
      system:
        "You are drafting a reply on behalf of The Creative Current, a Durban-based web design and " +
        "management agency, to a prospect who replied to a cold outreach email. Read their reply carefully " +
        "and respond to what they actually said -- answer questions, address objections, or move toward a " +
        "call, whichever fits. If they said no or asked not to be contacted again, write a short, gracious " +
        "reply that respects that and does not push. Keep it short (2-5 sentences), direct, no hype, no " +
        "exclamation marks. Do not repeat the original pitch verbatim. Include a brief sign-off (\"Best, The " +
        "Creative Current\" is fine) but do not invent contact details. Return only the reply body.",
      messages: [{ role: "user", content: context }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(textBlock.text) as { reply?: string };
    return parsed.reply?.trim() || null;
  } catch (e) {
    console.error("generateSuggestedReply failed:", e);
    return null;
  }
}
