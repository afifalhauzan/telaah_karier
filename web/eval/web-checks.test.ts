/**
 * Checks for the evidence gathered before the analysis and the checklist shown under the verdict
 * (langchain/agents/analyzer/checks.ts, tools/domain-age.ts, tools/ct-cluster.ts). No network: results are given.
 *
 *   pnpm test:web-checks
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChecks, certClusterSignals, isThrowawaySubdomain, knowledgeSignals, newDomainSignals, trailSignals } from "../langchain/agents/analyzer/checks";
import { summarizeCertEntries } from "../langchain/agents/analyzer/tools/ct-cluster";
import {
  asksOf,
  chatTitle,
  linkedinExternalLink,
  pageText,
  parseGoogleForm,
  registrationLinks,
  type LinkChecks,
} from "../langchain/agents/analyzer/tools/link-checks";
import { decodeQr } from "../langchain/agents/analyzer/tools/qr";
import QRCode from "qrcode";
import { caseIdentifiers } from "../langchain/agents/knowledge/case-card";
import { knowledgeSources, type KnowledgeResult } from "../langchain/agents/analyzer/tools/knowledge";
import { detectSignals } from "../langchain/agents/analyzer/signals";
import { registrableDomain } from "../langchain/agents/analyzer/tools/domain-age";
import type { WebSearchResult } from "../langchain/agents/analyzer/tools/tavily-search";

const NOW = new Date("2026-10-22T00:00:00Z");

test("domain age is looked up on the registered domain, never on free hosting", () => {
  assert.equal(registrableDomain("career.idstar.co.id"), "idstar.co.id");
  assert.equal(registrableDomain("www.rekrutmen-pertamina.com"), "rekrutmen-pertamina.com");
  assert.equal(registrableDomain("loker.my.id"), "loker.my.id");
  assert.equal(registrableDomain("daftar-bumn.vercel.app"), null);
});

test("a domain registered weeks ago is a signal, an old one is not", () => {
  const ages = [
    { domain: "rekrutmen-baru.com", registeredAt: "2026-10-01T00:00:00Z" },
    { domain: "idstar.co.id", registeredAt: "2017-02-01T07:04:12Z" },
    { domain: "tidak-terjawab.id", registeredAt: null },
  ];
  const signals = newDomainSignals(ages, NOW);
  assert.deepEqual(signals.map((signal) => [signal.id, signal.floor]), [["new_domain", "sedang"]]);
  assert.match(signals[0].description, /21 hari/);

  const checks = buildChecks({ signals: [], links: null, search: null, domainAges: ages, now: NOW });
  assert.deepEqual(checks.slice(1).map((check) => check.status), ["warning", "ok", "skipped"]);
});

test("the checklist lists every check that ran, in pipeline order", () => {
  const search: WebSearchResult = {
    status: "ok",
    entity: { kind: "company", name: "PT Idstar Cipta Teknologi" },
    retrievedCount: 6,
    sources: [1, 2, 3].map((n) => ({ id: `S${n}`, title: "", url: `https://idstar.co.id/${n}`, snippet: "" })),
    site: { domain: "idstar.co.id", count: 2 },
  };
  const checks = buildChecks({
    signals: detectSignals("Kirim CV ke hrd.idstar@gmail.com, daftar di bit.ly/daftar-ids"),
    links: {
      shortlinks: [
        { link: "https://bit.ly/daftar-ids", destination: "https://forms.gle-example.com/form" },
        { link: "https://s.id/hilang", destination: null },
      ],
      page: { url: "https://www.jobstreet.co.id/id/job/123", text: null },
      trail: [
        { url: "https://forms.gle-example.com/form", from: "https://bit.ly/daftar-ids", outcome: "unreadable", title: null, asks: [], fields: [] },
      ],
    },
    search,
    domainAges: [],
    now: NOW,
  });

  assert.deepEqual(
    checks.map((check) => [check.label, check.status]),
    [
      ["Pola penipuan umum", "warning"],
      ["Shortlink s.id/hilang", "warning"],
      ["Jejak pendaftaran: forms.gle-example.com/form", "info"],
      ["Jejak di web", "ok"],
    ]
  );
  assert.match(checks[3].detail, /2 di antaranya dari situs idstar\.co\.id/);
});

test("without rules or web checks, their lines are left out instead of claiming a clean result", () => {
  assert.deepEqual(buildChecks({ signals: null, links: null, search: null, domainAges: [] }), []);
  const [patterns] = buildChecks({ signals: [], links: null, search: null, domainAges: [] });
  assert.equal(patterns.status, "ok");
});

// Recorded from the certificate logs: the domain behind the fake PT Timah link (TurnBackHoax, 9 Oct 2024)
const APLY_ENTRIES = [
  { dns_names: ["*.aply.my.id", "aply.my.id"], not_before: "2024-09-17T10:00:00" },
  { dns_names: ["jobstreet-open-rekrutmen.aply.my.id"], not_before: "2024-09-17T11:00:00" },
  { dns_names: ["disnakerja.aply.my.id", "www.disnakerja.aply.my.id"], not_before: "2024-09-18T08:00:00" },
  { dns_names: ["recruitment-buma.aply.my.id"], not_before: "2024-09-18T09:00:00" },
  { dns_names: ["pt-timah-tbk.open-rekrutmen.aply.my.id"], not_before: "2024-09-18T10:00:00" },
  { dns_names: ["open-recrutment-kaltimprimacoal.aply.my.id"], not_before: "2024-09-24T10:00:00" },
  { dns_names: ["loker-jobstreet.aply.my.id"], not_before: "2024-09-29T10:00:00" },
];

test("a domain hosting a row of recruitment sites in other names is flagged from the certificate logs", () => {
  const cluster = summarizeCertEntries("aply.my.id", APLY_ENTRIES);
  assert.equal(cluster.firstSeen, "2024-09-17");
  assert.equal(cluster.recruitmentHosts.length, 5);
  assert.deepEqual(cluster.imitatedBrands, ["JobStreet"]);

  const [signal] = certClusterSignals([cluster]);
  assert.deepEqual([signal.id, signal.severity, signal.floor], ["cert_cluster", "moderate", "sedang"]);

  const [, check] = buildChecks({ signals: [], links: null, search: null, domainAges: [], certClusters: [cluster], now: NOW });
  assert.equal(check.status, "warning");
  assert.match(check.detail, /7 situs di domain ini sejak 17 Sep 2024, atas nama JobStreet, termasuk/);
});

test("posing as two employers under one domain is a strong signal; one company's own sites are not flagged", () => {
  const twoBrands = summarizeCertEntries("loker-resmi.id", [
    { dns_names: ["rekrutmen-pertamina.loker-resmi.id"], not_before: "2026-09-01" },
    { dns_names: ["karir-pln.loker-resmi.id"], not_before: "2026-09-02" },
  ]);
  assert.deepEqual(certClusterSignals([twoBrands]).map((signal) => [signal.severity, signal.floor]), [["strong", "tinggi"]]);

  const company = summarizeCertEntries("idstar.co.id", [
    { dns_names: ["idstar.co.id", "www.idstar.co.id"], not_before: "2020-01-01" },
    { dns_names: ["career.idstar.co.id"], not_before: "2021-01-01" },
    { dns_names: ["mail.idstar.co.id"], not_before: "2021-01-01" },
  ]);
  assert.deepEqual(certClusterSignals([company]), []);
  assert.equal(summarizeCertEntries("big.com", Array.from({ length: 100 }, () => ({ dns_names: ["x.big.com"] }))).status, "large");
});

test("rotating throwaway subdomains on a recruitment domain are flagged; a job board's own services are not", () => {
  // Recorded from Cert Spotter: the domain behind the fake MR DIY link (TurnBackHoax, 25 May 2026)
  const rotating = summarizeCertEntries("daftar-segera.site", [
    { dns_names: ["*.daftar-segera.site", "daftar-segera.site"], not_before: "2026-07-19" },
    ...["xa1", "xa2", "xa3", "w2", "w3", "w7", "h1", "h5", "h7", "x4"].map((name) => ({ dns_names: [`${name}.daftar-segera.site`] })),
  ]);
  const [signal] = certClusterSignals([rotating]);
  assert.equal(signal.label, "Domain memakai banyak alamat acak yang bergiliran");
  assert.equal(signal.floor, "sedang");

  const board = summarizeCertEntries("loker.id", [
    { dns_names: ["loker.id", "www.loker.id", "api.loker.id", "cdn.loker.id", "m.loker.id", "app.loker.id"] },
  ]);
  assert.deepEqual(certClusterSignals([board]), []);
});

test("a linked page keeps the addresses written in it and drops button links and images", () => {
  // Recorded from Tavily (markdown): an Interfell post on LinkedIn whose apply link is in a comment
  const page = pageText(
    [
      "🔗Interested? We'll leave the link to the vacancy in the comments!",
      "",
      "![text]()",
      "[Like](https://www.linkedin.com/signup/cold-join?trk=public_post_like-cta)",
      "[Interfell](https://www.linkedin.com/company/interfell?trk=public_post_comment_actor-name)",
      "APPLY HERE: [https://interfell.simera.io/jobs/10826](https://interfell.simera.io/jobs/10826?trk=public_post_comment-text)",
    ].join("\n")
  );
  assert.match(page, /APPLY HERE: https:\/\/interfell\.simera\.io\/jobs\/10826$/);
  assert.doesNotMatch(page, /signup|trk=|!\[/);
});

test("lnkd.in's warning page gives the outside address it stands for", () => {
  // Recorded from https://lnkd.in/gkjzzJ8E, the apply link in a LinkedIn post (25 Oct 2026)
  const html = `<h1 class="t-24 t-bold t-black mb2">This link will take you to a page that’s not on LinkedIn</h1>
    <a class="artdeco-button artdeco-button--tertiary" data-tracking-control-name="external_url_click" data-tracking-will-navigate href="https://forms.gle/e9AvwcP9MdMNwvXd6?a=1&amp;b=2">`;
  assert.equal(linkedinExternalLink(html), "https://forms.gle/e9AvwcP9MdMNwvXd6?a=1&b=2");
  assert.equal(linkedinExternalLink("<html>LinkedIn post</html>"), null);
});

test("a case is tied to the scam's own contacts and spreading accounts, not to where it is archived", () => {
  const identifiers = caseIdentifiers({
    postingText: "Daftar di rekrutmen-kpc.online atau WA 0812-3456-7890. Arsip: https://archive.ph/AbCdE",
    narrative: "Akun TikTok “infoloker378” pada Rabu (30/9/2026) mengunggah foto lowongan.",
    sourceLinks: ["https://www.tiktok.com/@infoloker378/photo/7691159662946782472", "https://www.facebook.com/photo/?fbid=1"],
  });
  assert.deepEqual(identifiers, [
    { kind: "phone", value: "6281234567890" },
    { kind: "domain", value: "rekrutmen-kpc.online" },
    { kind: "social", value: "infoloker378" },
  ]);
});

test("a posting sharing an account with debunked cases is lifted to sedang at most; similar cases are only context", () => {
  const card = { modus: ["impersonasi" as const], entitas: "PT Komatsu Indonesia", kanal: ["TikTok"], ciri: [], kutipan: "OPEN RECRUITMENT NEDP" };
  const debunked = { id: 37273, url: "https://turnbackhoax.id/articles/37273", title: "[PENIPUAN] Tautan Lowongan Kerja Komatsu Indonesia", published_at: "2026-10-22", card, identifiers: [] };
  const knowledge: KnowledgeResult = {
    status: "ok",
    identity: [
      { ...debunked, shared: [{ kind: "social", value: "infoloker378" }] },
      { ...debunked, id: 37236, card: { ...card, entitas: "PT Kaltim Prima Coal" }, published_at: "2026-10-17", shared: [] },
    ],
    similar: [{ ...debunked, id: 1, title: "[PENIPUAN] Lowongan Kerja PT Vale", score: 0.74 }],
    entities: [{ entity: "pt komatsu indonesia", count: 5, latest: "2026-10-22" }],
  };

  const [signal] = knowledgeSignals(knowledge);
  assert.deepEqual([signal.severity, signal.floor], ["moderate", "sedang"]);
  assert.match(signal.description, /akun “infoloker378” .*2 kasus .*Komatsu Indonesia, PT Kaltim Prima Coal/i);

  const sources = knowledgeSources(knowledge, 2);
  assert.deepEqual(sources.map((source) => source.id), ["S3", "S4"]);
  assert.match(sources[0].title, /identitas SAMA/);
  assert.match(sources[0].snippet, /Terhubung lewat identitas yang sama dengan 1 kasus lain \(PT Kaltim Prima Coal\)\..*dicatut 5 kali/);
  assert.match(sources[1].title, /mirip/);

  const [, check] = buildChecks({ signals: [], links: null, search: null, domainAges: [], knowledge });
  assert.equal(check.status, "warning");
  assert.match(check.detail, /akun “infoloker378” tercatat di 2 kasus .*terakhir 22 Okt 2026/);

  const onlySimilar = buildChecks({ signals: [], links: null, search: null, domainAges: [], knowledge: { ...knowledge, identity: [] } })[1];
  assert.equal(onlySimilar.status, "info");
  assert.deepEqual(knowledgeSignals({ ...knowledge, identity: [] }), []);
});

test("a Google Form's questions are read from the data the page embeds, and what they ask is named", () => {
  // Shape of FB_PUBLIC_LOAD_DATA_ on a public form (Oct 2026), trimmed to the fields the trail reads
  const html = `<script>var FB_PUBLIC_LOAD_DATA_ = [null,["Isi data dengan benar",[[1,"Nama Lengkap",null,0],[2,"NIK KTP",null,2],[3,"Nomor Telegram aktif",null,0],[4,"Kode verifikasi yang dikirim ke Telegram",null,0]],null,null,null,null,null,null,"Rekrutmen PT Contoh"],null,"Rekrutmen PT Contoh 2026"];</script>`;
  const form = parseGoogleForm(html)!;
  assert.equal(form.title, "Rekrutmen PT Contoh 2026");
  assert.deepEqual(form.fields, ["Nama Lengkap", "NIK KTP", "Nomor Telegram aktif", "Kode verifikasi yang dikirim ke Telegram"]);
  assert.deepEqual(asksOf(form.fields.join("\n")), ["nama", "KTP/NIK", "nomor Telegram", "kode verifikasi/OTP"]);
  assert.equal(parseGoogleForm("<html>Sign in</html>"), null);
});

test("chat links end the trail, and a page's Daftar buttons lead it on but the platform's own do not", () => {
  assert.equal(chatTitle("https://wa.me/6281234567890?text=daftar"), "WhatsApp 6281234567890");
  assert.equal(chatTitle("https://t.me/lokerbumn2026"), "Telegram @lokerbumn2026");
  assert.equal(chatTitle("https://example.com/daftar"), null);

  const markdown = [
    "[Agree & Join LinkedIn](https://www.linkedin.com/signup/cold-join)",
    "[DAFTAR SEKARANG](/form-pendaftaran)",
    "URL: [https://lnkd.in/gkjzzJ8E](https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Flnkd%2Ein%2FgkjzzJ8E)",
    "[Tentang kami](/about)",
    "[Chat admin](https://wa.me/6281234567890)",
  ].join("\n");
  assert.deepEqual(registrationLinks(markdown, "https://rekrut-kpc.site/info"), [
    "https://rekrut-kpc.site/form-pendaftaran",
    "https://lnkd.in/gkjzzJ8E",
    "https://wa.me/6281234567890",
  ]);
});

test("a form asking for a verification code sets a high floor, one asking for Telegram a medium one", () => {
  const links: LinkChecks = {
    shortlinks: [],
    page: null,
    trail: [
      { url: "https://rekrutmenbersamaskkmigas.piillly.com/daftar", from: null, outcome: "page", title: null, asks: [], fields: [] },
      { url: "https://docs.google.com/forms/d/e/x/viewform", from: null, outcome: "form", title: "Rekrutmen", asks: ["nama", "nomor Telegram", "kode verifikasi/OTP"], fields: ["Nama"] },
    ],
  };
  assert.deepEqual(trailSignals(links).map((signal) => [signal.id, signal.floor]), [
    ["form_secret", "tinggi"],
    ["form_telegram", "sedang"],
    ["throwaway_subdomain", "sedang"],
  ]);
  const [, form] = buildChecks({ signals: [], links, search: null, domainAges: [] }).slice(1);
  assert.equal(form.status, "warning");
  assert.match(form.detail, /Formulir "Rekrutmen" dengan 1 pertanyaan, meminta nama, nomor Telegram, kode verifikasi\/OTP/);

  // Recorded addresses from fact-checked scams, against real employers' own subdomains
  for (const host of ["rekrutmenbersamaskkmigasdankkks.piillly.com", "infolowonganbnn2024.iiaall.com", "openrecruitment-djpid.xindx.com"]) {
    assert.ok(isThrowawaySubdomain(host), host);
  }
  for (const host of ["recruitment.pertamina.com", "karir.bca.co.id", "rekrutmen.kimiafarma.co.id", "pertamina.com"]) {
    assert.ok(!isThrowawaySubdomain(host), host);
  }
});

test("a posting that hides its link asks the user for it", () => {
  const signals = detectSignals("Lowongan PT Contoh. Cek syarat lengkapnya di link bio profil!");
  const checks = buildChecks({ signals, links: { shortlinks: [], page: null, trail: [] }, search: null, domainAges: [] });
  assert.match(checks.find((check) => check.label === "Link pendaftaran")!.detail, /Salin link dari bio/);
});

test("a QR code on a poster is decoded to its address", async () => {
  const image = await QRCode.toBuffer("https://bit.ly/daftar-kpc-2026", { width: 600 });
  assert.equal(await decodeQr(image), "https://bit.ly/daftar-kpc-2026");
});
