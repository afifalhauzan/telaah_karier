import { findContacts } from "../telaah-bersama/identifiers";

// Domains dressed up as a well-known employer's: the brand plus recruitment words, numbers, or a
// one-letter typo ("rekrutmen-pertamina.com", "karirbri2026.id", "pertamlna.com"), on a domain the
// brand does not own. The most common impersonation in Indonesian job scams, and one the
// "official name + free email" rule misses because the scam has a domain of its own.

interface Brand {
  name: string;
  tokens: string[];
  // Registered domains the brand recruits from; a host on one of them (or a subdomain) is genuine.
  official: string[];
}

// shortcut: a hand-picked list of the employers most often impersonated; extend it from reports.
const BRANDS: Brand[] = [
  { name: "Pertamina", tokens: ["pertamina"], official: ["pertamina.com"] },
  { name: "PLN", tokens: ["pln"], official: ["pln.co.id"] },
  { name: "Telkom Indonesia", tokens: ["telkom"], official: ["telkom.co.id"] },
  { name: "Telkomsel", tokens: ["telkomsel"], official: ["telkomsel.com"] },
  { name: "BRI", tokens: ["bri"], official: ["bri.co.id"] },
  { name: "BNI", tokens: ["bni"], official: ["bni.co.id"] },
  { name: "Bank Mandiri", tokens: ["bankmandiri", "mandiri"], official: ["bankmandiri.co.id"] },
  { name: "BTN", tokens: ["btn"], official: ["btn.co.id"] },
  { name: "BSI", tokens: ["bankbsi", "bsi"], official: ["bankbsi.co.id"] },
  { name: "BCA", tokens: ["bca"], official: ["bca.co.id"] },
  { name: "KAI", tokens: ["kai", "keretaapi"], official: ["kai.id"] },
  { name: "Garuda Indonesia", tokens: ["garudaindonesia", "garuda"], official: ["garuda-indonesia.com"] },
  { name: "Pegadaian", tokens: ["pegadaian"], official: ["pegadaian.co.id"] },
  { name: "Pos Indonesia", tokens: ["posindonesia"], official: ["posindonesia.co.id"] },
  { name: "Jasa Marga", tokens: ["jasamarga"], official: ["jasamarga.co.id"] },
  { name: "Pelindo", tokens: ["pelindo"], official: ["pelindo.co.id"] },
  { name: "Bulog", tokens: ["bulog"], official: ["bulog.co.id"] },
  { name: "Antam", tokens: ["antam"], official: ["antam.com"] },
  { name: "BUMN", tokens: ["bumn"], official: ["bumn.go.id", "fhcibumn.id"] },
  { name: "Astra", tokens: ["astra"], official: ["astra.co.id"] },
  { name: "Indomaret", tokens: ["indomaret"], official: ["indomaret.co.id"] },
  { name: "Alfamart", tokens: ["alfamart"], official: ["alfamart.co.id"] },
  { name: "Unilever", tokens: ["unilever"], official: ["unilever.co.id", "unilever.com"] },
  { name: "Gojek", tokens: ["gojek"], official: ["gojek.com"] },
  { name: "Tokopedia", tokens: ["tokopedia"], official: ["tokopedia.com"] },
  { name: "Shopee", tokens: ["shopee"], official: ["shopee.co.id", "shopee.com"] },
  { name: "JobStreet", tokens: ["jobstreet"], official: ["jobstreet.co.id", "jobstreet.com"] },
  { name: "LinkedIn", tokens: ["linkedin"], official: ["linkedin.com"] },
  { name: "Glints", tokens: ["glints"], official: ["glints.com"] },
  { name: "Kalibrr", tokens: ["kalibrr"], official: ["kalibrr.com", "kalibrr.id"] },
];

// Government bodies recruit only from .go.id (and the armed forces from .mil.id).
const GOVERNMENT: Brand = {
  name: "instansi pemerintah",
  tokens: [
    "kemnaker", "karirhub", "maganghub", "kemlu", "bp2mi", "kemenkes", "kemendikbud", "kemenkeu", "kemensos",
    "kementerian", "sscasn", "bkn", "cpns", "pppk", "bpjsketenagakerjaan", "bpjskesehatan", "bpjs", "polri",
  ],
  official: ["go.id", "mil.id"],
};

