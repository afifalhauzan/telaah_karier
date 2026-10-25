/**
 * Checks for the evidence gathered before the analysis and the checklist shown under the verdict
 * (langchain/agents/analyzer/checks.ts, tools/domain-age.ts, tools/ct-cluster.ts). No network: results are given.
 *
 *   pnpm test:web-checks
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChecks, certClusterSignals, newDomainSignals } from "../langchain/agents/analyzer/checks";
import { summarizeCertEntries } from "../langchain/agents/analyzer/tools/ct-cluster";
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
    },
    search,
    domainAges: [],
    now: NOW,
  });

  assert.deepEqual(
    checks.map((check) => [check.label, check.status]),
    [
      ["Pola penipuan umum", "warning"],
      ["Shortlink bit.ly/daftar-ids", "info"],
      ["Shortlink s.id/hilang", "warning"],
      ["Isi halaman link", "info"],
      ["Jejak di web", "ok"],
    ]
  );
  assert.match(checks[4].detail, /2 di antaranya dari situs idstar\.co\.id/);
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