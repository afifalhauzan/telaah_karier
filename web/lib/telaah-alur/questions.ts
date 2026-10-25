// TelaahAlur: a user who is already in a recruitment process answers a few questions in the chat, and
// fixed rules (rules.ts) judge the answers. A few core questions say which kind of process it is (the
// flow); the flow decides which facts of this catalog are asked.

export type Flow = "migran" | "domestik" | "lokal" | "remote" | "magang";

export const UNKNOWN = "belum_tahu";

// Every choice question also takes the user's own answer: OTHER, with their words under otherKey(id),
// shown back in the summary. The rules read only OTHER itself.
export const OTHER = "lainnya";
export const otherKey = (id: string) => `${id}_lainnya`;

export interface Choice {
  value: string;
  label: string;
  // Other names people type when searching, e.g. a city for its country
  keywords?: string;
  // Offered only in these flows; all flows when absent
  flows?: Flow[];
}

export interface Question {
  id: string;
  label: string;
  hint?: string;
  // "search": pick from a long list by typing (the destination country)
  kind: "single" | "multi" | "search" | "text";
  options?: Choice[];
  // No "Lainnya": the answer has to be one of the options (the core questions that pick the flow)
  closed?: boolean;
  // Asked only when this returns true for the answers so far
  showIf?: (answers: AlurAnswers) => boolean;
}

export interface Fact extends Question {
  flows: Flow[];
}

export type AlurAnswers = Record<string, string | string[] | undefined>;

// What reading a story produces: each answer with the words it came from, so the user can check it.
export type ReadFacts = Record<string, { value: string | string[]; quote: string }>;

const YES_NO_UNKNOWN: Choice[] = [
  { value: "ya", label: "Ya" },
  { value: "tidak", label: "Tidak" },
  { value: UNKNOWN, label: "Belum tahu" },
];

const ALL_FLOWS: Flow[] = ["migran", "domestik", "lokal", "remote", "magang"];
const abroad = (answers: AlurAnswers) => answers.negara !== "indonesia";

export const FLOW_LABELS: Record<Flow, string> = {
  migran: "Kerja di luar negeri",
  domestik: "Kerja di dalam negeri, pindah ke kota atau pulau lain",
  lokal: "Kerja di kotaku sendiri",
  remote: "Kerja dari rumah (online atau remote)",
  magang: "Magang atau program kampus",
};

export const CORE_QUESTIONS: Question[] = [
  {
    id: "jalur",
    label: "Tawaran kerjanya seperti apa?",
    kind: "single",
    closed: true,
    options: ALL_FLOWS.map((flow) => ({ value: flow, label: FLOW_LABELS[flow] })),
  },
  {
    id: "tahap",
    label: "Sudah sampai tahap mana?",
    kind: "single",
    closed: true,
    options: [
      { value: "ditawari", label: "Baru ditawari atau melihat iklannya" },
      { value: "melamar", label: "Sudah melamar atau wawancara" },
      { value: "sudah_bayar", label: "Sudah membayar atau menyerahkan dokumen" },
      { value: "akan_berangkat", label: "Akan segera berangkat atau mulai bekerja" },
      { value: "terjebak", label: "Sudah di tempat kerja dan tidak bisa pergi" },
    ],
  },
  {
    id: "perekrut",
    label: "Siapa yang menawarkan pekerjaan ini?",
    kind: "single",
    // Someone who cannot leave goes straight to the contacts
    showIf: (answers) => answers.tahap !== "terjebak",
    options: [
      { value: "perusahaan", label: "Perusahaan pemberi kerja langsung" },
      { value: "p3mi", label: "Perusahaan penempatan (P3MI)", flows: ["migran"] },
      { value: "agen", label: "Yayasan, agen penyalur, atau LPK", flows: ["migran", "domestik", "lokal", "magang"] },
      { value: "kampus", label: "Kampus atau sekolah", flows: ["magang"] },
      { value: "pemerintah", label: "Program pemerintah (G to G)", flows: ["migran", "magang"] },
      { value: "calo", label: "Perorangan, sponsor, atau calo" },
      { value: "kenalan", label: "Kenalan atau keluarga" },
      { value: "medsos", label: "Iklan atau chat di media sosial" },
      { value: "portal", label: "Situs atau aplikasi lowongan kerja" },
      { value: UNKNOWN, label: "Belum tahu" },
    ],
  },
];

