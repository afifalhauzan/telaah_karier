import { findLookalikeDomains, type LookalikeDomain } from "./lookalike";
import { RISK_LEVEL_LABELS, type RiskLevel, type RiskType } from "./schema";

/**
 * Deterministic, rule-based detection of job-scam patterns.
 *
 * The signals are used three ways:
 * 1. passed to the model as <temuan_otomatis> so it can confirm or reject them,
 * 2. as a safety floor: a strong signal keeps the final risk level from being lowered
 *    (e.g. by a prompt-injection that convinced the model a fee-charging post is safe),
 * 3. as the limited rule-based analysis when the model is unavailable.
 */

export type SignalId =
  | "fee_request"
  | "sensitive_data_request"
  | "manipulation_attempt"
  | "unverified_claim"
  | "personal_chat_contact"
  | "free_email_domain"
  | "shortlink"
  | "link_in_bio"
  | "unofficial_domain"
  | "paid_task"
  | "institution_impersonation"
  | "moderate_combination"
  | "new_domain"
  | "lookalike_domain"
  | "cert_cluster";

export type SignalSeverity = "strong" | "moderate";

export interface DetectedSignal {
  id: SignalId;
  label: string;
  severity: SignalSeverity;
  riskType: RiskType;
  floor?: RiskLevel;
  floorReason?: string;
  description: string;
  evidence: string[];
}

interface SignalRule {
  id: SignalId;
  label: string;
  severity: SignalSeverity;
  riskType: RiskType;
  floor?: RiskLevel;
  floorReason?: string;
  description: string;
  patterns: RegExp[];
  negatable?: boolean;
  // Only when the material shows no address at all: "klik link di bio" next to a real URL hides nothing.
  onlyWithoutUrl?: boolean;
}

// Applicant-facing fees. "uang" is only paired with purposes that are paid BY the applicant;
// "uang transport/makan/lembur" are benefits and must not match.
const FEE_PATTERNS = [
  /\bbiaya\s+(?:pendaftaran|registrasi|administrasi|admin|pelatihan|training|diklat|seragam|atribut|medical(?:\s+check[\s-]?up)?|mcu|pemeriksaan\s+kesehatan|tes|test|psikotes|ujian|interview|wawancara|akomodasi|penginapan|tiket|transport(?:asi)?|modul|onboarding|jaminan|deposit|materai|aktivasi|pemberkasan|pengurusan|visa|paspor|keberangkatan|penempatan)\b/gi,
  /\buang\s+(?:pendaftaran|registrasi|administrasi|admin|jaminan|deposit|pelatihan|seragam|pemberkasan|materai|pengurusan|keberangkatan)\b/gi,
  /\b(?:wajib|harus|diharuskan|diwajibkan|diminta|cukup|hanya|silakan|silahkan|segera)\s+(?:membayar|bayar|mentransfer|transfer|tf|setor|deposit|top[\s-]?up)\b/gi,
  /\b(?:transfer|tf|setor|deposit|top[\s-]?up)\b[^.!?\n]{0,40}?(?:rp\.?\s?\d|\b\d+(?:[.,]\d+)?\s?(?:ribu|rb|jt|juta|k)\b)/gi,
  /\b(?:dana|uang)\s+(?:jaminan|deposit)\b/gi,
  // Letter style: "melakukan transfer ke Rekening Bank Permata 8566… sebesar Rp.100.000",
  // "Transfer ke:\n\nBANK JAGO … NO REK: … Total : Rp 3.920.887".
  /\b(?:transfer|tf|setor(?:kan)?|kirim(?:kan)?\s+(?:uang|dana))\s*(?:kan\s+)?(?:uang\s+|dana\s+|biaya(?:nya)?\s+)?ke\s*:?\s*(?:no(?:mor)?\.?\s*)?(?:rekening|rek\b|bank\b|virtual\s+account|bri\b|bni\b|bca\b|mandiri\b|btn\b|bsi\b|permata\b|cimb\b|danamon\b|jago\b|seabank\b|ovo\b|gopay\b|dana\b|shopeepay\b)/gi,
  /\b(?:rekening|no\.?\s*rek(?:ening)?|rek\.?)(?=[\s:.])[^!?]{0,120}?\b(?:sebesar|senilai|total|nominal|jumlah)\s*:?\s*(?:rp\.?\s?\d|\d)/gi,
  /\b(?:selesaikan|lunasi|segera\s+(?:lakukan|melakukan))\s+(?:pembayaran|transfer|pelunasan)\b/gi,
  /\b(?:di\s?)?(?:tf|transfer)\s?(?:kan|in)\b/gi,
  // A fee with an amount a few words later: "biaya sementara 50 rb", "biaya formulir Rp 50.000".
  /\bbiaya\s+(?:(?!ditanggung|gratis|free|tidak|tanpa)[\w-]+\s+){0,2}?(?:sebesar\s+|senilai\s+)?(?:rp\.?\s?\d|\d+(?:[.,]\d+)?\s?(?:ribu|rb|jt|juta|k)\b)/gi,
  // Paid by the applicant first and "reimbursed" later is still a fee.
  /\b(?:biaya|akomodasi|tiket|transport(?:asi)?|penginapan|hotel|uang)\b[^.!?\n]{0,80}?\b(?:akan\s+)?(?:diganti|dikembalikan|direimburse|di-?reimburse|reimburse|refund)\b/gi,
  /\b(?:biaya|akomodasi|tiket|transport(?:asi)?|penginapan|hotel)\b[^.!?\n]{0,40}?\bditanggung\s+(?:dulu\s+|terlebih\s+dahulu\s+|sementara\s+)?(?:oleh\s+)?(?:peserta|pelamar|calon\s+(?:karyawan|peserta|pegawai)|sendiri|anda|saudara)\b/gi,
  /\b(?:dana\s+talangan|ditalangi)\b/gi,
  /\b(?:biaya|dana|uang|tiket|talangan|pinjaman)\b[^.!?\n]{0,60}?\b(?:dipotong|potong|potongan)\s+(?:dari\s+)?gaji\b/gi,
];

