"use node";
/**
 * Anele — Proposals / Quotes.
 *
 * Everything this bot produces goes to Approvals. Not because the money guard
 * happens to catch it — though it would — but because the code routes it there
 * unconditionally. There is no send path in this file. A proposal that could
 * escape by a guard being slightly wrong would be a design flaw; a proposal that
 * has nowhere to go but the Approvals inbox cannot escape at all.
 */
import { v } from "convex/values";
import { action } from "./../_generated/server";
import { authedAction } from "../lib/authed";
import { api, internal } from "./../_generated/api";
import { machineArgs } from "../lib/machine";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { assertNoForbiddenContent } from "../../packages/shared/guards/pii";

export const draft = authedAction({
  args: { callNotes: v.string(), leadId: v.optional(v.id("leads")) },
  handler: async (ctx, { callNotes, leadId }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "proposal", trigger: "manual", bubble: "Drafting a proposal" },
      async (handle) => {
        // Call notes can contain anything. If they contain banking details or a
        // signed document, they do not go to a free-tier model at all.
        assertNoForbiddenContent(callNotes);

        const settings = await ctx.runQuery(api.settings.get, machineArgs());
        const pricing = settings?.pricingYaml ?? "";

        const { text } = await think(ctx, {
          botKey: "proposal",
          purpose: "draft_proposal",
          runId: handle.runId,
          user: [
            "Taine's notes from the call:",
            callNotes,
            "",
            "The pricing rules you must work from — do not improvise a figure that is not derivable from these:",
            "```yaml",
            pricing,
            "```",
            "",
            "Draft the proposal. Return the proposal JSON from your instructions.",
          ].join("\n"),
          temperature: 0.4,
          maxOutputTokens: 2000,
        });

        const p = parseJson<{
          clientName?: string;
          scope?: string[];
          outOfScope?: string[];
          timelineWeeks?: string;
          whatWeNeedFromThem?: string[];
          buildPrice?: number | null;
          carePlanTier?: string;
          carePlanFee?: number | null;
          ratioReasoning?: string;
          openQuestions?: string[];
        }>(text);

        const clientName = p.clientName ?? "the client";
        const body = [
          `# Proposal — ${clientName}`,
          "",
          "## What we're building",
          ...(p.scope ?? []).map((s) => `- ${s}`),
          "",
          "## What's not included",
          ...(p.outOfScope ?? []).map((s) => `- ${s}`),
          "",
          `## Timeline`,
          `About ${p.timelineWeeks ?? "not stated"} weeks from when we have everything below. An estimate, not a guaranteed date.`,
          "",
          "## What we need from you",
          ...(p.whatWeNeedFromThem ?? []).map((s) => `- ${s}`),
          "",
          "## Fees",
          p.buildPrice ? `Build: R${p.buildPrice.toLocaleString("en-ZA")}` : "Build: **not enough in the notes to price this confidently**",
          p.carePlanFee
            ? `Care plan: ${p.carePlanTier} — R${p.carePlanFee.toLocaleString("en-ZA")} per month`
            : "Care plan: not assigned",
          "",
          p.ratioReasoning ? `*Tier reasoning: ${p.ratioReasoning}*` : "",
          "",
          ...(p.openQuestions?.length
            ? ["## Open questions", ...p.openQuestions.map((q) => `- ${q}`)]
            : []),
        ]
          .filter((l) => l !== undefined)
          .join("\n");

        // Unconditional. Not guard-dependent.
        const approvalId = await ctx.runMutation(internal.approvals.create, {
          kind: "proposal",
          botKey: "proposal",
          title: `Proposal — ${clientName}`,
          body,
          reason:
            "Every proposal goes to you before it goes anywhere else. Nothing here has been sent and nothing can be.",
          guard: "policy",
          matches: [
            p.buildPrice ? `R${p.buildPrice}` : "no build price",
            p.carePlanFee ? `R${p.carePlanFee}/month` : "no care plan fee",
          ],
          leadId,
        });

        await ctx.runMutation(internal.library.saveDraft, {
          botKey: "proposal",
          kind: "proposal",
          title: `Proposal — ${clientName}`,
          body,
          tags: ["proposal", p.carePlanTier ?? "untiered"],
          status: "needs_approval",
          approvalId,
        });

        return p.buildPrice
          ? `Proposal for ${clientName} drafted and waiting in Approvals.`
          : `Proposal for ${clientName} drafted, but the notes didn't support a price — see the open questions.`;
      },
    );
    return outcome.summary;
  },
});

/** Contract from templates/contract.md, populated from an approved proposal. */
export const contract = authedAction({
  args: { approvalId: v.id("approvals"), clientAddress: v.optional(v.string()) },
  handler: async (ctx, { approvalId, clientAddress }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "proposal", trigger: "manual", bubble: "Drafting a contract" },
      async () => {
        const approval = await ctx.runQuery(api.approvals.byId, { ...machineArgs(),  id: approvalId });
        if (!approval) return "That proposal is gone.";
        if (approval.status !== "approved") {
          return "That proposal hasn't been approved yet. A contract only follows an approved proposal.";
        }

        // Deliberately assembled in code from the approved text, not generated.
        // The contract is the one document where a model's paraphrase of a
        // clause would be a genuine liability.
        const source = approval.editedBody ?? approval.body;
        const clientName = approval.title.replace(/^Proposal — /, "");
        const body = [
          `# Website Design Agreement`,
          "",
          `**Between:** The Creative Current ("the Studio"), Durban, KwaZulu-Natal`,
          `**And:** ${clientName} ("the Client")${clientAddress ? `, ${clientAddress}` : ""}`,
          `**Date:** ${new Date().toISOString().slice(0, 10)}`,
          "",
          "---",
          "",
          "The terms below are taken from the proposal you approved, unchanged:",
          "",
          source,
          "",
          "---",
          "",
          "## What we do not promise",
          "",
          "The Studio does not guarantee any search engine ranking, position, volume of traffic, number of enquiries, or business outcome. We build the site properly and set it up to be found.",
          "",
          "## Governing law",
          "",
          "This agreement is governed by the laws of the Republic of South Africa.",
          "",
          "---",
          "",
          "**Signed for The Creative Current**",
          "",
          "Name: ______________________  Date: ____________",
          "",
          `**Signed for ${clientName}**`,
          "",
          "Name: ______________________  Date: ____________",
          "",
          "> Full clause set: templates/contract.md. Read it before you send this.",
        ].join("\n");

        const id = await ctx.runMutation(internal.approvals.create, {
          kind: "contract",
          botKey: "proposal",
          title: `Contract — ${clientName}`,
          body,
          reason: "A contract never leaves without you reading it first.",
          guard: "policy",
          matches: [],
          leadId: approval.leadId ?? undefined,
        });

        await ctx.runMutation(internal.library.saveDraft, {
          botKey: "proposal",
          kind: "contract",
          title: `Contract — ${clientName}`,
          body,
          tags: ["contract"],
          status: "needs_approval",
          approvalId: id,
        });
        return `Contract for ${clientName} drafted and waiting in Approvals.`;
      },
    );
    return outcome.summary;
  },
});
