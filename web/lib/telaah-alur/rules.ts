import { OTHER, UNKNOWN, flowOf, type AlurAnswers, type Flow } from "./questions";

// The judgment of TelaahAlur: fixed rules over the confirmed answers, so the same answers always give
// the same findings and each finding names its basis. No model decides anything here.

export type Severity = "bahaya" | "pastikan" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  explanation: string;
  basis: string;
  contacts: ContactId[];
}

export type AlurStatus = "pelanggaran" | "pastikan" | "belum_ditemukan";

export interface AlurResult {
  status: AlurStatus;
  findings: Finding[];
  contacts: Contact[];
  safeSteps: string[];
}

export type ContactId = "kp2mi" | "siskop2mi" | "sapa129" | "polri" | "safetravel" | "disnaker" | "iasc" | "cekrekening";

export interface Contact {
  id: ContactId;
  name: string;
  description: string;
  actions: Array<{ label: string; href: string }>;
}

// shortcut: numbers and links checked against official pages and news on 24 Oct 2026; recheck before
// each release.
export const CONTACTS: Record<ContactId, Contact> = {
  kp2mi: {
    id: "kp2mi",
    name: "KP2MI (Kementerian Pelindungan Pekerja Migran)",
    description: "Pengaduan penempatan kerja ke luar negeri, termasuk agen dan calo.",
    actions: [
      { label: "Telepon 0800-1000", href: "tel:08001000" },
      { label: "WhatsApp 0811-8080-141", href: "https://wa.me/628118080141" },
    ],
  },
  siskop2mi: {
    id: "siskop2mi",
    name: "SISKOP2MI",
    description: "Cek apakah perusahaan penempatan (P3MI) terdaftar dan tidak sedang dikenai sanksi.",
    actions: [{ label: "Buka SISKOP2MI", href: "https://siskop2mi.bp2mi.go.id/publik" }],
  },
  sapa129: {
    id: "sapa129",
    name: "SAPA 129 (KemenPPPA)",
    description: "Pengaduan untuk perempuan dan anak, termasuk perdagangan orang.",
    actions: [
      { label: "Telepon 129", href: "tel:129" },
      { label: "WhatsApp 08111-129-129", href: "https://wa.me/628111129129" },
    ],
  },
  polri: {
    id: "polri",
    name: "Polisi",
    description: "Jika ada ancaman, penahanan, atau kamu tidak bisa pergi.",
    actions: [{ label: "Telepon 110", href: "tel:110" }],
  },
  safetravel: {
    id: "safetravel",
    name: "Safe Travel Kemlu",
    description: "Kontak darurat KBRI di negara tujuan, dan lapor diri sebelum berangkat.",
    actions: [{ label: "Buka Safe Travel", href: "https://safetravel.kemlu.go.id" }],
  },
  disnaker: {
    id: "disnaker",
    name: "Dinas Ketenagakerjaan setempat",
    description: "Pengaduan perekrutan dan hubungan kerja di dalam negeri, di kabupaten atau kota asalmu.",
    actions: [],
  },
  iasc: {
    id: "iasc",
    name: "Indonesia Anti-Scam Centre (OJK)",
    description: "Lapor penipuan yang melibatkan transfer uang, agar rekening pelaku bisa segera diblokir.",
    actions: [{ label: "Buka IASC", href: "https://iasc.ojk.go.id" }],
  },
  cekrekening: {
    id: "cekrekening",
    name: "CekRekening.id (Komdigi)",
    description: "Cek apakah rekening atau e-wallet yang diberikan perekrut pernah dilaporkan sebagai penipuan.",
    actions: [{ label: "Buka CekRekening.id", href: "https://cekrekening.id" }],
  },
};

