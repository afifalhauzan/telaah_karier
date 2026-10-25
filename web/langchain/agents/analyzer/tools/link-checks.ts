import { findLinks } from "../../telaah-bersama/identifiers";

// Evidence from the links in a posting, gathered before the analysis. Only known shorteners are
// requested from our server, and only for their redirect header; every other page is read through
// Tavily. A user-supplied address is never fetched from here, so it cannot reach internal hosts.

const SHORTENERS = new Set([
  "bit.ly", "s.id", "tinyurl.com", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "is.gd", "ow.ly", "bit.do", "forms.gle",
]);
// Chats and social profiles hold no posting to read.
const UNREADABLE_HOSTS = [
  "wa.me", "whatsapp.com", "t.me", "telegram.me", "instagram.com", "facebook.com", "fb.com", "tiktok.com",
  "twitter.com", "x.com", "youtube.com",
];

const MAX_SHORTLINKS = 3;
const MAX_HOPS = 3;
const RESOLVE_TIMEOUT_MS = 4000;
const EXTRACT_TIMEOUT_MS = 12000;
// The top of a job page is the job itself; further down are "similar jobs" from other companies.
const MAX_PAGE_CHARS = 4000;

export interface ShortlinkResolution {
  link: string;
  // null when the shortener did not reveal a destination (removed link, bot protection, timeout).
  destination: string | null;
}

export interface PageRead {
  url: string;
  // null when the page could not be read (the site blocks automated reading).
  text: string | null;
}

export interface LinkChecks {
  shortlinks: ShortlinkResolution[];
  page: PageRead | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesHost(host: string, domains: Iterable<string>): boolean {
  for (const domain of domains) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

async function followRedirects(link: string): Promise<string | null> {
  const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
  let url = link;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      const response = await fetch(url, { redirect: "manual", signal });
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) return null;

      const next = new URL(location, url).toString();
      // Stop before the destination: only shorteners are ever requested
      if (!SHORTENERS.has(hostOf(next))) return next;
      url = next;
    }
  } catch {
    // Unreachable or timed out: the destination stays unknown
  }
  return null;
}

/**
 * A page read as markdown, flattened to text. Links keep their label only, so an address written out
 * in the page (an "APPLY HERE: https://…" comment) survives while button links ("Like", "Reply",
 * sign-in redirects) do not fill the page budget.
 */
export function pageText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function readPage(url: string): Promise<PageRead | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      // Markdown, not text: the text format drops every link address, including the posting's own
      body: JSON.stringify({ urls: [url], extract_depth: "basic", format: "markdown" }),
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Tavily extract HTTP ${response.status}`);

    const raw: unknown = (await response.json())?.results?.[0]?.raw_content;
    const text = typeof raw === "string" ? pageText(raw) : "";
    return { url, text: text ? text.slice(0, MAX_PAGE_CHARS) : null };
  } catch (error) {
    console.error("[LinkChecks] Page read failed:", error instanceof Error ? error.message : error);
    return { url, text: null };
  }
}

/** The first link that points at a specific page (not a homepage, chat, or profile). */
function pickPageUrl(links: string[], shortlinks: ShortlinkResolution[]): string | null {
  const candidates = [
    ...links.filter((link) => !SHORTENERS.has(hostOf(link))),
    ...shortlinks.flatMap((item) => item.destination ?? []),
  ];
  return (
    candidates.find((url) => {
      const host = hostOf(url);
      return host && !matchesHost(host, UNREADABLE_HOSTS) && new URL(url).pathname.replace(/\/+$/, "").length > 0;
    }) ?? null
  );
}

/** Opens the shortlinks in the material, then reads the page the posting points to. */
export async function checkLinks(text: string): Promise<LinkChecks> {
  const links = findLinks(text);
  const shortlinks = await Promise.all(
    links
      .filter((link) => SHORTENERS.has(hostOf(link)))
      .slice(0, MAX_SHORTLINKS)
      .map(async (link) => ({ link, destination: await followRedirects(link) }))
  );

  const pageUrl = pickPageUrl(links, shortlinks);
  return { shortlinks, page: pageUrl ? await readPage(pageUrl) : null };
}

/** Shortlink destinations as material lines, so the rules and the search see the real address. */
export function shortlinkLines(checks: LinkChecks): string {
  const resolved = checks.shortlinks.filter((item) => item.destination);
  return resolved.length
    ? ["[Tujuan shortlink]", ...resolved.map((item) => `${item.link} mengarah ke ${item.destination}`)].join("\n")
    : "";
}

export function pageBlock(checks: LinkChecks): string {
  return checks.page?.text ? `[Isi halaman dari link ${checks.page.url}]\n${checks.page.text}` : "";
}

export function describeLinksForProgress(checks: LinkChecks): string | null {
  const parts: string[] = [];
  if (checks.shortlinks.length) {
    const resolved = checks.shortlinks.filter((item) => item.destination).length;
    parts.push(`${resolved} dari ${checks.shortlinks.length} shortlink berhasil dibuka tujuannya`);
  }
  if (checks.page) {
    parts.push(checks.page.text ? `halaman ${hostOf(checks.page.url)} dibaca` : `halaman ${hostOf(checks.page.url)} tidak dapat dibaca`);
  }
  return parts.length ? `Memeriksa link di materi: ${parts.join(", ")}` : null;
}