// A transfer or amount that is the salary, a duty of the role, a statutory deduction, or a work
// expense is not a fee: "gaji ditransfer ke rekening", "melakukan transfer ke rekening vendor",
// "iuran BPJS dipotong dari gaji", "biaya perjalanan dinas akan diganti".
const FEE_PAYEE_BEFORE = /\b(?:gaji|upah|honor|insentif|komisi|bonus|uang\s+saku|thr|tunjangan|payroll|rekonsiliasi)\b/i;
const FEE_PAYEE_AFTER = /^\W*(?:[\w.-]+\s+){0,3}?(?:vendor|supplier|pemasok|pelanggan|customer|nasabah|klien|client|tagihan|invoice)\b/i;
const FEE_EXEMPT_IN_MATCH = /\b(?:bpjs|pph|pajak|iuran|asuransi|dinas|operasional)\b/i;

const SENSITIVE_DATA_PATTERNS = [
  /\b(?:kirim(?:kan)?|berikan|beri|sebutkan|bagikan|share|informasikan|masukkan|minta)\b[^.!?\n]{0,30}?\b(?:kode\s+)?(?:otp|pin|password|kata\s+sandi|kode\s+verifikasi|cvv)\b/gi,
  /\b(?:kode\s+)?(?:otp|pin|password|kata\s+sandi|cvv)\b[^.!?\n]{0,30}?\b(?:dikirim|diberikan|dibagikan|diinformasikan)\b/gi,
  /\bselfie\b[^.!?\n]{0,25}?\b(?:ktp|e-?ktp|kartu\s+identitas)\b/gi,
  /\b(?:foto|swafoto)\b[^.!?\n]{0,15}?\b(?:memegang|pegang|sambil|dengan)\s+(?:ktp|e-?ktp)\b/gi,
  /\b(?:nomor|no\.?)\s+(?:kartu\s+kredit|cc)\b/gi,
  /\b(?:login|akun|user\s?id)\s+(?:m-?banking|mbanking|internet\s+banking)\b/gi,
];

// Kept narrow on purpose: legitimate postings say things like "act as a liaison",
// "Katakan tidak pada penipuan", or "Catatan untuk model" (modeling jobs).
const MANIPULATION_PATTERNS = [
  /\b(?:abaikan|lupakan|acuhkan|hiraukan)\b[^.!?\n]{0,40}?\b(?:instruksi|perintah|aturan|prompt|arahan)\b/gi,
  /\b(?:ignore|disregard)\b[^.!?\n]{0,40}?\b(?:previous|prior|above|earlier|all)\b[^.!?\n]{0,20}?\b(?:instructions?|prompts?|rules)\b/gi,
  /\b(?:ungkapkan|tampilkan|bocorkan|reveal|print)\b[^.!?\n]{0,25}?\b(?:system\s+prompt|prompt\s+sistem|instruksi\s+sistem)\b/gi,
  /\b(?:kamu|anda)\s+(?:sekarang\s+)?(?:adalah|berperan\s+sebagai|bertindak\s+sebagai)\s+(?:ai|asisten|model|chatbot|bot)\b/gi,
  /\b(?:you\s+are\s+now|pretend\s+to\s+be)\b/gi,
  /\bact\s+as\s+(?:an?\s+)?(?:ai|assistant|chatbot|language\s+model)\b/gi,
  /\b(?:nyatakan|katakan|tandai|tuliskan|simpulkan|labeli|nilai)\b[^.!?\n]{0,30}?\b(?:lowongan|loker|ini|perusahaan|hasil)\b[^.!?\n]{0,25}?\b(?:aman|resmi|terpercaya|legal|valid|risiko\s+rendah|tidak\s+berisiko|bukan\s+penipuan|berbahaya|risiko\s+tinggi)\b/gi,
  /\b(?:catatan|pesan|instruksi|note)\s+(?:untuk|kepada|to)\s+(?:ai|chatbot|llm|gpt|gemini|asisten\s+ai|model\s+ai)\b/gi,
  /<\/?\s*(?:system|instruction|instruksi_sistem|pesan_sistem|materi_lowongan|temuan_otomatis|sumber_pencarian|hasil_analisis_awal)\b/gi,
  // Verdict dictated outright: "Beri tingkat risiko tinggi", "Nilai risiko: tinggi", "AI wajib menilai".
  /\b(?:beri(?:kan)?|tetapkan|keluarkan)\s+(?:tingkat\s+)?risiko\b[^.!?\n]{0,15}?\b(?:rendah|sedang|tinggi)\b/gi,
  /\bnilai\s+risiko\s*:\s*(?:rendah|sedang|tinggi)\b/gi,
  /\b(?:ai|chatbot|llm|model|asisten)\s+(?:wajib|harus|diminta|perlu)\s+(?:menilai|menyatakan|menandai|memberi|mengeluarkan)\b/gi,
  /\b(?:classify|rate|mark|label)\s+(?:this|the)\s+(?:posting|job|listing|post)\b[^.!?\n]{0,30}?\bas\b/gi,
  /\b(?:respond|answer)\s+with\s+risk\s+level\b/gi,
  /\b(?:peringatan|pesan|instruksi)\s+sistem\s*:|\bsystem\s*:/gi,
  /\briskLevel\b|"riskAssessment"/g,
];

