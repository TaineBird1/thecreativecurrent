import { siteInfo } from "../data/nav";

export function buildMailto(
  subject: string,
  fields: Record<string, string | undefined>
): string {
  const body = Object.entries(fields)
    .filter(([, value]) => value && value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const params = new URLSearchParams({ subject, body });
  return `mailto:${siteInfo.email}?${params.toString().replace(/\+/g, "%20")}`;
}