// shortcut: domestic-sector halt per Kepmenaker 260/2015, still in force per KP2MI (Jan 2026); the
// full country list (15 or 19 by source) is not verified yet, so only the clear cases are listed.
const MIDDLE_EAST_DOMESTIC_HALT = new Set(["arab_saudi", "uea", "qatar", "kuwait", "oman", "bahrain", "yordania"]);
const ONLINE_SCAM_HUBS = new Set(["kamboja", "myanmar", "laos", "filipina"]);
// Jobs whose placement costs workers may not be charged (Perban BP2MI 9/2020; list from secondary sources)
const FEE_EXEMPT_JOBS = new Set(["art", "abk", "perkebunan"]);

const PENDING_BASIS = "Dasar hukum sedang diverifikasi.";

const has = (answers: AlurAnswers, id: string, value: string) => {
  const answer = answers[id];
  return Array.isArray(answer) ? answer.includes(value) : answer === value;
};

const paidCosts = (answers: AlurAnswers) => {
  const costs = Array.isArray(answers.biaya) ? answers.biaya : [];
  // OTHER stays in: a fee the user names in their own words is still a fee
  return costs.filter((cost) => cost !== "tidak_ada" && cost !== UNKNOWN);
};

/** Going to another country: every migrant flow, and an internship outside Indonesia. */
const isAbroad = (flow: Flow, answers: AlurAnswers) =>
  flow === "migran" || (flow === "magang" && typeof answers.negara === "string" && answers.negara !== "indonesia");

const authorityFor = (flow: Flow, answers: AlurAnswers): ContactId =>
  isAbroad(flow, answers) ? "kp2mi" : flow === "remote" ? "iasc" : "disnaker";