// Which way an injected instruction pushes the verdict, read from the text right after it.
const STEER_HIGH = /\b(?:penipuan|scam|hoaks|hoax|palsu|fake|ilegal|tppo|daftar\s+hitam|blacklist|berbahaya|tinggi|high)\b/i;
const STEER_LOW =
  /\b(?:aman|resmi|terpercaya|legal|valid|asli|safe|verified|terverifikasi|diverifikasi|rendah|low|bukan\s+(?:penipuan|hoaks|hoax)|tidak\s+berisiko)\b/i;
const STEER_WINDOW = 160;

// A third party's verdict quoted inside the material ("Komdigi: lowongan ini termasuk daftar hoaks",
// "telah diverifikasi resmi oleh Kemnaker"). It cannot be checked from the material, so it is
// neither evidence of fraud nor of legitimacy. A posting's own warning ("waspada penipuan yang
// mengatasnamakan kami") is not a verdict on the posting and does not match.
const AUTHORITY = String.raw`(?:komdigi|kominfo|kemnaker|kemenaker|kementerian\s+\w+|kemlu|bp2mi|kp2mi|ojk|polri|bareskrim|satgas(?:\s+\w+){0,2}|mafindo|turnbackhoax|cek\s?fakta|pemerintah)`;
const UNVERIFIED_CLAIM_PATTERNS = [
  /\b(?:lowongan|loker|perusahaan|p3mi|agen|materi|rekrutmen|info)\s+(?:ini|berikut|tersebut)\b[^.!?\n]{0,40}?\b(?:termasuk|masuk|tercantum|dinyatakan|telah|sudah)\s+(?:dalam\s+|ke\s+)?(?:daftar\s+(?:hoaks|hoax|hitam|penipuan)|blacklist|hoaks|hoax|diverifikasi|terverifikasi|dilaporkan)\b/gi,
  /\b(?:lowongan|loker|materi|info)\s+(?:ini|berikut|tersebut)\s+(?:adalah\s+|merupakan\s+)?(?:bukan\s+)?(?:hoaks|hoax)\b/gi,
  new RegExp(String.raw`\b(?:terverifikasi|diverifikasi|verified)\s+(?:resmi\s+)?(?:oleh\s+|by\s+)?${AUTHORITY}\b`, "gi"),
  /\b(?:sudah|telah)\s+dilaporkan\s+sebagai\s+(?:tppo|penipuan|hoaks|hoax)\b/gi,
];

const PERSONAL_CHAT_PATTERNS = [
  /\b(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me)\/\S+/gi,
  /\b(?:wa|whatsapp|whats\s?app|telegram)\b[^.!?\n]{0,25}?(?:\+?62|0)\s?8[\d\s-]{7,14}/gi,
  /\b(?:hubungi|chat|kontak|contact|daftar|kirim\s+cv)\b[^.!?\n]{0,25}?\b(?:wa|whatsapp|telegram)\b/gi,
];

const FREE_EMAIL_PATTERNS = [
  /[\w.+-]+@(?:gmail|yahoo|ymail|hotmail|outlook|live|aol|icloud|proton(?:mail)?)\.(?:com|co\.id|me)\b/gi,
];

// Registration hidden behind the account profile, with no address in the material itself.
const LINK_IN_BIO_PATTERNS = [
  /\b(?:link|tautan|website|web|situs|url)\b[^.!?\n]{0,20}?(?:\bdi\s*|\bdalam\s+|\bpada\s+)(?:bio|profil|profile)\b/gi,
  /\blink\s*(?:in\s*)?bio\b/gi,
  /\b(?:klik|klick|klil|cek|buka|kunjungi)\s+(?:link|tautan|daftar)\b/gi,
  /\b(?:daftar|pendaftaran)\s+(?:melalui|lewat|via|di)\s+(?:link|tautan)\b/gi,
];

