/**
 * Drop a paragraph that only says again what the one above it already said.
 *
 * A real email went out reading "...and the homepage takes 3.5 seconds to
 * load." followed, as its own paragraph, by "The homepage takes 3.5 seconds to
 * load." The measured fault is handed to the model as the thing to open with,
 * and it both wove it into the opening sentence and restated it underneath.
 *
 * The prompt now asks for it once, and this is here because a prompt is a
 * request. Only a later paragraph wholly contained in what came before is
 * removed, so a sentence that adds anything at all survives; short lines are
 * left alone, since "Regards," is not a repetition.
 */
export function dropRepeatedParagraphs(body: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const kept: string[] = [];

  for (const paragraph of body.split(/\n{2,}/)) {
    const normalised = norm(paragraph);
    if (normalised.length >= 20 && norm(kept.join(" ")).includes(normalised)) continue;
    kept.push(paragraph);
  }
  return kept.join("\n\n");
}