function abroadFindings(flow: Flow, answers: AlurAnswers): Finding[] {
  const findings: Finding[] = [];

  if (has(answers, "visa", "kunjungan") || has(answers, "visa", "ziarah")) {
    findings.push({
      id: "visa_kunjungan",
      severity: "bahaya",
      title: "Berangkat dengan visa kunjungan atau ziarah",
      explanation: "Bekerja di luar negeri wajib memakai visa kerja. Visa kunjungan adalah pola utama keberangkatan nonprosedural dan kasus TPPO.",
      basis: "UU 18/2017 Pasal 13 (dokumen wajib meliputi visa kerja)",
      contacts: ["kp2mi", "polri"],
    });
  } else if (has(answers, "visa", UNKNOWN) || has(answers, "visa", OTHER)) {
    findings.push({
      id: "visa_belum_jelas",
      severity: "pastikan",
      title: "Jenis visa belum jelas",
      explanation: "Tanyakan jenis visanya. Untuk bekerja, yang sah hanya visa kerja; untuk magang, visa magang atau pelajar.",
      basis: "UU 18/2017 Pasal 13",
      contacts: ["kp2mi"],
    });
  }

  if (has(answers, "dokumen_ditahan", "ya")) {
    findings.push({
      id: "paspor_ditahan",
      severity: "bahaya",
      title: "Paspor atau dokumen asli akan dipegang orang lain",
      explanation: "Pekerja berhak memegang sendiri dokumen perjalanannya. Paspor yang ditahan adalah salah satu tanda kerja paksa.",
      basis: "UU 18/2017 Pasal 6 ayat (1) huruf j; indikator kerja paksa ILO",
      contacts: ["kp2mi", "polri"],
    });
  }

  if (has(answers, "bohong_imigrasi", "ya")) {
    findings.push({
      id: "bohong_imigrasi",
      severity: "bahaya",
      title: "Diminta mengaku berwisata",
      explanation: "Diminta berbohong kepada petugas imigrasi berarti keberangkatan ini sengaja dibuat tidak tercatat sebagai kerja.",
      basis: "Pola keberangkatan nonprosedural yang ditunda Imigrasi",
      contacts: ["kp2mi", "polri"],
    });
  }

  if (has(answers, "transit", "ya")) {
    findings.push({
      id: "transit",
      severity: "pastikan",
      title: "Berangkat lewat negara transit",
      explanation: "Rute lewat negara ketiga sering dipakai untuk menyamarkan tujuan sebenarnya. Pastikan tujuan akhir dan tiketnya tertulis jelas.",
      basis: "Pola rute kasus online scam",
      contacts: ["safetravel"],
    });
  }

  if (flow === "magang") {
    if (!has(answers, "perekrut", "pemerintah")) {
      findings.push({
        id: "magang_luar_negeri",
        severity: "pastikan",
        title: "Magang ke luar negeri: pastikan statusnya",
        explanation:
          "Pastikan programnya benar-benar magang yang sesuai jurusan, bukan kerja kasar berkedok magang. Penyelenggara yang menempatkan orang bekerja di luar negeri harus terdaftar sebagai P3MI, meskipun programnya lewat kampus.",
        basis: "Kasus Ferienjob Jerman 2024: lebih dari seribu mahasiswa dipekerjakan sebagai buruh; penyelenggaranya tidak terdaftar sebagai P3MI (Bareskrim, Kemnaker)",
        contacts: ["kp2mi", "siskop2mi"],
      });
    }
    return findings;
  }

  if (has(answers, "perekrut", "calo") || has(answers, "perekrut", "kenalan") || has(answers, "perekrut", "medsos")) {
    findings.push({
      id: "perekrut_tidak_resmi",
      severity: "bahaya",
      title: "Perekrut bukan jalur resmi",
      explanation:
        "Penempatan resmi hanya lewat perusahaan penempatan berizin (P3MI), program pemerintah, atau mendaftar sendiri sesuai prosedur. Perorangan, sponsor, atau kenalan tidak boleh menempatkan pekerja.",
      basis: "UU 18/2017 tentang Pelindungan Pekerja Migran Indonesia",
      contacts: ["kp2mi", "siskop2mi"],
    });
  } else if (has(answers, "perekrut", "p3mi") || has(answers, "perekrut", "agen")) {
    findings.push({
      id: "cek_p3mi",
      severity: "pastikan",
      title: answers.nama_perekrut ? `Pastikan ${answers.nama_perekrut} terdaftar sebagai P3MI` : "Pastikan perusahaan penempatannya terdaftar",
      explanation:
        "Hanya perusahaan penempatan (P3MI) yang boleh menempatkan pekerja ke luar negeri. Cek namanya di SISKOP2MI: harus terdaftar dan tidak sedang dikenai sanksi. Waspadai nama yang mirip.",
      basis: "Daftar P3MI resmi di SISKOP2MI (KP2MI)",
      contacts: ["siskop2mi"],
    });
  }

  if (has(answers, "pekerjaan", "art") && MIDDLE_EAST_DOMESTIC_HALT.has(String(answers.negara))) {
    findings.push({
      id: "domestik_timur_tengah",
      severity: "bahaya",
      title: "Penempatan ART ke Timur Tengah sedang dihentikan",
      explanation: "Penempatan pekerja sektor rumah tangga ke negara-negara Timur Tengah dihentikan sejak 2015. Tawaran seperti ini pasti tidak lewat jalur resmi.",
      basis: "Kepmenaker 260/2015; menurut KP2MI masih berlaku per Januari 2026",
      contacts: ["kp2mi"],
    });
  }

  if (has(answers, "pekerjaan", "online") && ONLINE_SCAM_HUBS.has(String(answers.negara))) {
    findings.push({
      id: "pusat_online_scam",
      severity: "bahaya",
      title: "Pola online scam",
      explanation:
        "Tawaran operator komputer atau CS di negara ini adalah pola utama kasus WNI yang dipaksa bekerja di perusahaan penipuan online. Kemlu mencatat ribuan kasus sejak 2021, terbanyak di Kamboja dan Myanmar.",
      basis: "Data Kemlu tentang kasus online scam WNI 2021–2025",
      contacts: ["kp2mi", "safetravel", "polri"],
    });
  }

  const costs = paidCosts(answers);
  if (costs.length && FEE_EXEMPT_JOBS.has(String(answers.pekerjaan))) {
    findings.push({
      id: "biaya_dibebaskan",
      severity: "bahaya",
      title: "Diminta biaya untuk pekerjaan yang dibebaskan biayanya",
      explanation: "Untuk pekerjaan ini, biaya penempatan seperti tiket, visa, pelatihan, dan tes kesehatan tidak boleh dibebankan kepada pekerja.",
      basis: "UU 18/2017 Pasal 30; Peraturan BP2MI 9/2020",
      contacts: ["kp2mi"],
    });
  } else if (costs.some((cost) => cost !== "potong_gaji")) {
    // a salary deduction alone already has its own finding (potong_gaji)
    findings.push({
      id: "biaya_lain",
      severity: "pastikan",
      title: "Ada biaya yang diminta darimu",
      explanation: "Minta rincian biaya tertulis dan cocokkan dengan struktur biaya resmi. Jangan membayar ke rekening pribadi.",
      basis: "UU 18/2017 Pasal 30",
      contacts: ["kp2mi"],
    });
  }

  return findings;
}

