/**
 * Minimal HTML utilities.
 *
 * Deliberately regex-based rather than Cheerio: this code runs in BOTH the
 * Convex runtime (which is not Node) and the local worker (which is). One
 * implementation that works in both beats two that drift apart. The worker uses
 * Cheerio where it genuinely needs a DOM; everything here is the cheap path.
 */

export interface FetchedPage {
  ok: boolean;
  status: number;
  url: string;
  finalUrl: string;
  html: string;
  seconds: number;
  error?: string;
}

/** Fetch a page with a hard timeout. A slow prospect site must never stall a run. */
export async function fetchPage(url: string, timeoutMs = 12_000): Promise<FetchedPage> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify honestly. A scraper pretending to be Chrome is how you end
        // up blocked and how you deserve to be.
        "user-agent":
          "TheCreativeCurrentOffice/1.0 (+https://www.thecreativecurrent.co.za; site audit for a prospective client)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url,
      finalUrl: res.url || url,
      html,
      seconds: (Date.now() - started) / 1000,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      finalUrl: url,
      html: "",
      seconds: (Date.now() - started) / 1000,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function title(html: string): string {
  return stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
}

export function metaContent(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
    "i",
  );
  return (re.exec(html)?.[1] ?? alt.exec(html)?.[1] ?? "").trim();
}

export function headings(html: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ level: Number(m[1]), text: stripTags(m[2]) });
  }
  return out;
}

export function links(html: string, base?: string): string[] {
  const out = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("javascript:")) continue;
    if (base && !/^[a-z]+:/i.test(href)) {
      try {
        out.add(new URL(href, base).href);
      } catch {
        /* a malformed href is not worth failing an audit over */
      }
    } else {
      out.add(href);
    }
  }
  return [...out];
}

export function images(html: string): { src: string; alt: string | null }[] {
  const out: { src: string; alt: string | null }[] = [];
  const re = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const src = /src=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const altMatch = /alt=["']([^"']*)["']/i.exec(attrs);
    out.push({ src, alt: altMatch ? altMatch[1] : null });
  }
  return out;
}

/**
 * Turn `&#105;nfo&#64;example.co.za` back into text before looking for an
 * address in it.
 *
 * Usually not evasion — plenty of themes and page builders emit an entity for
 * the @ sign as a matter of course — but the effect is the same either way: the
 * address is on the page, a person reads it perfectly well, and the regex below
 * never sees it.
 */
function decodeEntities(html: string): string {
  return html
    .replace(/&#x([0-9a-f]{1,6});/gi, (whole, hex) => codePoint(parseInt(hex, 16), whole))
    .replace(/&#(\d{1,7});/g, (whole, dec) => codePoint(parseInt(dec, 10), whole))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&amp;/gi, "&");
}

function codePoint(value: number, whole: string): string {
  // A malformed entity stays as it was rather than throwing mid-scrape.
  if (!Number.isFinite(value) || value < 1 || value > 0x10ffff) return whole;
  try {
    return String.fromCodePoint(value);
  } catch {
    return whole;
  }
}

export function emails(html: string): string[] {
  const decoded = decodeEntities(html);
  const out = new Set<string>();
  const mailto = /mailto:([^"'?>\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailto.exec(decoded)) !== null) out.add(m[1].toLowerCase());

  const text = stripTags(decoded);
  const bare = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;
  while ((m = bare.exec(text)) !== null) out.add(m[0].toLowerCase());

  // Image files and tracking pixels turn up as false positives constantly.
  return [...out].filter(
    (e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e) && !/^[0-9a-f]{16,}@/i.test(e),
  );
}