// What scammers add around a brand. Never a word that is part of a real company name.
const DECORATIONS = [
  "rekrutmen", "recruitment", "recruit", "rekrut", "karier", "karir", "careers", "career", "lowongan", "loker",
  "jobs", "job", "kerja", "hiring", "hrd", "hr", "pendaftaran", "daftar", "registrasi", "register", "seleksi",
  "official", "resmi", "magang", "internship", "bersama", "portal", "online", "info", "indonesia", "persero", "tbk",
  "terbaru", "tes", "test", "pt", "id",
].sort((a, b) => b.length - a.length);

const SECOND_LEVEL_SUFFIXES = new Set(["co.id", "go.id", "ac.id", "or.id", "web.id", "sch.id", "my.id", "biz.id", "net.id", "mil.id"]);
const HOSTING_SUFFIXES = ["vercel.app", "netlify.app", "github.io", "pages.dev", "web.app", "firebaseapp.com", "blogspot.com", "wordpress.com", "wixsite.com", "weebly.com", "carrd.co", "herokuapp.com"];

export interface LookalikeDomain {
  domain: string;
  brand: string;
  official: string[];
}

function isOfficial(host: string, brand: Brand): boolean {
  return brand.official.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** The labels a site owner chose: the host without its public or hosting suffix. */
function ownedLabels(host: string): string[] {
  const hosting = HOSTING_SUFFIXES.find((suffix) => host.endsWith(`.${suffix}`));
  if (hosting) return host.slice(0, -hosting.length - 1).split(".");
  const labels = host.split(".");
  const suffixLength = SECOND_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 2 : 1;
  return labels.slice(0, -suffixLength);
}

function stripAll(text: string, words: string[]): string {
  let rest = text;
  for (const word of words) rest = rest.split(word).join("");
  return rest;
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Whether a label is the brand dressed up: decorations, digits, or a typo, but nothing else. */
function dressesUp(label: string, brand: Brand): boolean {
  const tokens = [...brand.tokens].sort((a, b) => b.length - a.length);
  const compact = label.replace(/-/g, "");
  // The plain brand on another domain may be the company's own spare registration; the
  // government has none outside .go.id
  if (tokens.includes(compact) && brand !== GOVERNMENT) return false;
  if (tokens.some((token) => compact.includes(token))) {
    // Brand first: some brands contain a decoration ("posindonesia")
    return stripAll(stripAll(compact, tokens).replace(/\d/g, ""), DECORATIONS) === "";
  }
  // Typos only for long names: "bni" and "bri" are one letter apart and both real
  const bare = stripAll(compact.replace(/\d/g, ""), DECORATIONS);
  return tokens.some((token) => token.length >= 6 && withinOneEdit(bare, token));
}

/** Whether a host is on a domain one of the listed brands (or the government) recruits from. */
export function isOfficialHost(host: string): boolean {
  return [...BRANDS, GOVERNMENT].some((brand) => isOfficial(host, brand));
}

export function lookalikeFor(host: string): LookalikeDomain | null {
  for (const brand of [...BRANDS, GOVERNMENT]) {
    if (isOfficial(host, brand)) continue;
    if (ownedLabels(host).some((label) => dressesUp(label, brand))) {
      // Government domains are suffixes, shown as ".go.id"
      return { domain: host, brand: brand.name, official: brand === GOVERNMENT ? brand.official.map((suffix) => `.${suffix}`) : brand.official };
    }
  }
  return null;
}

/** Sites and email domains in the material that pose as a well-known employer's. */
export function findLookalikeDomains(text: string): LookalikeDomain[] {
  const hosts = findContacts(text).identifiers.flatMap((item) => {
    if (item.kind === "email") return [item.value.split("@")[1]];
    return item.kind === "domain" ? [item.value.split("/")[0]] : [];
  });
  const found: LookalikeDomain[] = [];
  for (const host of new Set(hosts)) {
    const match = lookalikeFor(host);
    if (match) found.push(match);
  }
  return found;
}

// Brand words that are also ordinary words or other companies' names ("PT Karya Mandiri", "Garuda Food")
const AMBIGUOUS_TOKENS = new Set(["mandiri", "garuda", "astra"]);

/** The listed brands the text names, by full name or a distinctive token, with the domains they recruit from. */
export function namedBrands(text: string): Array<{ name: string; official: string[] }> {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return BRANDS.filter(
    (brand) =>
      lower.includes(` ${brand.name.toLowerCase()} `) ||
      brand.tokens.some((token) => token.length >= 6 && !AMBIGUOUS_TOKENS.has(token) && lower.includes(` ${token} `))
  ).map(({ name, official }) => ({ name, official }));
}