function domesticFindings(flow: Flow, answers: AlurAnswers): Finding[] {
  const findings: Finding[] = [];

  if (flow !== "magang" && paidCosts(answers).some((cost) => cost !== "potong_gaji")) {
    findings.push({
      id: "biaya_pelamar",
      severity: "bahaya",
      title: "Diminta biaya untuk bisa bekerja",
      explanation: "Perekrutan yang meminta uang dari pelamar adalah pola penipuan dan jeratan utang yang paling sering.",
      basis: `Prinsip rekrutmen adil ILO (pekerja tidak dibebani biaya). ${PENDING_BASIS}`,
      contacts: ["disnaker"],
    });
  }

  if (has(answers, "dokumen_ditahan", "ya")) {
    findings.push({
      id: "dokumen_ditahan",
      severity: "bahaya",
      title: "Ijazah atau KTP asli akan ditahan",
      explanation: "Dokumen asli yang ditahan membuatmu sulit keluar dari pekerjaan. Serahkan salinan, bukan dokumen asli.",
      basis: `Indikator kerja paksa ILO (penahanan dokumen). ${PENDING_BASIS}`,
      contacts: ["disnaker", "polri"],
    });
  }

  if (has(answers, "perekrut", "calo")) {
    findings.push({
      id: "perekrut_calo",
      severity: "pastikan",
      title: "Perekrut perorangan atau calo",
      explanation: "Minta nama perusahaan pemberi kerja yang sebenarnya dan alamat kantornya, lalu pastikan perusahaan itu ada.",
      basis: PENDING_BASIS,
      contacts: ["disnaker"],
    });
  }

  if (flow === "domestik" && (has(answers, "pekerjaan", "perkebunan") || has(answers, "pekerjaan", "abk"))) {
    findings.push({
      id: "pindah_pulau",
      severity: "pastikan",
      title: "Dibawa ke daerah lain untuk kerja perkebunan atau kapal",
      explanation: "Pola ini muncul di sejumlah kasus perdagangan orang dalam negeri. Pastikan perusahaan, lokasi, dan perjanjiannya jelas sebelum berangkat.",
      basis: "Pola kasus TPPO dalam negeri",
      contacts: ["disnaker"],
    });
  }

  return findings;
}