// Any address in the material once emails are removed (an email is a contact, not a page).
const VISIBLE_URL =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|id|co|net|org|app|io|me|ly|gl|ee|site|online|xyz|info|biz|link|page|top|ke)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// Free or throwaway hosting that an established company or agency does not recruit through.
const UNOFFICIAL_DOMAIN_PATTERNS = [
  /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:vercel\.app|netlify\.app|github\.io|pages\.dev|web\.app|firebaseapp\.com|glitch\.me|my\.id|it\.com)\b(?:\/[^\s"'<>)]*)?/gi,
  /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:msha\.ke|sidji\.me)\b(?:\/[^\s"'<>)]*)?/gi,
  /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:site|online|xyz|top|icu|buzz|click|cfd|sbs)(?![\w.-])(?:\/[^\s"'<>)]*)?/gi,
];

// "follow up pelanggan" is a sales duty and "would like to" is plain English, not a paid task.
const SOCIAL_ACTION = String.raw`(?:like(?!\s+(?:to|a|an|the|this|that|it|you|we|working)\b)|follow(?![\s-]?up)|subscribe|komen|share)`;
const PER_DAY = String.raw`(?:per\s?hari|perhari|\/\s?hari|sehari|tiap\s+hari|setiap\s+hari)`;
// Same sentence, where "Rp 50.000" keeps its thousands separator.
const SAME_SENTENCE = String.raw`(?:[^.!?\n]|\.(?=\d))`;
const PAID_TASK_PATTERNS = [
  new RegExp(
    String.raw`\b${SOCIAL_ACTION}\b${SAME_SENTENCE}{0,60}?(?:\b(?:dibayar|bayaran|komisi|upah|imbalan|reward|cuan)\b|rp\.?\s?\d|\b\d+(?:[.,]\d+)?\s?(?:rb|ribu|k)\b|\b(?:per|setiap|tiap)\s+tugas\b)`,
    "gi"
  ),
  new RegExp(String.raw`\b(?:dibayar|bayaran|komisi|upah|imbalan|cuan|penghasilan)\b${SAME_SENTENCE}{0,40}?\b${SOCIAL_ACTION}\b`, "gi"),
  new RegExp(
    String.raw`\b(?:tugas|kerja(?:an)?|pekerjaan|freelance|freelancer|part[\s-]?time|paruh\s+waktu|sampingan|misi)\b[^.!?\n]{0,40}?\b${SOCIAL_ACTION}\b`,
    "gi"
  ),
  new RegExp(
    String.raw`\b(?:penghasilan|pendapatan|gaji|income|cuan|komisi|profit)\b[^.!?\n]{0,30}?\b(?:dijamin|pasti|garansi|dijanjikan)\b[^.!?\n]{0,30}?${PER_DAY}`,
    "gi"
  ),
  new RegExp(String.raw`${PER_DAY}\b[^.!?\n]{0,20}?\b(?:dijamin|pasti|garansi)\b`, "gi"),
  new RegExp(
    String.raw`\b(?:modal|cukup|hanya|kerja\s+(?:dari|lewat|pakai|via|di))\s+(?:hp|hape|handphone|smartphone|ponsel)\b[^.!?\n]{0,80}?${PER_DAY}`,
    "gi"
  ),
];

// Claims to be a ministry, parliament, state-owned or listed company.
const INSTITUTION_CLAIM =
  /\b(?:DPR(?:\s*-?\s*RI)?|MPR(?:\s*-?\s*RI)?|DPD\s*-?\s*RI|Kementerian|Kemnaker|Kemenkes|Kemenag|Kemendikbud(?:ristek)?|Kemendikdasmen|Kemenkeu|Kemensos|Kemenhub|Kemenpan(?:-?rb)?|Kemendagri|Kemenlu|Kemenkumham|Kemenimipas|Kementan|Kemenperin|Kemendag|Kemenpupr|Kemenparekraf|Kemenkominfo|Komdigi|Kemenhan|Kemenpora|BUMN|Persero|Tbk)\b/gi;
// Licensed placement agencies (P3MI) list their permit and often recruit through Gmail and a
// phone number; their pages also name the ministry that licenses them.
const PLACEMENT_AGENCY_CONTEXT = /\b(?:P3MI|SIP2MI|SIP3MI|No\.?\s*SIP|SISKOP2MI|Pekerja\s+Migran\s+Indonesia)\b/i;

const SHORTLINK_PATTERNS = [
  /\b(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|s\.id|tinyurl\.com|cutt\.ly|shorturl\.at|rb\.gy|t\.ly|is\.gd|ow\.ly|bit\.do|linktr\.ee|lnk\.bio|heylink\.me)\/[\w\-./?=&%#]+/gi,
];

const SIGNAL_RULES: SignalRule[] = [
  {
    id: "fee_request",
    label: "Permintaan biaya kepada pelamar",
    severity: "strong",
    riskType: "payment_request",
    floor: "tinggi",
    floorReason: "Perusahaan resmi umumnya tidak memungut biaya apa pun selama proses rekrutmen.",
    description:
      "Lowongan meminta pelamar membayar sejumlah biaya. Perusahaan resmi umumnya tidak memungut biaya apa pun selama proses rekrutmen.",
    patterns: FEE_PATTERNS,
    negatable: true,
  },
  {
    id: "sensitive_data_request",
    label: "Permintaan data sensitif",
    severity: "strong",
    riskType: "sensitive_data",
    floor: "tinggi",
    floorReason: "Kode OTP, PIN, kata sandi, atau foto KTP sambil selfie tidak dibutuhkan dalam rekrutmen resmi.",
    description:
      "Ada permintaan data sensitif (seperti OTP, PIN, atau foto KTP sambil selfie) yang berisiko disalahgunakan untuk penipuan atau pinjaman ilegal.",
    patterns: SENSITIVE_DATA_PATTERNS,
    negatable: true,
  },
  {
    id: "manipulation_attempt",
    label: "Upaya memanipulasi analisis otomatis",
    // Not evidence of fraud by itself: an attacker can plant it in a genuine posting to get it
    // flagged. Shown to the model as "sedang" so it is not read as a "tinggi" red flag.
    severity: "moderate",
    riskType: "manipulation",
    floor: "sedang",
    floorReason: "Materi berisi kalimat yang mencoba mengarahkan hasil analisis, sehingga perlu dicek ulang secara manual.",
    description:
      "Materi berisi kalimat yang mencoba mengatur hasil analisis otomatis. Hal ini tidak lazim pada lowongan resmi.",
    patterns: MANIPULATION_PATTERNS,
  },
  {
    // No floor: a quoted verdict must neither raise nor lower the risk. It is surfaced so the
    // model weighs it as an unverifiable claim rather than as a fact.
    id: "unverified_claim",
    label: "Klaim verifikasi pihak ketiga yang tidak bisa diperiksa (bukan bukti)",
    severity: "moderate",
    riskType: "manipulation",
    description:
      "Materi mengutip penilaian lembaga (misalnya \"terverifikasi Kemnaker\" atau \"masuk daftar hoaks Komdigi\") yang tidak bisa dipastikan dari materi. Klaim ini bukan bukti dan perlu dicek langsung di kanal resmi lembaga tersebut.",
    patterns: UNVERIFIED_CLAIM_PATTERNS,
  },
  {
    id: "personal_chat_contact",
    label: "Kontak lewat chat pribadi (WhatsApp/Telegram)",
    severity: "moderate",
    riskType: "suspicious_contact",
    description:
      "Pendaftaran atau kontak diarahkan ke chat pribadi (WhatsApp/Telegram), bukan kanal resmi perusahaan.",
    patterns: PERSONAL_CHAT_PATTERNS,
  },
  {
    id: "free_email_domain",
    label: "Email domain gratis",
    severity: "moderate",
    riskType: "suspicious_contact",
    description: "Kontak menggunakan email domain gratis, bukan domain resmi perusahaan.",
    patterns: FREE_EMAIL_PATTERNS,
  },
  {
    id: "shortlink",
    label: "Tautan pendaftaran disamarkan (shortlink)",
    severity: "moderate",
    riskType: "suspicious_contact",
    description: "Link pendaftaran memakai pemendek tautan sehingga tujuan aslinya tersembunyi.",
    patterns: SHORTLINK_PATTERNS,
  },
  {
    id: "link_in_bio",
    label: "Kanal pendaftaran tidak terlihat (link di bio)",
    severity: "moderate",
    riskType: "suspicious_contact",
    floor: "sedang",
    floorReason: "Alamat pendaftarannya tidak tercantum di materi, sehingga belum bisa dipastikan resmi.",
    description:
      "Pendaftaran diarahkan ke link di bio atau tombol \"klik link\" tanpa alamat yang terlihat, sehingga keaslian kanalnya belum bisa diperiksa.",
    patterns: LINK_IN_BIO_PATTERNS,
    onlyWithoutUrl: true,
  },
  {
    id: "unofficial_domain",
    label: "Pendaftaran lewat domain gratisan/tidak resmi",
    severity: "strong",
    riskType: "suspicious_contact",
    floor: "tinggi",
    floorReason: "Perusahaan dan instansi resmi tidak membuka pendaftaran di hosting gratis atau domain sekali pakai.",
    description:
      "Link pendaftaran berada di hosting gratis atau domain murah sekali pakai (misalnya vercel.app, my.id, .xyz), bukan domain resmi perusahaan atau instansi.",
    patterns: UNOFFICIAL_DOMAIN_PATTERNS,
  },
  {
    id: "paid_task",
    label: "Tugas online berbayar (like/follow/subscribe)",
    severity: "strong",
    riskType: "payment_request",
    floor: "tinggi",
    floorReason: "Pekerjaan berupa tugas like/follow/subscribe berbayar adalah pola penipuan yang biasanya berujung permintaan deposit.",
    description:
      "Pekerjaan berupa tugas like/follow/subscribe atau penghasilan harian yang dijamin. Pola ini biasanya berujung permintaan deposit untuk \"tugas premium\".",
    patterns: PAID_TASK_PATTERNS,
    negatable: true,
  },
];

// Signals derived from other evidence rather than from a single phrase.
const INSTITUTION_IMPERSONATION = {
  id: "institution_impersonation",
  label: "Klaim instansi/perusahaan besar dengan kontak pribadi",
  severity: "strong",
  riskType: "suspicious_contact",
  floor: "tinggi",
  floorReason: "Instansi pemerintah, BUMN, dan perusahaan terbuka merekrut lewat kanal resmi, bukan email gratis atau nomor WhatsApp pribadi.",
  description:
    "Materi mengatasnamakan instansi pemerintah, BUMN, atau perusahaan terbuka, tetapi kontaknya email gratis atau nomor WhatsApp pribadi yang bukan kanal resmi mereka.",
} as const satisfies Omit<DetectedSignal, "evidence">;

const MODERATE_COMBINATION = {
  id: "moderate_combination",
  label: "Gabungan kontak pribadi dan kanal pendaftaran tersembunyi",
  severity: "strong",
  riskType: "suspicious_contact",
  floor: "tinggi",
  floorReason: "Kontak pribadi dan kanal pendaftaran tersembunyi muncul bersamaan, sehingga tidak ada jalur resmi yang bisa diverifikasi.",
  description:
    "Kontak lewat email gratis atau chat pribadi muncul bersama link pendaftaran yang disamarkan atau tidak terlihat. Dua tanda ini saling menguatkan.",
} as const satisfies Omit<DetectedSignal, "evidence">;

// Two moderate signals of different kinds raise the floor; two of the same kind do not, since
// a small business or licensed agency often lists both a WhatsApp number and a Gmail address.
const CONTACT_SIGNALS: SignalId[] = ["personal_chat_contact", "free_email_domain"];
const HIDDEN_CHANNEL_SIGNALS: SignalId[] = ["shortlink", "link_in_bio"];

const LEVEL_RANK: Record<RiskLevel, number> = { rendah: 0, sedang: 1, tinggi: 2 };

const NEGATION_BEFORE = /\b(?:tidak|tdk|tanpa|tak|bebas|gratis|bukan|jangan|free|never)\b/i;
// "ditanggung perusahaan" waives a fee; "ditanggung sendiri/oleh peserta" is the applicant paying.
const NEGATION_AFTER =
  /\b(?:gratis|free|ditanggung(?!\s+(?:dulu\s+|terlebih\s+dahulu\s+|sementara\s+)?(?:oleh\s+)?(?:sendiri|peserta|pelamar|calon|anda|saudara|kandidat)\b)|dibebaskan|tidak\s+dipungut|tidak\s+dikenakan)\b/i;
// "tidak dipungut biaya pendaftaran maupun biaya pelatihan": the negation covers the whole list.
const COORDINATED_GAP = /^[\s,]*(?:(?:dan|atau|maupun|ataupun|serta)(?:\s+juga)?\s+)?$/i;
const MAX_EVIDENCE_PER_SIGNAL = 2;

// A fee/data phrase is negated when a negation word sits right before it in the same clause
// ("tidak dipungut biaya"), the clause right after it waives it ("biaya pelatihan ditanggung"),
// or it sits in a question ("Apakah wajar recruiter meminta biaya administrasi?"), which asks
// about a request rather than making one.
function isNegated(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 30), start);
  const clauseBefore = before.split(/[.!?\n,;:]/).pop() ?? "";
  if (NEGATION_BEFORE.test(clauseBefore)) {
    return true;
  }

  // A period followed by a digit is a thousands separator ("Rp 50.000"), not a sentence end.
  const sentenceEnd = text.slice(end).search(/[!?\n]|\.(?!\d)/);
  if (sentenceEnd >= 0 && text[end + sentenceEnd] === "?") {
    return true;
  }

  const after = text.slice(end, end + 40);
  const clauseAfter = after.split(/[.!?\n]/)[0] ?? "";
  return NEGATION_AFTER.test(clauseAfter);
}

function extractSnippet(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 35);
  const to = Math.min(text.length, end + 35);
  let snippet = text.slice(from, to).replace(/\s+/g, " ").trim();

  if (from > 0) {
    snippet = `…${snippet.replace(/^\S*\s/, "")}`;
  }
  if (to < text.length) {
    snippet = `${snippet.replace(/\s\S*$/, "")}…`;
  }

  return snippet;
}

/** True when a fee-like phrase is about the salary, a duty of the role, or a deduction/expense. */
function isPayeeContext(text: string, start: number, end: number): boolean {
  const clauseBefore = text.slice(Math.max(0, start - 40), start).split(/[.!?\n,;:]/).pop() ?? "";
  const clauseAfter = text.slice(end, end + 40).split(/[.!?\n]/)[0] ?? "";
  return (
    FEE_PAYEE_BEFORE.test(clauseBefore) ||
    FEE_PAYEE_AFTER.test(clauseAfter) ||
    FEE_EXEMPT_IN_MATCH.test(text.slice(start, end))
  );
}

function hasVisibleUrl(text: string): boolean {
  return VISIBLE_URL.test(text.replace(EMAIL, " "));
}

function collectEvidence(
  text: string,
  patterns: RegExp[],
  { negatable = false, excluded }: { negatable?: boolean; excluded?: (start: number, end: number) => boolean } = {}
): string[] {
  const evidence: string[] = [];

  for (const pattern of patterns) {
    let lastNegatedEnd = -1;

    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;

      if (negatable) {
        const continuesNegatedList =
          lastNegatedEnd >= 0 && COORDINATED_GAP.test(text.slice(lastNegatedEnd, start));
        if (continuesNegatedList || isNegated(text, start, end)) {
          lastNegatedEnd = end;
          continue;
        }
      }
      if (excluded?.(start, end)) {
        continue;
      }

      const snippet = extractSnippet(text, start, end);
      if (!evidence.includes(snippet)) {
        evidence.push(snippet);
      }
      if (evidence.length >= MAX_EVIDENCE_PER_SIGNAL) {
        return evidence;
      }
    }
  }

  return evidence;
}