export const COUNTRIES: Choice[] = [
  { value: "indonesia", label: "Indonesia (dalam negeri)", flows: ["magang"] },
  // Asia Tenggara
  { value: "malaysia", label: "Malaysia" },
  { value: "singapura", label: "Singapura" },
  { value: "brunei", label: "Brunei Darussalam" },
  { value: "thailand", label: "Thailand", keywords: "bangkok" },
  { value: "kamboja", label: "Kamboja", keywords: "cambodia phnom penh sihanoukville" },
  { value: "myanmar", label: "Myanmar" },
  { value: "laos", label: "Laos" },
  { value: "filipina", label: "Filipina", keywords: "manila" },
  { value: "vietnam", label: "Vietnam" },
  // Asia Timur
  { value: "taiwan", label: "Taiwan", keywords: "taipei" },
  { value: "hongkong", label: "Hong Kong", keywords: "hongkong" },
  { value: "korea_selatan", label: "Korea Selatan", keywords: "korsel seoul" },
  { value: "jepang", label: "Jepang", keywords: "tokyo osaka" },
  { value: "china", label: "China", keywords: "tiongkok" },
  // Timur Tengah
  { value: "arab_saudi", label: "Arab Saudi", keywords: "saudi riyadh jeddah mekah madinah" },
  { value: "uea", label: "Uni Emirat Arab", keywords: "uae dubai abu dhabi" },
  { value: "qatar", label: "Qatar", keywords: "doha" },
  { value: "kuwait", label: "Kuwait" },
  { value: "oman", label: "Oman" },
  { value: "bahrain", label: "Bahrain" },
  { value: "yordania", label: "Yordania" },
  { value: "turki", label: "Turki" },
  // Lainnya
  { value: "jerman", label: "Jerman" },
  { value: "australia", label: "Australia" },
  { value: OTHER, label: "Negara lain" },
];