function remoteFindings(answers: AlurAnswers): Finding[] {
  const findings: Finding[] = [];

  if (has(answers, "biaya", "deposit")) {
    findings.push({
      id: "deposit_tugas",
      severity: "bahaya",
      title: "Diminta deposit untuk membuka tugas",
      explanation:
        "Pekerjaan sungguhan membayarmu, bukan memintamu membayar. Deposit atau top-up untuk membuka tugas adalah pola utama penipuan berkedok kerja online: uangnya tidak kembali.",
      basis: "Pola penipuan yang dilaporkan ke Indonesia Anti-Scam Centre (OJK)",
      contacts: ["iasc", "cekrekening", "polri"],
    });
  } else if (paidCosts(answers).length) {
    findings.push({
      id: "biaya_pelamar",
      severity: "bahaya",
      title: "Diminta biaya untuk bisa bekerja",
      explanation: "Perekrutan yang meminta uang dari pelamar adalah pola penipuan yang paling sering.",
      basis: "Prinsip rekrutmen adil ILO (pekerja tidak dibebani biaya)",
      contacts: ["iasc", "cekrekening"],
    });
  }

  if (has(answers, "data_pribadi", "otp") || has(answers, "data_pribadi", "akun_bank")) {
    findings.push({
      id: "otp_akun",
      severity: "bahaya",
      title: "Diminta kode OTP, PIN, atau akses akun bank",
      explanation: "Kode OTP dan akses m-banking tidak pernah dibutuhkan untuk bekerja. Siapa pun yang memegangnya bisa menguras rekeningmu atau memakainya atas namamu.",
      basis: "Imbauan OJK: kode OTP dan PIN tidak boleh diberikan kepada siapa pun",
      contacts: ["iasc", "polri"],
    });
  }

  if (has(answers, "data_pribadi", "selfie_ktp")) {
    findings.push({
      id: "selfie_ktp",
      severity: "pastikan",
      title: "Diminta selfie sambil memegang KTP",
      explanation: "Foto ini bisa dipakai untuk mengajukan pinjaman online atau membuka akun atas namamu. Jangan kirim sebelum perusahaannya terbukti nyata.",
      basis: PENDING_BASIS,
      contacts: ["iasc"],
    });
  }

  if (has(answers, "pekerjaan", "tugas_online")) {
    findings.push({
      id: "tugas_online",
      severity: "pastikan",
      title: "Pekerjaan berupa tugas like, rating, atau klik",
      explanation: "Tugas seperti ini biasanya dibayar kecil di awal untuk membangun kepercayaan, lalu berujung permintaan deposit. Waspadai jika diminta transfer dalam bentuk apa pun.",
      basis: "Pola penipuan yang dilaporkan ke Indonesia Anti-Scam Centre (OJK)",
      contacts: ["iasc"],
    });
  }

  if (has(answers, "bayaran_tidak_wajar", "ya")) {
    findings.push({
      id: "bayaran_tidak_wajar",
      severity: "pastikan",
      title: "Bayaran tidak sebanding dengan tugasnya",
      explanation: "Imbalan besar untuk tugas yang sangat ringan adalah umpan umum. Cari tahu perusahaan di baliknya sebelum melanjutkan.",
      basis: "Pola penipuan berkedok kerja online",
      contacts: ["iasc"],
    });
  }

  return findings;
}

