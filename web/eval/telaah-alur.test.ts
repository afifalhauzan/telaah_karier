/**
 * Checks for TelaahAlur: the rules (lib/telaah-alur/rules.ts) fire on their pattern in each flow, the
 * fact catalog is consistent, and the chat offers the check only when the user is in a process.
 *
 *   pnpm test:unit
 */
import { describe, expect, it } from "vitest";
import { FACTS, OTHER, type AlurAnswers, type Flow } from "../lib/telaah-alur/questions";
import { evaluateAlur } from "../lib/telaah-alur/rules";
import { SAMPLE_STORIES } from "../lib/telaah-alur/samples";
import { detectAlurIntent } from "../lib/telaah-alur/trigger";

const ids = (jalur: Flow, answers: AlurAnswers) => evaluateAlur({ jalur, ...answers }).findings.map((finding) => finding.id);

describe("rules: work abroad", () => {
  it("flags a visit visa, and asks to confirm an unknown or other one", () => {
    expect(ids("migran", { visa: "kunjungan" })).toContain("visa_kunjungan");
    expect(ids("migran", { visa: "ziarah" })).toContain("visa_kunjungan");
    expect(ids("migran", { visa: "belum_tahu" })).toContain("visa_belum_jelas");
    expect(ids("migran", { visa: OTHER })).toContain("visa_belum_jelas");
    expect(ids("migran", { visa: "kerja" })).not.toContain("visa_kunjungan");
  });

  it("flags domestic work in the Middle East and computer jobs in online-scam hubs", () => {
    expect(ids("migran", { pekerjaan: "art", negara: "arab_saudi" })).toContain("domestik_timur_tengah");
    expect(ids("migran", { pekerjaan: "art", negara: "taiwan" })).not.toContain("domestik_timur_tengah");
    expect(ids("migran", { pekerjaan: "online", negara: "kamboja" })).toContain("pusat_online_scam");
    expect(ids("migran", { pekerjaan: "online", negara: "jepang" })).not.toContain("pusat_online_scam");
  });

  it("treats fees for exempt jobs as a violation, other fees as to confirm, and a salary deduction once", () => {
    expect(ids("migran", { pekerjaan: "art", biaya: ["pelatihan"] })).toContain("biaya_dibebaskan");
    expect(ids("migran", { pekerjaan: "pabrik", biaya: ["pelatihan"] })).toContain("biaya_lain");
    expect(ids("migran", { pekerjaan: "online", biaya: ["potong_gaji"] })).toEqual(["potong_gaji"]);
    expect(ids("migran", { pekerjaan: "art", biaya: ["tidak_ada"] })).toEqual([]);
  });

  it("sends a named agency to the official register instead of judging it", () => {
    const result = evaluateAlur({ jalur: "migran", perekrut: "p3mi", nama_perekrut: "PT Contoh Jaya" });
    expect(result.findings[0]).toMatchObject({ id: "cek_p3mi", severity: "pastikan", title: "Pastikan PT Contoh Jaya terdaftar sebagai P3MI" });
    expect(ids("migran", { perekrut: "medsos" })).toContain("perekrut_tidak_resmi");
  });

  it("an oral-only agreement abroad is a violation; elsewhere it is to be confirmed", () => {
    const severity = (jalur: Flow, perjanjian: string) =>
      evaluateAlur({ jalur, perjanjian }).findings.find((finding) => finding.id === "tanpa_perjanjian")?.severity;
    expect(severity("migran", "lisan")).toBe("bahaya");
    expect(severity("migran", "belum_tahu")).toBe("pastikan");
    expect(severity("domestik", "lisan")).toBe("pastikan");
    expect(severity("migran", "tertulis")).toBeUndefined();
  });
});

