import { siteInfo } from "../data/nav.js";

export function buildOutreachDraft(
  businessName: string,
  category?: string | null,
  reason: "no_website" | "poor_website" = "no_website",
  /**
   * A specific, verifiable fault found on their site, phrased for the
   * recipient (see getWebsiteHealth's `emailDefect`). When present it replaces
   * the generic "could be working harder" opener, which is the whole point:
   * "your domain no longer resolves" is something an owner can check in ten
   * seconds and act on, while a subjective judgement about their design reads
   * like every other agency cold email and invites an argument rather than a
   * reply. Optional because not every prospect has one -- a merely slow or
   * dated site has no single fact to name.
   */
  defect?: string | null
) {
  const subject = defect
    ? `Something's wrong with ${businessName}'s website`
    : `Quick look at ${businessName}'s online presence`;

  let opening: string;
  if (reason === "poor_website" && defect) {
    opening = `I came across ${businessName} and went to look at your website — ${defect}. I don't think that's doing you any favours with people trying to find you.`;
  } else if (reason === "poor_website") {
    opening = `I came across ${businessName} and had a look at your website — it looks like it could be working a lot harder for you. A few quick fixes to speed and mobile-friendliness could mean a lot more people actually stick around when they land on it.`;
  } else {
    opening = `I came across ${businessName} and noticed you don't currently have a website${
      category ? ` for your ${category.toLowerCase()} business` : ""
    } — which likely means people searching nearby are landing on a competitor's site instead of yours.`;
  }

  const body = `Hi there,

${opening}

I run The Creative Current, a Durban-based web design and management agency. We build and manage websites for local businesses so you don't have to think about it again — hosting, updates, and all.

Would you be open to a quick call this week? I can show you a couple of ideas specific to ${businessName} at no cost.

Best,
The Creative Current
${siteInfo.email}
${siteInfo.phone}
https://thecreativecurrent.co.za`;

  return { subject, body };
}

/**
 * The one permitted second touch. Deliberately shorter than the first email
 * and built around the specific fault rather than repeating the pitch -- the
 * first message already made the offer, so restating it adds nothing and
 * reads as pestering.
 *
 * This exists partly to recover a real gap: the first batch of outreach went
 * out on the generic template, before drafts could name the defect. Those
 * recipients were told their site "could be working harder"; the follow-up can
 * tell them exactly what is wrong with it, which is a better email than the
 * one they got.
 *
 * Explicitly signs off as the last contact. That is both the decent thing and
 * the POPIA-safe one: a recipient who does not reply is told, in the message
 * itself, that nothing further is coming.
 */
export function buildFollowUpDraft(businessName: string, category?: string | null, defect?: string | null) {
  const subject = `Following up — ${businessName}`;

  const specifics = defect
    ? `To be specific about what I noticed: ${defect}.`
    : `The short version: your website isn't doing as much for you as it could, and for a ${
        category ? category.toLowerCase() : "business"
      } that mostly gets found online, that's worth a look.`;

  const body = `Hi there,

I sent a note last week about ${businessName}'s website and didn't hear back — no problem at all, I know how it goes.

${specifics}

If it's useful, I'm happy to do a short walkthrough of what I'd change, at no cost and with no obligation. If not, I won't follow up again.

Best,
The Creative Current
${siteInfo.email}
${siteInfo.phone}
https://thecreativecurrent.co.za`;

  return { subject, body };
}
