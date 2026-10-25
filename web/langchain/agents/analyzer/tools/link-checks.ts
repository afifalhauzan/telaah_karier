import { findLinks } from "../../telaah-bersama/identifiers";

// The posting's registration trail, followed the way a fact-checker does it: open every link, follow
// the "Daftar" button on the page it lands on, and stop where the applicant is asked for data or sent
// to a chat. Only fixed hosts are requested from our server (shorteners for their redirect, lnkd.in
// for its warning page, Google Forms for their questions); every other page is read through Tavily,
// so a user-supplied address is never fetched from here and cannot reach internal hosts.

const SHORTENERS = new Set([
  "bit.ly", "s.id", "tinyurl.com", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "is.gd", "ow.ly", "bit.do", "forms.gle",
  "lnkd.in",
]);
// lnkd.in answers an address outside LinkedIn with a warning page naming it, instead of a redirect
const LINKEDIN_EXTERNAL_LINK = /data-tracking-control-name="external_url_click"[^>]*href="([^"]+)"/;
// Behind a login: nothing to read without the applicant's own account
const LOGIN_HOSTS = ["instagram.com", "facebook.com", "fb.com", "tiktok.com", "twitter.com", "x.com", "youtube.com", "threads.net"];
// A platform's own buttons ("Agree & Join LinkedIn", "Sign in with Google") lead nowhere about the posting
const NOT_A_NEXT_STEP = [...LOGIN_HOSTS, "linkedin.com", "accounts.google.com", "google.com", "apple.com", "microsoft.com"];
// A page asks for data only when it reads like a form, not when it merely says "nama perusahaan"
const FORM_WORDS = /isi(lah)?\s|isikan|masukkan|wajib diisi|kirim data|submit|formulir|form pendaftaran/i;
const USER_AGENT = "Mozilla/5.0 (compatible; TelaahKarier/1.0; +https://telaahkarier.com)";

const MAX_SHORTLINKS = 3;
const MAX_HOPS = 3;
// Where the trail starts (the posting's own links) and how far it follows buttons from there
const MAX_STARTS = 3;
const MAX_DEPTH = 2;
const MAX_STEPS = 6;
const MAX_NEXT_PER_PAGE = 2;
const RESOLVE_TIMEOUT_MS = 4000;
const EXTRACT_TIMEOUT_MS = 12000;
// The top of a job page is the job itself; further down are "similar jobs" from other companies.
const MAX_PAGE_CHARS = 4000;
const MAX_FIELDS = 30;

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

export type TraceOutcome = "form" | "page" | "chat" | "login" | "unreadable";

export interface TraceStep {
  url: string;
  // The link this step was reached from: a shortlink, or a button on the page before; null for the posting's own
  from: string | null;
  outcome: TraceOutcome;
  // The form's or page's title, or the chat's number or account
  title: string | null;
  // What the step asks the applicant for ("nama", "KTP/NIK", "nomor Telegram", "kode verifikasi", …)
  asks: string[];
  // A form's questions as written
  fields: string[];
}

export interface LinkChecks {
  shortlinks: ShortlinkResolution[];
  // The first page read, for the analysis and the company search
  page: PageRead | null;
  trail: TraceStep[];
}

// What a form or page asks for, from its questions or text. "Tidak dipungut biaya" is not a request,
// so money is left to the rules and the model, which read the page itself.
const ASKS: Array<[string, RegExp]> = [
  ["nama", /\bnama\b/i],
  ["KTP/NIK", /\b(ktp|nik|nomor induk kependudukan)\b/i],
  ["alamat", /\balamat\b|domisili/i],
  ["tanggal lahir/usia", /tanggal lahir|tgl\.? lahir|\busia\b|\bumur\b/i],
  ["nomor HP/WhatsApp", /(no\.?|nomor|nmr)\s*(hp|handphone|wa\b|whatsapp|telepon|telp|ponsel)/i],
  ["nomor Telegram", /(no\.?|nomor|nmr|akun|username)\s*telegram|telegram\s*(aktif|terdaftar)/i],
  ["email", /e-?mail|surel/i],
  ["kode verifikasi/OTP", /\botp\b|kode\s*(verifikasi|login|masuk|konfirmasi|yang dikirim)/i],
  ["kata sandi/PIN", /kata\s*sandi|password|\bpin\b/i],
  ["foto selfie/KTP", /selfie|swafoto|foto\s*(ktp|diri|wajah)/i],
  ["nomor rekening", /(no\.?|nomor)\s*rek(ening)?\b|rekening bank/i],
];