function toSignal(rule: Omit<DetectedSignal, "evidence">, evidence: string[]): DetectedSignal {
  const { id, label, severity, riskType, floor, floorReason, description } = rule;
  return { id, label, severity, riskType, floor, floorReason, description, evidence };
}

/** A ministry/BUMN/listed-company claim whose only contact is a free email or a personal number. */
function detectInstitutionImpersonation(text: string): DetectedSignal | null {
  if (PLACEMENT_AGENCY_CONTEXT.test(text)) {
    return null;
  }
  const claim = collectEvidence(text, [INSTITUTION_CLAIM]).slice(0, 1);
  // A concrete address or number, not just the word "WhatsApp", which disclaimers mention too.
  const channel = collectEvidence(text, [...FREE_EMAIL_PATTERNS, ...PERSONAL_CHAT_PATTERNS.slice(0, 2)]).slice(0, 1);
  return claim.length && channel.length ? toSignal(INSTITUTION_IMPERSONATION, [...claim, ...channel]) : null;
}

function detectModerateCombination(signals: DetectedSignal[]): DetectedSignal | null {
  const contact = signals.find((signal) => CONTACT_SIGNALS.includes(signal.id));
  const hidden = signals.find((signal) => HIDDEN_CHANNEL_SIGNALS.includes(signal.id));
  return contact && hidden ? toSignal(MODERATE_COMBINATION, [contact.evidence[0], hidden.evidence[0]]) : null;
}

