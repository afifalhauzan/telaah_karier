/**
 * Checks for what the web search verifies (langchain/agents/analyzer/tools/tavily-search.ts).
 *
 *   pnpm test:search-query
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { preprocessJobInput } from "../langchain/agents/analyzer/preprocessor";
import { buildVerificationQuery, mentionsEntity, stripSourceIds } from "../langchain/agents/analyzer/tools/tavily-search";

const queryFor = (text: string) => buildVerificationQuery(preprocessJobInput(text))?.query ?? null;

test("a bare site on a poster is searched even without PT/CV", () => {
  assert.equal(queryFor("IDstar is hiring! APPLY NOW See Details idstar.co.id. Email hello@idstar.group"), "idstar.co.id");
});

test("an employer email domain is searched when no site is given", () => {
  assert.equal(queryFor("Kirim CV ke recruitment@sumbermakmur.co.id"), "sumbermakmur.co.id");
});

test("free mail, shortlinks, and abbreviations are not searched", () => {
  assert.equal(queryFor("Lulusan S.Kom, datang ke Jl.Mawar 12, kirim CV ke hrd.toko@gmail.com atau bit.ly/daftar"), null);
});

test("a legal company name still comes first, and the posting's site is searched alongside it", () => {
  const target = buildVerificationQuery(preprocessJobInput("PT Sukses Makmur Sentosa membuka lowongan. Info: karir.suksesmakmur.co.id"));
  assert.equal(target?.query, '"PT Sukses Makmur Sentosa" lowongan kerja');
  assert.equal(target?.siteDomain, "karir.suksesmakmur.co.id");
});

test("a site without the company's name, such as a job blog, is not searched as the company's site", () => {
  const target = buildVerificationQuery(preprocessJobInput("PT Nutrifood Indonesia membuka lowongan. Daftar di lokerblog.com/nutrifood"));
  assert.equal(target?.query, '"PT Nutrifood Indonesia" lowongan kerja');
  assert.equal(target?.siteDomain, undefined);
});

test("source IDs written into the text are removed, a degree in parentheses is not", () => {
  assert.equal(stripSourceIds("Jejak digitalnya jelas di LinkedIn dan Glints (S1, S2, S3)."), "Jejak digitalnya jelas di LinkedIn dan Glints.");
  assert.equal(stripSourceIds("Perusahaan terdaftar [S1] dan aktif [S2, S4]."), "Perusahaan terdaftar dan aktif.");
  assert.equal(stripSourceIds("Syarat: minimal Sarjana (S1) jurusan informatika."), "Syarat: minimal Sarjana (S1) jurusan informatika.");
});

test("job boards are not taken for the employer's site", () => {
  assert.equal(queryFor("Lowongan Data Analyst https://www.jobstreet.co.id/id/job/123 dan glints.com/id/opportunities/jobs/x"), null);
});

test("a company abroad names its legal form after the name, and its own site matches it", () => {
  // From a LinkedIn post by a BLOOMTECH recruiter (25 Oct 2026); the name sits on its own line
  const target = buildVerificationQuery(
    preprocessJobInput("Mari Shimizu\nBLOOMTECH, Inc. | IT Engineer Career Advisor\nJob Opportunity【Fully Remote / Data Scientist】")
  );
  assert.equal(target?.query, '"BLOOMTECH Inc" lowongan kerja');
  assert.equal(queryFor("Hiring now at Maju Jaya Sdn Bhd, Kuala Lumpur"), '"Maju Jaya Sdn Bhd" lowongan kerja');

  const entity = target!.entity;
  const source = (url: string, title: string) => ({ id: "S1", url, title, snippet: "" });
  assert.ok(mentionsEntity(source("https://www.linkedin.com/company/bloomtech-inc", "BloomTech Inc"), entity));
  assert.ok(mentionsEntity(source("https://bloomtech.co.jp", "株式会社ブルームテック"), entity));
  assert.ok(!mentionsEntity(source("https://example.com/jobs", "Remote Data Scientist jobs in Japan"), entity));
});