// A link on a page that leads on with the registration
const NEXT_STEP_LABEL = /daftar|registrasi|register|apply|lamar|pendaftaran|formulir|\bform\b|isi data|gabung|join|klik di ?sini|lanjut/i;
const RECRUITMENT_WORDS = /rekrut|recruit|loker|lowongan|daftar|pendaftaran|karir|career|hiring|seleksi|magang|apply/i;

export function asksOf(text: string): string[] {
  return ASKS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
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

/** The outside address on lnkd.in's warning page. */
export function linkedinExternalLink(html: string): string | null {
  return html.match(LINKEDIN_EXTERNAL_LINK)?.[1].replace(/&amp;/g, "&") ?? null;
}

async function followRedirects(link: string): Promise<string | null> {
  const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
  let url = link;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      const response = await fetch(url, { redirect: "manual", signal });
      let location = response.headers.get("location");
      if (response.status === 200 && hostOf(url) === "lnkd.in") {
        location = linkedinExternalLink(await response.text());
      } else {
        await response.body?.cancel();
        if (response.status < 300 || response.status >= 400) return null;
      }
      if (!location) return null;

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

/**
 * The links on a page that carry the registration on: "Daftar"-like buttons, forms, chats and
 * shortlinks. A link written out as its own label ("https://lnkd.in/x") is taken by its label, which
 * is the address the reader sees.
 */
export function registrationLinks(markdown: string, pageUrl: string): string[] {
  const found: string[] = [];
  for (const [, label, href] of markdown.matchAll(/(?<!!)\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) {
    const target = /^https?:\/\//.test(label.trim()) ? label.trim() : href;
    let url: string;
    try {
      url = new URL(target, pageUrl).toString();
    } catch {
      continue;
    }
    const host = hostOf(url);
    const leadsOn =
      NEXT_STEP_LABEL.test(label) ||
      SHORTENERS.has(host) ||
      isGoogleForm(url) ||
      chatTitle(url) !== null ||
      (RECRUITMENT_WORDS.test(host) && host !== hostOf(pageUrl));
    if (leadsOn && url !== pageUrl && !matchesHost(host, NOT_A_NEXT_STEP) && !found.includes(url)) found.push(url);
  }
  return found;
}

const isGoogleForm = (url: string) => hostOf(url) === "docs.google.com" && new URL(url).pathname.startsWith("/forms/");

/** A WhatsApp or Telegram link as the chat it opens, or null when the link is no chat. */
export function chatTitle(url: string): string | null {
  const host = hostOf(url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (host === "wa.me") return `WhatsApp ${parsed.pathname.replace(/\D/g, "") || "(nomor tidak tertulis)"}`;
  if (host === "api.whatsapp.com" || (host === "whatsapp.com" && parsed.pathname.startsWith("/send"))) {
    return `WhatsApp ${parsed.searchParams.get("phone") ?? ""}`.trim();
  }
  if (host === "chat.whatsapp.com") return "grup WhatsApp";
  if (host === "t.me" || host === "telegram.me") return `Telegram @${parsed.pathname.split("/")[1] ?? ""}`;
  return null;
}

/** A Google Form's title and questions, from the data the page embeds for its own script. */
export function parseGoogleForm(html: string): { title: string | null; description: string; fields: string[] } | null {
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as unknown[];
    const form = data[1] as unknown[] | undefined;
    const questions = (form?.[1] as unknown[][] | undefined) ?? [];
    return {
      title: (typeof data[3] === "string" && data[3]) || (typeof form?.[8] === "string" ? (form[8] as string) : null),
      description: typeof form?.[0] === "string" ? (form[0] as string) : "",
      fields: questions
        .map((question) => (typeof question[1] === "string" ? question[1].replace(/\s+/g, " ").trim() : ""))
        .filter(Boolean)
        .slice(0, MAX_FIELDS),
    };
  } catch {
    return null;
  }
}

async function readGoogleForm(url: string, from: string | null): Promise<TraceStep> {
  const step: TraceStep = { url, from, outcome: "unreadable", title: "Google Form", asks: [], fields: [] };
  try {
    const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS) });
    // The form's owner limits it to signed-in Google accounts
    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      return { ...step, outcome: "login" };
    }
    const form = response.ok ? parseGoogleForm(await response.text()) : null;
    if (!form) return step;
    return { ...step, outcome: "form", title: form.title, fields: form.fields, asks: asksOf([form.description, ...form.fields].join("\n")) };
  } catch (error) {
    console.error("[LinkChecks] Google Form read failed:", error instanceof Error ? error.message : error);
    return step;
  }
}