export function detectSignals(text: string): DetectedSignal[] {
  if (!text.trim().length) {
    return [];
  }

  const signals: DetectedSignal[] = [];
  const urlVisible = hasVisibleUrl(text);

  for (const rule of SIGNAL_RULES) {
    if (rule.onlyWithoutUrl && urlVisible) {
      continue;
    }

    const evidence = collectEvidence(text, rule.patterns, {
      negatable: rule.negatable,
      excluded: rule.id === "fee_request" ? (start, end) => isPayeeContext(text, start, end) : undefined,
    });
    if (evidence.length > 0) {
      signals.push(toSignal(rule, evidence));
    }
  }

  const impersonation = detectInstitutionImpersonation(text);
  if (impersonation) {
    signals.push(impersonation);
  }
  const combination = detectModerateCombination(signals);
  if (combination) {
    signals.push(combination);
  }
  const lookalikes = findLookalikeDomains(text);
  if (lookalikes.length) {
    signals.push(lookalikeDomainSignal(lookalikes));
  }

  return signals;
}

function lookalikeDomainSignal(lookalikes: LookalikeDomain[]): DetectedSignal {
  const [{ domain, brand, official }] = lookalikes;
  return {
    id: "lookalike_domain",
    label: "Domain meniru nama perusahaan atau instansi",
    severity: "strong",
    riskType: "suspicious_contact",
    floor: "tinggi",
    floorReason: "Domainnya memakai nama perusahaan atau instansi besar, tetapi bukan domain resmi mereka.",
    description: `Domain ${domain} memakai nama ${brand} dengan tambahan kata atau ejaan berbeda, padahal domain resmi ${brand} adalah ${official.join(" atau ")}. Penipu sering membuat domain seperti ini agar terlihat resmi.`,
    evidence: lookalikes.map((item) => item.domain).slice(0, MAX_EVIDENCE_PER_SIGNAL),
  };
}