export const FACTS: Fact[] = [
  {
    id: "negara",
    label: "Ke negara mana kamu akan bekerja?",
    kind: "search",
    options: COUNTRIES,
    flows: ["migran", "magang"],
  },
  {
    id: "pekerjaan",
    label: "Pekerjaan apa yang ditawarkan?",
    kind: "single",
    flows: ["migran", "domestik", "lokal", "remote"],
    options: [
      { value: "art", label: "ART, pengasuh, atau perawat lansia", flows: ["migran", "domestik", "lokal"] },
      { value: "online", label: "Operator komputer, CS, atau admin online", flows: ["migran", "remote"] },
      { value: "tugas_online", label: "Tugas online: like, rating, review, atau klik", flows: ["remote"] },
      { value: "freelance", label: "Freelance: desain, penulisan, terjemahan, dan sejenisnya", flows: ["remote"] },
      { value: "abk", label: "Awak kapal atau perikanan", flows: ["migran", "domestik"] },
      { value: "pabrik", label: "Pabrik", flows: ["migran", "domestik", "lokal"] },
      { value: "perkebunan", label: "Perkebunan atau pertanian", flows: ["migran", "domestik"] },
      { value: "konstruksi", label: "Konstruksi", flows: ["migran", "domestik", "lokal"] },
      { value: "hotel", label: "Hotel, restoran, atau tempat hiburan", flows: ["migran", "domestik", "lokal"] },
      { value: "toko", label: "Toko atau kantor", flows: ["domestik", "lokal"] },
    ],
  },
  {
    id: "nama_perekrut",
    label: "Siapa nama perusahaan, agen, atau penyelenggaranya?",
    hint: "Dipakai untuk mengarahkanmu ke pengecekan resmi. Boleh dikosongkan.",
    kind: "text",
    flows: ALL_FLOWS,
    showIf: (answers) => ["perusahaan", "p3mi", "agen", "kampus"].includes(String(answers.perekrut)),
  },
  {
    id: "visa",
    label: "Visa apa yang dijanjikan untuk berangkat?",
    kind: "single",
    flows: ["migran", "magang"],
    showIf: abroad,
    options: [
      { value: "kerja", label: "Visa kerja" },
      { value: "magang", label: "Visa magang atau pelajar", flows: ["magang"] },
      { value: "kunjungan", label: "Visa kunjungan atau turis" },
      { value: "ziarah", label: "Visa ziarah atau umrah", flows: ["migran"] },
      { value: UNKNOWN, label: "Belum tahu" },
    ],
  },
  {
    id: "dokumen_ditahan",
    label: "Apakah dokumen aslimu (paspor, KTP, atau ijazah) akan dipegang perekrut atau majikan?",
    kind: "single",
    flows: ["migran", "domestik", "lokal", "magang"],
    options: YES_NO_UNKNOWN,
  },
  {
    id: "transit",
    label: "Apakah kamu akan berangkat lewat negara lain dulu (transit)?",
    kind: "single",
    flows: ["migran", "magang"],
    showIf: abroad,
    options: YES_NO_UNKNOWN,
  },
  {
    id: "bohong_imigrasi",
    label: "Apakah kamu diminta mengaku berwisata kepada petugas imigrasi?",
    kind: "single",
    flows: ["migran", "magang"],
    showIf: abroad,
    options: YES_NO_UNKNOWN.slice(0, 2),
  },
  {
    id: "penampungan",
    label: "Apakah kamu akan ditampung dulu, tidak boleh keluar, atau HP-mu disita?",
    kind: "single",
    flows: ["migran", "domestik", "magang"],
    options: YES_NO_UNKNOWN,
  },
  {
    id: "beda_pekerjaan",
    label: "Apakah pekerjaan yang sebenarnya berbeda dari yang dijanjikan?",
    hint: "Misalnya dijanjikan magang sesuai jurusan atau kerja di pabrik, ternyata jadi buruh angkut atau di kapal.",
    kind: "single",
    flows: ["migran", "domestik", "lokal", "magang"],
    options: YES_NO_UNKNOWN,
  },
  {
    id: "biaya",
    label: "Biaya apa saja yang diminta darimu?",
    hint: "Pilih semua yang sesuai.",
    kind: "multi",
    flows: ALL_FLOWS,
    options: [
      { value: "pendaftaran", label: "Pendaftaran atau administrasi" },
      { value: "pelatihan", label: "Pelatihan", flows: ["migran", "domestik", "lokal", "magang"] },
      { value: "medical", label: "Tes kesehatan", flows: ["migran", "domestik", "magang"] },
      { value: "transport", label: "Tiket atau ongkos perjalanan", flows: ["migran", "domestik", "magang"] },
      { value: "dokumen", label: "Pengurusan dokumen", flows: ["migran", "domestik", "magang"] },
      { value: "deposit", label: "Deposit atau top-up saldo untuk membuka tugas", flows: ["remote"] },
      { value: "potong_gaji", label: "Dibayar nanti lewat potong gaji atau dana talangan", flows: ["migran", "domestik", "lokal", "magang"] },
      { value: "tidak_ada", label: "Tidak ada biaya" },
      { value: UNKNOWN, label: "Belum tahu" },
    ],
  },
  {
    id: "perjanjian",
    label: "Apakah sudah ada perjanjian kerja tertulis?",
    kind: "single",
    flows: ["migran", "domestik", "lokal", "magang"],
    options: [
      { value: "tertulis", label: "Sudah, tertulis" },
      { value: "lisan", label: "Hanya lisan" },
      { value: UNKNOWN, label: "Belum tahu" },
    ],
  },
  {
    id: "rekening_dipakai",
    label: "Apakah kamu diminta membuka rekening atau e-wallet, atau meminjamkan rekeningmu untuk menerima uang?",
    kind: "single",
    flows: ["remote", "lokal"],
    options: YES_NO_UNKNOWN,
  },
  {
    id: "data_pribadi",
    label: "Data apa saja yang diminta darimu?",
    hint: "Pilih semua yang sesuai.",
    kind: "multi",
    flows: ["remote"],
    options: [
      { value: "ktp", label: "Foto KTP" },
      { value: "selfie_ktp", label: "Selfie sambil memegang KTP" },
      { value: "otp", label: "Kode OTP atau PIN" },
      { value: "akun_bank", label: "Akses m-banking atau e-wallet" },
      { value: "tidak_ada", label: "Tidak ada" },
      { value: UNKNOWN, label: "Belum tahu" },
    ],
  },
  {
    id: "bayaran_tidak_wajar",
    label: "Apakah bayarannya sangat besar untuk tugas yang sangat ringan?",
    hint: "Misalnya ratusan ribu sehari hanya untuk menyukai video atau memberi rating.",
    kind: "single",
    flows: ["remote"],
    options: YES_NO_UNKNOWN,
  },
  {
    id: "rahasia",
    label: "Apakah kamu diminta merahasiakan rencana ini dari keluarga?",
    kind: "single",
    flows: ALL_FLOWS,
    options: YES_NO_UNKNOWN,
  },
  {
    id: "jodoh",
    label: "Apakah tawarannya berupa jodoh, pernikahan, atau menjadi pengantin?",
    kind: "single",
    flows: ["migran", "domestik"],
    options: YES_NO_UNKNOWN.slice(0, 2),
  },
  {
    id: "usia",
    label: "Berapa usia calon pekerja?",
    kind: "single",
    flows: ALL_FLOWS,
    options: [
      { value: "dewasa", label: "18 tahun atau lebih" },
      { value: "anak", label: "Di bawah 18 tahun" },
    ],
  },
];