/** Pages read through Tavily in one call, as markdown (the text format drops every link address). */
async function readPages(urls: string[]): Promise<Map<string, string | null>> {
  const pages = new Map<string, string | null>(urls.map((url) => [url, null]));
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !urls.length) return pages;
  try {
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ urls, extract_depth: "basic", format: "markdown" }),
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Tavily extract HTTP ${response.status}`);
    for (const result of ((await response.json())?.results ?? []) as Array<{ url?: string; raw_content?: unknown }>) {
      const url = urls.find((candidate) => candidate === result.url) ?? (urls.length === 1 ? urls[0] : undefined);
      if (url && typeof result.raw_content === "string" && result.raw_content.trim()) pages.set(url, result.raw_content);
    }
  } catch (error) {
    console.error("[LinkChecks] Page read failed:", error instanceof Error ? error.message : error);
  }
  return pages;
}

/** One step for every address, read in parallel; pages also give the links to follow next. */
async function visit(targets: Array<{ url: string; from: string | null }>): Promise<Array<{ step: TraceStep; markdown: string | null }>> {
  const toRead = targets.filter(({ url }) => !isGoogleForm(url) && chatTitle(url) === null && !matchesHost(hostOf(url), LOGIN_HOSTS));
  const pages = await readPages(toRead.map(({ url }) => url));

  return Promise.all(
    targets.map(async ({ url, from }) => {
      if (isGoogleForm(url)) return { step: await readGoogleForm(url, from), markdown: null };
      const chat = chatTitle(url);
      if (chat) return { step: { url, from, outcome: "chat" as const, title: chat, asks: [], fields: [] }, markdown: null };
      if (matchesHost(hostOf(url), LOGIN_HOSTS)) {
        return { step: { url, from, outcome: "login" as const, title: hostOf(url), asks: [], fields: [] }, markdown: null };
      }
      const markdown = pages.get(url) ?? null;
      const text = markdown ? pageText(markdown) : "";
      const title = markdown?.match(/^#\s+(.+)$/m)?.[1].trim() ?? null;
      return {
        step: {
          url,
          from,
          outcome: text ? ("page" as const) : ("unreadable" as const),
          title,
          asks: FORM_WORDS.test(text) ? asksOf(text) : [],
          fields: [],
        },
        markdown,
      };
    })
  );
}

/** Where a link really goes: a shortlink is opened first, a LinkedIn share is read by itself. */
async function destinationOf(link: string): Promise<ShortlinkResolution | null> {
  if (!SHORTENERS.has(hostOf(link))) return null;
  return { link, destination: await followRedirects(link) };
}

function readTarget(link: string, resolved: ShortlinkResolution | null): string | null {
  if (!resolved) return link;
  // A shared LinkedIn post reads cleaner (post and comments, no sign-in wall) by its lnkd.in link
  return resolved.destination ? (matchesHost(hostOf(resolved.destination), ["linkedin.com"]) ? link : resolved.destination) : null;
}

/** Follows the posting's registration trail from its own links (and any read from its QR codes). */
export async function checkLinks(text: string, extraLinks: string[] = []): Promise<LinkChecks> {
  const links = [...new Set([...findLinks(text), ...extraLinks])].slice(0, MAX_STARTS + MAX_SHORTLINKS);
  const shortlinks: ShortlinkResolution[] = [];
  const trail: TraceStep[] = [];
  let page: PageRead | null = null;
  const seen = new Set<string>();

  let frontier: Array<{ url: string; from: string | null }> = [];
  for (const link of links) {
    const resolved = shortlinks.length < MAX_SHORTLINKS ? await destinationOf(link) : null;
    if (resolved) shortlinks.push(resolved);
    const target = readTarget(link, resolved);
    // A bare homepage ("pertamina.com") says nothing about this posting
    if (target && new URL(target).pathname.replace(/\/+$/, "").length > 0 && !seen.has(target)) {
      seen.add(target);
      frontier.push({ url: target, from: resolved && target !== link ? link : null });
    }
  }
  frontier = frontier.slice(0, MAX_STARTS);

  for (let depth = 0; depth < MAX_DEPTH && frontier.length && trail.length < MAX_STEPS; depth += 1) {
    const visited = await visit(frontier.slice(0, MAX_STEPS - trail.length));
    const next: Array<{ url: string; from: string | null }> = [];
    for (const { step, markdown } of visited) {
      trail.push(step);
      if (!page && step.outcome === "page" && markdown) page = { url: step.url, text: pageText(markdown).slice(0, MAX_PAGE_CHARS) };
      for (const link of markdown ? registrationLinks(markdown, step.url).slice(0, MAX_NEXT_PER_PAGE) : []) {
        const resolved = await destinationOf(link);
        if (resolved && shortlinks.length < MAX_SHORTLINKS * 2) shortlinks.push(resolved);
        const target = readTarget(link, resolved);
        if (target && !seen.has(target)) {
          seen.add(target);
          next.push({ url: target, from: step.url });
        }
      }
    }
    frontier = next;
  }

  // A posting whose only link could not be read still names its page
  if (!page && trail[0]?.outcome === "unreadable") page = { url: trail[0].url, text: null };
  return { shortlinks, page, trail };
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

const OUTCOME_TEXT: Record<TraceOutcome, string> = {
  form: "formulir",
  page: "halaman",
  chat: "chat",
  login: "tertutup login",
  unreadable: "tidak dapat dibaca",
};

/** The trail as material lines: what each step is and what it asks of the applicant. */
export function trailBlock(checks: LinkChecks): string {
  if (!checks.trail.length) return "";
  return [
    "[Jejak pendaftaran]",
    ...checks.trail.map((step, index) =>
      [
        `${index + 1}. ${step.from ? `${step.from} → ` : ""}${step.url}: ${OUTCOME_TEXT[step.outcome]}${step.title ? ` "${step.title}"` : ""}`,
        step.asks.length ? `   Meminta: ${step.asks.join(", ")}` : "",
        step.fields.length ? `   Pertanyaan formulir: ${step.fields.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

export function describeLinksForProgress(checks: LinkChecks): string | null {
  const parts: string[] = [];
  if (checks.shortlinks.length) {
    const resolved = checks.shortlinks.filter((item) => item.destination).length;
    parts.push(`${resolved} dari ${checks.shortlinks.length} shortlink berhasil dibuka tujuannya`);
  }
  const forms = checks.trail.filter((step) => step.outcome === "form").length;
  const chats = checks.trail.filter((step) => step.outcome === "chat").length;
  if (checks.trail.length) {
    parts.push(
      `${checks.trail.length} langkah pendaftaran ditelusuri${forms ? `, ${forms} formulir dibaca` : ""}${chats ? `, ${chats} berakhir di chat` : ""}`
    );
  }
  return parts.length ? `Menelusuri link di materi: ${parts.join(", ")}` : null;
}