function commonFindings(flow: Flow, answers: AlurAnswers): Finding[] {
  const findings: Finding[] = [];
  const authority = authorityFor(flow, answers);
  const abroad = isAbroad(flow, answers);

  if (has(answers, "tahap", "terjebak")) {
    findings.push({
      id: "terjebak",
      severity: "bahaya",
      title: "Kamu perlu bantuan sekarang",
      explanation: "Tidak boleh pergi dari tempat kerja adalah tanda kerja paksa. Hubungi pihak di bawah sekarang, atau minta keluarga menghubunginya untukmu.",
      basis: "Indikator kerja paksa ILO (pembatasan gerak); UU 21/2007 tentang Pemberantasan TPPO",
      contacts: abroad ? ["safetravel", "kp2mi", "polri", "sapa129"] : ["polri", "sapa129"],
    });
  }

  if (has(answers, "rekening_dipakai", "ya")) {
    findings.push({
      id: "rekening_dipakai",
      severity: "bahaya",
      title: "Rekeningmu diminta untuk dipakai menerima uang",
      explanation:
        "Rekening yang dipinjam biasanya dipakai menampung uang hasil penipuan. Pemilik rekening bisa ikut diperiksa polisi dan rekeningnya diblokir.",
      basis: "Pola rekening penampung (money mule) yang diblokir lewat Indonesia Anti-Scam Centre (OJK)",
      contacts: ["iasc", "polri"],
    });
  }

  if (has(answers, "biaya", "potong_gaji")) {
    findings.push({
      id: "potong_gaji",
      severity: "bahaya",
      title: "Biaya dibayar nanti lewat potong gaji atau dana talangan",
      explanation: "Utang yang dibayar dari gaji membuatmu tidak bisa berhenti bekerja sampai utangnya lunas.",
      basis: "Indikator kerja paksa ILO (jeratan utang)",
      contacts: [authority],
    });
  }

  if (flow === "magang" && has(answers, "perekrut", "agen")) {
    findings.push({
      id: "cek_lpk",
      severity: "pastikan",
      title: "Pastikan LPK atau agennya berizin",
      explanation: "Minta nomor izin lembaganya dan cocokkan ke Dinas Ketenagakerjaan. Jangan membayar sebelum izinnya jelas.",
      basis: PENDING_BASIS,
      contacts: ["disnaker"],
    });
  }

  if (flow === "magang" && paidCosts(answers).some((cost) => cost !== "potong_gaji")) {
    findings.push({
      id: "biaya_program",
      severity: "pastikan",
      title: "Ada biaya program yang diminta",
      explanation: "Minta rincian biaya tertulis dan tanyakan ke kampus atau lembaga resmi apakah biaya itu wajar. Jangan membayar ke rekening pribadi.",
      basis: PENDING_BASIS,
      contacts: [authority],
    });
  }

  if (has(answers, "penampungan", "ya")) {
    findings.push({
      id: "penampungan",
      severity: "bahaya",
      title: "Ditampung, tidak boleh keluar, atau HP disita",
      explanation: "Membatasi gerak dan komunikasi adalah ciri perdagangan orang.",
      basis: "UU 21/2007 tentang Pemberantasan TPPO; indikator kerja paksa ILO (isolasi)",
      contacts: ["polri", "sapa129"],
    });
  }

  if (has(answers, "beda_pekerjaan", "ya")) {
    findings.push({
      id: "beda_pekerjaan",
      severity: "bahaya",
      title: "Pekerjaan berbeda dari yang dijanjikan",
      explanation: "Menjanjikan satu pekerjaan atau magang lalu memindahkan ke pekerjaan lain adalah bentuk penipuan dalam perekrutan.",
      basis: "UU 21/2007 tentang Pemberantasan TPPO; indikator kerja paksa ILO (penipuan)",
      contacts: ["polri", authority],
    });
  }

  if (has(answers, "perjanjian", "lisan") || has(answers, "perjanjian", UNKNOWN) || has(answers, "perjanjian", OTHER)) {
    findings.push({
      id: "tanpa_perjanjian",
      // Abroad, going without a written agreement breaks the procedure; not knowing yet is to be confirmed
      severity: flow === "migran" && has(answers, "perjanjian", "lisan") ? "bahaya" : "pastikan",
      title: "Belum ada perjanjian kerja tertulis",
      explanation: "Minta perjanjian kerja tertulis yang memuat gaji, jam kerja, pemberi kerja, dan lama kontrak sebelum berangkat.",
      basis: flow === "migran" ? "UU 18/2017 Pasal 13 huruf h dan Pasal 15" : PENDING_BASIS,
      contacts: [authority],
    });
  }

  if (has(answers, "rahasia", "ya")) {
    findings.push({
      id: "dirahasiakan",
      severity: "bahaya",
      title: "Diminta merahasiakan dari keluarga",
      explanation: "Perekrut resmi tidak punya alasan memintamu merahasiakan pekerjaan. Ini cara memutus orang dari keluarganya.",
      basis: "Indikator kerja paksa ILO (isolasi)",
      contacts: ["polri"],
    });
  }

  if (has(answers, "jodoh", "ya")) {
    findings.push({
      id: "jodoh",
      severity: "bahaya",
      title: "Tawaran jodoh atau pernikahan",
      explanation: "Tawaran pernikahan yang dikaitkan dengan pekerjaan atau uang adalah pola perdagangan orang lewat pengantin pesanan.",
      basis: "UU 21/2007 tentang Pemberantasan TPPO",
      contacts: ["sapa129", "polri"],
    });
  }

  if (has(answers, "usia", "anak")) {
    findings.push({
      id: "di_bawah_umur",
      severity: "bahaya",
      title: "Calon pekerja di bawah 18 tahun",
      explanation:
        flow === "migran"
          ? "Pekerja migran minimal berusia 18 tahun. Perekrutan anak untuk bekerja ke luar negeri tidak pernah lewat jalur resmi."
          : "Anak di bawah 18 tahun dilindungi dari pekerjaan berat dan berbahaya. Libatkan orang tua atau wali sebelum melanjutkan.",
      basis: flow === "migran" ? "UU 18/2017 Pasal 5" : PENDING_BASIS,
      contacts: ["sapa129"],
    });
  }

  return findings;
}

