import { siteInfo } from "../data/nav.js";

export function buildOutreachDraft(
  businessName: string,
  category?: string | null,
  reason: "no_website" | "poor_website" = "no_website"
) {
  const subject = `Quick look at ${businessName}'s online presence`;

  const opening =
    reason === "poor_website"
      ? `I came across ${businessName} and had a look at your website — it looks like it could be working a lot harder for you. A few quick fixes to speed and mobile-friendliness could mean a lot more people actually stick around when they land on it.`
      : `I came across ${businessName} and noticed you don't currently have a website${
          category ? ` for your ${category.toLowerCase()} business` : ""
        } — which likely means people searching nearby are landing on a competitor's site instead of yours.`;

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