/** From the domain registry rather than the text: the posting's site was registered only recently. */
export function newDomainSignal(domain: string, days: number): DetectedSignal {
  return {
    id: "new_domain",
    label: "Domain situs baru didaftarkan",
    severity: "moderate",
    riskType: "suspicious_contact",
    floor: "sedang",
    floorReason: "Situs rekrutmen yang baru dibuat beberapa minggu belum punya rekam jejak yang bisa diperiksa.",
    description: `Domain ${domain} baru didaftarkan ${days} hari lalu. Situs penipuan lowongan umumnya dibuat sesaat sebelum disebarkan, sedangkan situs perusahaan biasanya sudah berumur tahunan.`,
    evidence: [domain],
  };
}

/**
 * From Certificate Transparency logs rather than the text: the posting's domain also hosts other
 * recruitment sites or rotating addresses. Posing as two or more employers under one domain is an
 * operation, not a company.
 */
export function certClusterSignal(cluster: {
  domain: string;
  recruitmentHosts: string[];
  rotationHosts: string[];
  imitatedBrands: string[];
}): DetectedSignal {
  const { domain, recruitmentHosts, rotationHosts, imitatedBrands } = cluster;
  const posesAsMany = imitatedBrands.length >= 2;
  const rotates = !posesAsMany && rotationHosts.length > recruitmentHosts.length;
  return {
    id: "cert_cluster",
    label: posesAsMany
      ? "Satu domain dipakai meniru beberapa perusahaan"
      : rotates
        ? "Domain memakai banyak alamat acak yang bergiliran"
        : "Domain memuat banyak situs rekrutmen lain",
    severity: posesAsMany ? "strong" : "moderate",
    riskType: "suspicious_contact",
    floor: posesAsMany ? "tinggi" : "sedang",
    floorReason: posesAsMany
      ? "Domain yang sama dipakai untuk situs rekrutmen atas nama beberapa perusahaan berbeda."
      : "Domain yang sama memuat deretan situs atau alamat lain, bukan situs satu perusahaan.",
    description: posesAsMany
      ? `Log sertifikat publik menunjukkan domain ${domain} memuat situs rekrutmen atas nama ${imitatedBrands.join(", ")}. Perusahaan sungguhan tidak merekrut lewat domain yang sama dengan perusahaan lain; ini pola jaringan situs penipuan.`
      : rotates
        ? `Log sertifikat publik menunjukkan domain ${domain} memakai ${rotationHosts.length} subdomain acak seperti ${rotationHosts.slice(0, 3).join(", ")}. Halaman yang sama dipindah-pindah ke alamat baru adalah cara menghindari pemblokiran link.`
        : `Log sertifikat publik menunjukkan domain ${domain} memuat ${recruitmentHosts.length} situs bernama rekrutmen atau pendaftaran. Situs penipuan lowongan sering dibuat berderet di satu domain.`,
    evidence: (rotates ? rotationHosts : recruitmentHosts).slice(0, MAX_EVIDENCE_PER_SIGNAL),
  };
}