const SAFE_STEPS = {
  luar: [
    "Jangan serahkan paspor, KTP, atau ijazah asli kepada perekrut.",
    "Jangan membayar atau mentransfer apa pun sebelum jalurnya terbukti resmi.",
    "Simpan semua bukti: chat, nomor, nama, dan bukti transfer.",
    "Beri tahu keluarga dengan siapa kamu berangkat, ke negara mana, dan alamat tempat kerjanya.",
    "Lapor diri lewat Safe Travel Kemlu sebelum berangkat.",
  ],
  dalam: [
    "Jangan serahkan ijazah atau KTP asli; berikan salinannya saja.",
    "Jangan membayar atau mentransfer apa pun untuk bisa diterima bekerja.",
    "Simpan semua bukti: chat, nomor, nama, dan bukti transfer.",
    "Beri tahu keluarga nama perusahaan, alamat tempat kerja, dan nomor yang bisa dihubungi.",
  ],
  remote: [
    "Jangan pernah membayar deposit atau top-up untuk mendapatkan pekerjaan.",
    "Jangan berikan kode OTP, PIN, atau akses m-banking kepada siapa pun.",
    "Jangan membuka atau meminjamkan rekening untuk dipakai orang lain.",
    "Cek rekening yang diberikan perekrut di CekRekening.id sebelum bertransaksi.",
    "Simpan semua bukti: chat, nomor, nama, dan bukti transfer.",
  ],
};

const SEVERITY_ORDER: Record<Severity, number> = { bahaya: 0, pastikan: 1, info: 2 };

export function evaluateAlur(answers: AlurAnswers): AlurResult {
  const flow = flowOf(answers) ?? "lokal";
  const own =
    flow === "remote" ? remoteFindings(answers) : isAbroad(flow, answers) ? abroadFindings(flow, answers) : domesticFindings(flow, answers);
  const findings = [...own, ...commonFindings(flow, answers)].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const status: AlurStatus = findings.some((finding) => finding.severity === "bahaya")
    ? "pelanggaran"
    : findings.some((finding) => finding.severity === "pastikan")
      ? "pastikan"
      : "belum_ditemukan";

  // The contacts the findings call for, most serious first; the official checks are always offered
  const ids = new Set<ContactId>(findings.flatMap((finding) => finding.contacts));
  if (flow === "migran") ids.add("siskop2mi");
  if (isAbroad(flow, answers)) ids.add("safetravel");
  if (flow === "remote") ids.add("cekrekening");

  const safeSteps = flow === "remote" ? SAFE_STEPS.remote : isAbroad(flow, answers) ? SAFE_STEPS.luar : SAFE_STEPS.dalam;
  return { status, findings, contacts: [...ids].map((id) => CONTACTS[id]), safeSteps };
}