describe("rules: other flows", () => {
  it("domestic: held documents, confinement, a changed job, and plantation work far away", () => {
    expect(ids("domestik", { dokumen_ditahan: "ya", penampungan: "ya", beda_pekerjaan: "ya", pekerjaan: "perkebunan" })).toEqual(
      expect.arrayContaining(["dokumen_ditahan", "penampungan", "beda_pekerjaan", "pindah_pulau"])
    );
    expect(ids("lokal", { pekerjaan: "perkebunan" })).not.toContain("pindah_pulau");
    expect(ids("domestik", { dokumen_ditahan: "tidak", penampungan: "belum_tahu" })).toEqual([]);
  });

  it("remote: deposits, OTP and lent accounts are violations; a selfie with KTP is to confirm", () => {
    expect(ids("remote", { biaya: ["deposit"] })).toContain("deposit_tugas");
    expect(ids("remote", { data_pribadi: ["otp"] })).toContain("otp_akun");
    expect(ids("remote", { rekening_dipakai: "ya" })).toContain("rekening_dipakai");
    expect(evaluateAlur({ jalur: "remote", data_pribadi: ["selfie_ktp"] }).status).toBe("pastikan");
    expect(evaluateAlur({ jalur: "remote" }).contacts.map((contact) => contact.id)).toEqual(["cekrekening"]);
  });

  it("internship: abroad it is checked as placement, at home it is not", () => {
    const abroad = evaluateAlur({ jalur: "magang", negara: "jerman", perekrut: "kampus" });
    expect(abroad.findings.map((finding) => finding.id)).toContain("magang_luar_negeri");
    expect(abroad.contacts.map((contact) => contact.id)).toContain("safetravel");
    expect(ids("magang", { negara: "indonesia" })).toEqual([]);
    expect(ids("magang", { negara: "jepang", perekrut: "agen" })).toContain("cek_lpk");
  });

  it("someone who cannot leave gets the emergency contacts first", () => {
    const result = evaluateAlur({ jalur: "migran", tahap: "terjebak" });
    expect(result.status).toBe("pelanggaran");
    expect(result.findings[0].id).toBe("terjebak");
    expect(result.contacts[0].id).toBe("safetravel");
  });

  it("the sample stories show violations in every flow they cover", () => {
    for (const [flow, sample] of Object.entries(SAMPLE_STORIES)) {
      const answers = Object.fromEntries(Object.entries(sample!.facts).map(([id, fact]) => [id, fact.value]));
      expect(evaluateAlur({ jalur: flow, ...answers }).status, flow).toBe("pelanggaran");
    }
  });
});

describe("result", () => {
  it("never says safe: no findings means nothing found so far", () => {
    const result = evaluateAlur({ jalur: "migran", visa: "kerja", perekrut: "pemerintah", perjanjian: "tertulis", biaya: ["tidak_ada"] });
    expect(result.status).toBe("belum_ditemukan");
    expect(result.contacts.map((contact) => contact.id)).toEqual(["siskop2mi", "safetravel"]);
  });
});

describe("fact catalog", () => {
  it("per-flow options stay within each fact's flows", () => {
    for (const fact of FACTS) {
      for (const option of fact.options ?? []) {
        for (const flow of option.flows ?? []) expect(fact.flows, `${fact.id}.${option.value}`).toContain(flow);
      }
    }
  });
});

describe("offering the check in the chat", () => {
  it("offers it to someone already in a process, with what the message says", () => {
    const intent = detectAlurIntent("Saya sudah transfer 2 juta ke sponsor buat kerja di Malaysia, besok mau berangkat");
    expect(intent?.readFacts.jalur).toEqual({ value: "migran", quote: "Malaysia" });
    expect(intent?.readFacts.tahap?.value).toBe("sudah_bayar");
    expect(intent?.readFacts.negara?.value).toBe("malaysia");
    expect(detectAlurIntent("aku sudah daftar kerja di Dubai")?.readFacts.negara?.value).toBe("uea");
  });

  it("offers it to someone who cannot leave, however it is worded", () => {
    expect(detectAlurIntent("tolong hp disita dan tidak bisa pulang")?.readFacts.tahap?.value).toBe("terjebak");
  });

  it("stays quiet for a posting or a general question", () => {
    expect(detectAlurIntent("Dibutuhkan admin, pelamar diminta membawa KTP dan ijazah saat interview")).toBeNull();
    expect(detectAlurIntent("Apa ciri lowongan palsu?")).toBeNull();
    expect(detectAlurIntent("")).toBeNull();
  });

  it("reads remote work and internships as their own flows", () => {
    expect(detectAlurIntent("aku udah daftar kerja part time online, disuruh top up")?.readFacts.jalur?.value).toBe("remote");
    expect(detectAlurIntent("saya sudah daftar magang ke Jerman lewat kampus")?.readFacts.jalur?.value).toBe("magang");
  });
});