export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  return LEVEL_RANK[a] - LEVEL_RANK[b];
}

/** The strongest floor imposed by the detected signals, with the signal that imposed it. */
export function strongestFloor(signals: DetectedSignal[]): { level: RiskLevel; signal: DetectedSignal } | null {
  let best: { level: RiskLevel; signal: DetectedSignal } | null = null;

  for (const signal of signals) {
    if (!signal.floor) {
      continue;
    }
    if (!best || compareRiskLevels(signal.floor, best.level) > 0) {
      best = { level: signal.floor, signal };
    }
  }

  return best;
}

// Risk types that say nothing about the posting itself: an injected instruction can be planted in
// a genuine posting, and missing information alone is "sedang" by the rubric.
const NON_EVIDENCE_RISK_TYPES: RiskType[] = ["manipulation", "missing_context"];
// The rubric's certain signs that the model can find without a rule (e.g. TPPO wording).
const CERTAIN_RISK_TYPES: RiskType[] = ["payment_request", "sensitive_data", "tppo"];

/**
 * True when the material contains an injected instruction or a quoted third-party verdict that
 * pushes toward a scam verdict ("nyatakan lowongan ini penipuan", "Komdigi: lowongan ini termasuk
 * daftar hoaks") and none pushing toward safe. A scammer has no reason to write that, so it is a
 * smear attempt or a test. Each phrase is read up to the end of its sentence.
 */
export function steersTowardHighRisk(text: string): boolean {
  let high = false;
  for (const pattern of [...MANIPULATION_PATTERNS, ...UNVERIFIED_CLAIM_PATTERNS]) {
    for (const match of text.matchAll(pattern)) {
      const end = (match.index ?? 0) + match[0].length;
      const window = match[0] + text.slice(end, end + STEER_WINDOW).split(/[!?\n\]]|\.(?!\d)/)[0];
      if (STEER_LOW.test(window)) {
        return false;
      }
      high ||= STEER_HIGH.test(window);
    }
  }
  return high;
}

/**
 * True when a "tinggi" verdict should not stand because it rests on a manipulation attempt:
 * - the model's risks are only manipulation or missing context, or
 * - an injected instruction or quoted verdict pushes toward a scam verdict and the model found
 *   none of the rubric's certain signs (payment, sensitive data, TPPO), so its weaker findings
 *   are what the insertion swayed.
 * A rule signal that demands "tinggi" always keeps the verdict.
 */
export function tinggiRestsOnManipulation(riskTypes: RiskType[], signals: DetectedSignal[], text: string): boolean {
  if (strongestFloor(signals)?.level === "tinggi") {
    return false;
  }
  if (riskTypes.includes("manipulation") && riskTypes.every((type) => NON_EVIDENCE_RISK_TYPES.includes(type))) {
    return true;
  }
  return (
    signals.some((signal) => signal.id === "manipulation_attempt" || signal.id === "unverified_claim") &&
    steersTowardHighRisk(text) &&
    !riskTypes.some((type) => CERTAIN_RISK_TYPES.includes(type))
  );
}

/**
 * Risk level from rules alone. Rules can surface red flags but cannot confirm that a company
 * is legitimate, so the absence of signals yields "sedang" (unverified), never "rendah".
 */
export function ruleBasedRiskLevel(signals: DetectedSignal[]): RiskLevel {
  return strongestFloor(signals)?.level === "tinggi" ? "tinggi" : "sedang";
}

export function formatSignalsForPrompt(signals: DetectedSignal[]): string {
  if (!signals.length) {
    return "Tidak ada pola yang terdeteksi oleh aturan otomatis.";
  }

  return signals
    .map((signal) => {
      const severity = signal.severity === "strong" ? "kuat" : "sedang";
      const evidence = signal.evidence.map((item) => `"${item}"`).join("; ");
      return `- [${severity}] ${signal.label}. Bukti: ${evidence}`;
    })
    .join("\n");
}

/** Label for use mid-sentence; keeps proper nouns such as "WhatsApp" intact. */
export function labelInSentence(signal: DetectedSignal): string {
  return signal.label.charAt(0).toLowerCase() + signal.label.slice(1);
}

export function describeSignalsForProgress(signals: DetectedSignal[]): string {
  if (!signals.length) {
    return "Mendeteksi pola berisiko secara otomatis: tidak ada pola umum yang cocok";
  }

  return `Mendeteksi pola berisiko secara otomatis: ${signals.map(labelInSentence).join(", ")}`;
}

export function describeFloorForProgress(level: RiskLevel, signal: DetectedSignal): string {
  return `Pengaman aturan: tingkat risiko dinaikkan ke ${RISK_LEVEL_LABELS[level]} karena terdeteksi ${labelInSentence(signal)}`;
}