export const FACT_BY_ID = new Map(FACTS.map((fact) => [fact.id, fact]));

export function flowOf(answers: AlurAnswers): Flow | null {
  return ALL_FLOWS.find((flow) => flow === answers.jalur) ?? null;
}

const inFlow = (choice: Choice, flow: Flow | null) => !choice.flows || !flow || choice.flows.includes(flow);

/** The question as asked in this flow: only the options that make sense there. */
export function questionFor<T extends Question>(question: T, flow: Flow | null): T {
  return question.options ? { ...question, options: question.options.filter((option) => inFlow(option, flow)) } : question;
}

const applies = (question: Question, answers: AlurAnswers) => !question.showIf || question.showIf(answers);

/** The core questions that apply so far (the recruiter's options depend on the flow). */
export function coreQuestions(answers: AlurAnswers): Question[] {
  const flow = flowOf(answers);
  return CORE_QUESTIONS.map((question) => questionFor(question, flow));
}

/** The catalog facts that belong to a flow and apply to the answers so far. */
export function factsFor(flow: Flow, answers: AlurAnswers): Fact[] {
  return FACTS.filter((fact) => fact.flows.includes(flow) && applies(fact, answers)).map((fact) => questionFor(fact, flow));
}

export function choicesOf(question: Question): Choice[] {
  const options = question.options ?? [];
  if (question.closed || options.some((option) => option.value === OTHER)) return options;
  return [...options, { value: OTHER, label: "Lainnya" }];
}

export function isAnswered(question: Question, answers: AlurAnswers): boolean {
  const value = answers[question.id];
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim() !== "";
}

/** The answer as the user would say it, with their own words for "Lainnya"; null when unanswered. */
export function answerLabel(question: Question, answers: AlurAnswers): string | null {
  const value = answers[question.id];
  if (!isAnswered(question, answers) || value === undefined) return null;
  if (question.kind === "text") return String(value).trim();
  const own = answers[otherKey(question.id)];
  return (Array.isArray(value) ? value : [value])
    .map((item) =>
      item === OTHER && typeof own === "string" && own.trim()
        ? own.trim()
        : choicesOf(question).find((option) => option.value === item)?.label ?? item
    )
    .join(", ");
}
