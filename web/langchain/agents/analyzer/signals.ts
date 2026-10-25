import { findLinks } from "../telaah-bersama/identifiers";
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
  | "new_domain"
  | "lookalike_domain"
  | "cert_cluster"
  | "known_scam_identity"
  | "form_secret"
  | "form_telegram"
  | "throwaway_subdomain"
  | "visa_non_work"
  | "non_placement_country"
  | "gambling_job"
  | "minor_recruitment"
  | "money_mule"
  | "document_holding"
  | "official_portal"
  | "official_denial";

export type SignalSeverity = "strong" | "moderate";

export interface DetectedSignal {
  id: SignalId;
  label: string;
  severity: SignalSeverity;
  riskType: RiskType;
  floor?: RiskLevel;
  floorReason?: string;
  // The law a "tinggi" floor rests on; every "tinggi" floor has one (docs/wiki/ai/07)
  legalBasis?: string;
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
  legalBasis?: string;
  description: string;
  patterns: RegExp[];
  // "before": only a negation word before the phrase; a waiver after it ("tiket ditanggung") is about fees
  negatable?: boolean | "before";
  // Only when the material shows no address at all: "klik link di bio" next to a real URL hides nothing.
  onlyWithoutUrl?: boolean;
}

// The laws a "tinggi" floor rests on. A pattern without one (a free domain, a paid like/follow task,
// a contact shared with a debunked case) is a reason to check, so it stops at "sedang".
export const LEGAL_BASIS = {
  fee: "UU 13/2003 Pasal 38 (pencari kerja tidak dipungut biaya penempatan); UU 18/2017 Pasal 30 (calon pekerja migran tidak dibebani biaya penempatan); KUHP Pasal 492 (penipuan)",
  access:
    "KUHP Pasal 332 (mengakses sistem elektronik orang lain tanpa hak, pengganti UU ITE Pasal 30); UU 27/2022 PDP Pasal 65 (memperoleh data pribadi orang lain secara melawan hukum)",
  impersonation: "KUHP Pasal 492 (penipuan dengan nama atau kedudukan palsu); UU ITE Pasal 35 (informasi elektronik dibuat seolah-olah otentik)",
  domain: "UU ITE Pasal 23 ayat (2) (nama domain wajib dipakai dengan iktikad baik dan tidak melanggar hak orang lain); UU 20/2016 Merek Pasal 100",
  migration:
    "UU 18/2017 Pasal 13 (calon pekerja migran wajib memiliki visa kerja) serta Pasal 69 dan 81 (penempatan di luar jalur resmi dipidana); KUHP Pasal 455 (perdagangan orang)",
  nonPlacement:
    "Kamboja, Myanmar, dan Thailand bukan negara penempatan pekerja migran Indonesia (KP2MI), sehingga penempatan ke sana nonprosedural menurut UU 18/2017 Pasal 69 dan 81; KUHP Pasal 455 (perdagangan orang)",
  gambling: "KUHP Pasal 426 (menyelenggarakan atau turut serta dalam usaha perjudian tanpa izin)",
  minor:
    "UU 18/2017 Pasal 5 huruf a (calon pekerja migran minimal 18 tahun); UU 13/2003 Pasal 74 (larangan pekerjaan terburuk bagi anak); UU 35/2014 Pasal 76I (eksploitasi anak)",
  mule: "UU 8/2010 TPPU Pasal 5 (menerima atau menguasai harta hasil tindak pidana, termasuk lewat rekening yang diserahkan ke orang lain)",
} as const;

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

// Abroad on a visa that does not allow work: the route the 2024-2026 online-scam compounds recruit by.
const VISA_NON_WORK_PATTERNS = [
  /\bvisa\s+(?:turis|turist|tourist|wisata|kunjungan|liburan|pelancong|ziarah|umroh|umrah|on\s+arrival|voa)\b/gi,
  /\bvisa\s+kerja\b[^.!?\n]{0,40}?\b(?:diurus|dibuat|diproses|menyusul)\b[^.!?\n]{0,25}?\b(?:di\s+sana|setelah\s+(?:tiba|sampai|berangkat)|di\s+negara\s+tujuan|nanti)\b/gi,
  /\bberangkat\b[^.!?\n]{0,25}?\b(?:sebagai|seperti)\s+(?:turis|wisatawan)\b/gi,
];

const NON_PLACEMENT_COUNTRY = String.raw`(?:kamboja|cambodia|phnom\s+penh|sihanoukville|myanmar|thailand|bangkok|pattaya)`;
const NON_PLACEMENT_COUNTRY_PATTERNS = [
  new RegExp(
    String.raw`\b(?:kerja|bekerja|penempatan|ditempatkan|berangkat|keberangkatan|lokasi|negara|lowongan|loker|work(?:ing)?|job|based)\b[^.!?\n]{0,40}?\b${NON_PLACEMENT_COUNTRY}\b`,
    "gi"
  ),
  new RegExp(String.raw`\b${NON_PLACEMENT_COUNTRY}\b[^.!?\n]{0,25}?\b(?:gaji|salary|usd)\b`, "gi"),
];

// Running online gambling, not a casino on a licensed cruise ship: "slot" alone is also "slot terbatas".
const GAMBLING_JOB_PATTERNS = [
  /\b(?:judi|slot|kasino|casino|togel|taruhan|betting)\s+(?:online|daring)\b/gi,
  /\b(?:situs|web(?:site)?|game|permainan|agen|bandar|operator|admin|cs|customer\s+service|telemarketing)\s+(?:judi|slot|togel|kasino|casino|taruhan|betting)\b/gi,
  /\bjudol\b/gi,
];

// Handing over or renting out a bank account, ATM card, or SIM card. "Kirim nomor rekening" for the
// salary is normal and does not match.
const MONEY_MULE_PATTERNS = [
  /\b(?:jual|beli|sewa|sewakan|menyewakan|pinjam(?:kan)?|meminjamkan)\s+(?:rekening|rek\b|kartu\s+atm|atm\b|buku\s+tabungan|akun\s+(?:bank|m-?banking|e-?wallet|dana|ovo|gopay))/gi,
  /\b(?:serahkan|menyerahkan|kirim(?:kan)?|mengirimkan|titip(?:kan)?|menitipkan)\s+(?:kartu\s+atm|atm\b|buku\s+tabungan|kartu\s+(?:sim|perdana)|sim\s?card)/gi,
  /\bbuka(?:kan)?\s+rekening\b[^.!?\n]{0,50}?\b(?:dibayar|bayaran|fee|komisi|imbalan|upah|rp\.?\s?\d)/gi,
  /\bjoki\s+rekening\b|\brekening\s+(?:dormant|bodong)\b/gi,
];

// Original documents kept by the employer as a guarantee; showing them at an interview is normal.
const NOT_WORD = String.raw`(?!\b(?:tidak|tdk|tanpa|bukan|tak)\b)`;
const DOCUMENT_HOLDING_PATTERNS = [
  new RegExp(
    String.raw`\b(?:ijazah|paspor|passport|bpkb|akta\s+kelahiran|buku\s+nikah|sertifikat)\s+asli\b(?:${NOT_WORD}[^.!?\n]){0,40}?\b(?:ditahan|disimpan|dititipkan|diserahkan|dijadikan\s+jaminan|sebagai\s+jaminan|jaminan)\b`,
    "gi"
  ),
  /\b(?:menyerahkan|serahkan|menitipkan|titipkan|menahan|ditahan|tahan)\s+(?:ijazah|paspor|passport|bpkb)\b/gi,
  /\b(?:ijazah|paspor|passport|bpkb)\b[^.!?\n]{0,20}?\bsebagai\s+jaminan\b/gi,
  /\bjaminan\s+(?:ijazah|paspor|bpkb)\b/gi,
];

// An applicant under 18, for work abroad or in nightlife: both are closed to children by law.
const UNDER_18 = /\b(?:usia|umur)\s*(?::|min(?:imal|\.)?|mulai|dari)?\s*1[3-7]\s*(?:-|–|s\.?\s?d\.?|sampai|hingga|\+|th\b|thn\b|tahun)/gi;
const ABROAD =
  /\b(?:luar\s+negeri|malaysia|singapura|singapore|hong\s?kong|taiwan|jepang|japan|korea|saudi|dubai|uea|qatar|kuwait|brunei|kamboja|cambodia|myanmar|thailand|eropa|polandia|turki|australia|abroad|overseas)\b/gi;
const NIGHTLIFE =
  /\b(?:pemandu\s+lagu|purel|lady\s+companion|karaoke|diskotik|diskotek|klub\s+malam|club\s+malam|hiburan\s+malam|tempat\s+hiburan|bar|pub|panti\s+pijat|pijat|massage|spa|dancer|penari|hostes|hostess)\b/gi;

// Programs whose registration opens on one portal only; a sign-up page elsewhere is not theirs.
const OFFICIAL_PROGRAMS = [
  {
    name: "Program Magang Nasional",
    claim: /\b(?:program\s+)?magang\s+(?:nasional|kemnaker|kemenaker|kementerian\s+ketenagakerjaan)\b|\bmagang\s?hub\b/i,
    portal: "maganghub.kemnaker.go.id",
    domains: ["go.id"],
  },
  {
    name: "seleksi CPNS/PPPK",
    claim: /\b(?:CPNS|PPPK|CASN|SSCASN|seleksi\s+ASN|penerimaan\s+ASN)\b/i,
    portal: "sscasn.bkn.go.id",
    domains: ["go.id"],
  },
  {
    name: "Rekrutmen Bersama BUMN",
    claim: /\brekrutmen\s+bersama\s+BUMN\b|\bRBB\s+BUMN\b|\bFHCI\b/i,
    portal: "portal FHCI (fhcibumn.id)",
    domains: ["fhcibumn.id", "bumn.go.id"],
  },
];
// Hosts that are no registration page of their own: profiles, chats, and shorteners (resolved apart)
const NOT_A_SIGN_UP_HOST =
  /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|threads\.net|linkedin\.com|wa\.me|whatsapp\.com|t\.me|bit\.ly|s\.id|tinyurl\.com|cutt\.ly|shorturl\.at|rb\.gy|t\.ly|is\.gd|ow\.ly|bit\.do|forms\.gle|lnkd\.in|linktr\.ee)$/;
// A link the material presents as the way to sign up, not one it cites: the word sits in its sentence
const SIGN_UP_WORD = /\b(?:daftar|pendaftaran|registrasi|formulir|form|apply|link|tautan|klik)\b/i;

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
    legalBasis: LEGAL_BASIS.fee,
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
    legalBasis: LEGAL_BASIS.access,
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
    severity: "moderate",
    riskType: "suspicious_contact",
    floor: "sedang",
    floorReason: "Perusahaan dan instansi resmi tidak membuka pendaftaran di hosting gratis atau domain sekali pakai.",
    description:
      "Link pendaftaran berada di hosting gratis atau domain murah sekali pakai (misalnya vercel.app, my.id, .xyz), bukan domain resmi perusahaan atau instansi.",
    patterns: UNOFFICIAL_DOMAIN_PATTERNS,
  },
  {
    // The task itself breaks no law; the deposit it leads to does, and fee_request catches that.
    id: "paid_task",
    label: "Tugas online berbayar (like/follow/subscribe)",
    severity: "moderate",
    riskType: "payment_request",
    floor: "sedang",
    floorReason: "Pekerjaan berupa tugas like/follow/subscribe berbayar adalah pola penipuan yang biasanya berujung permintaan deposit.",
    description:
      "Pekerjaan berupa tugas like/follow/subscribe atau penghasilan harian yang dijamin. Pola ini biasanya berujung permintaan deposit untuk \"tugas premium\".",
    patterns: PAID_TASK_PATTERNS,
    negatable: true,
  },
  {
    id: "visa_non_work",
    label: "Kerja ke luar negeri dengan visa turis atau kunjungan",
    severity: "strong",
    riskType: "tppo",
    floor: "tinggi",
    floorReason: "Bekerja di luar negeri wajib memakai visa kerja; keberangkatan dengan visa turis adalah jalur nonprosedural yang dipakai perekrut TPPO.",
    legalBasis: LEGAL_BASIS.migration,
    description:
      "Pelamar diberangkatkan dengan visa turis atau kunjungan, atau visa kerjanya dijanjikan diurus belakangan. Pekerja migran resmi berangkat dengan visa kerja lewat P3MI berizin.",
    patterns: VISA_NON_WORK_PATTERNS,
    negatable: "before",
  },
  {
    id: "non_placement_country",
    label: "Penempatan kerja ke Kamboja, Myanmar, atau Thailand",
    severity: "strong",
    riskType: "tppo",
    floor: "tinggi",
    floorReason: "Kamboja, Myanmar, dan Thailand bukan negara penempatan resmi pekerja migran Indonesia.",
    legalBasis: LEGAL_BASIS.nonPlacement,
    description:
      "Lowongan menempatkan pekerja di Kamboja, Myanmar, atau Thailand. Pemerintah tidak membuka penempatan resmi ke negara-negara itu, dan ribuan WNI direkrut ke sana untuk sindikat penipuan daring.",
    patterns: NON_PLACEMENT_COUNTRY_PATTERNS,
    negatable: "before",
  },
  {
    id: "gambling_job",
    label: "Pekerjaan untuk situs judi online",
    severity: "strong",
    riskType: "tppo",
    floor: "tinggi",
    floorReason: "Menjalankan atau membantu usaha judi online adalah tindak pidana.",
    legalBasis: LEGAL_BASIS.gambling,
    description:
      "Pekerjaannya untuk situs judi online (operator, admin, atau CS situs judi/slot). Pekerjaan ini melanggar hukum dan sering dipakai sindikat luar negeri untuk menjerat pekerja.",
    patterns: GAMBLING_JOB_PATTERNS,
    negatable: "before",
  },
  {
    id: "money_mule",
    label: "Diminta menyerahkan atau menyewakan rekening, ATM, atau kartu SIM",
    severity: "strong",
    riskType: "sensitive_data",
    floor: "tinggi",
    floorReason: "Rekening atau kartu ATM yang diserahkan ke orang lain dipakai menampung uang hasil kejahatan, dan pemiliknya ikut terjerat.",
    legalBasis: LEGAL_BASIS.mule,
    description:
      "Pelamar diminta menjual, menyewakan, atau menyerahkan rekening, kartu ATM, buku tabungan, atau kartu SIM. Rekening seperti ini dipakai menampung uang penipuan dan judi online.",
    patterns: MONEY_MULE_PATTERNS,
    negatable: "before",
  },
  {
    // A ministerial circular, not a law with a sanction of its own, so it stops at "sedang"
    id: "document_holding",
    label: "Ijazah atau dokumen asli ditahan sebagai jaminan",
    severity: "moderate",
    riskType: "sensitive_data",
    floor: "sedang",
    floorReason: "Pemberi kerja dilarang menahan ijazah dan dokumen pribadi pekerja (SE Menaker M/5/HK.04.00/V/2025).",
    description:
      "Pelamar diminta menyerahkan ijazah, paspor, atau dokumen asli lain sebagai jaminan. Pemberi kerja dilarang menahannya, dan paspor yang ditahan membuat pekerja tidak bisa pergi.",
    patterns: DOCUMENT_HOLDING_PATTERNS,
    negatable: "before",
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
  legalBasis: LEGAL_BASIS.impersonation,
  description:
    "Materi mengatasnamakan instansi pemerintah, BUMN, atau perusahaan terbuka, tetapi kontaknya email gratis atau nomor WhatsApp pribadi yang bukan kanal resmi mereka.",
} as const satisfies Omit<DetectedSignal, "evidence">;

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
function isNegated(text: string, start: number, end: number, beforeOnly = false): boolean {
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
  return !beforeOnly && NEGATION_AFTER.test(clauseAfter);
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
  { negatable = false, excluded }: { negatable?: boolean | "before"; excluded?: (start: number, end: number) => boolean } = {}
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
        if (continuesNegatedList || isNegated(text, start, end, negatable === "before")) {
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
  const { id, label, severity, riskType, floor, floorReason, legalBasis, description } = rule;
  return { id, label, severity, riskType, floor, floorReason, legalBasis, description, evidence };
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

/** An applicant under 18 for work abroad or in nightlife, with both pieces as evidence. */
function detectMinorRecruitment(text: string): DetectedSignal | null {
  const age = collectEvidence(text, [UNDER_18], { negatable: "before" }).slice(0, 1);
  const place = age.length ? collectEvidence(text, [ABROAD, NIGHTLIFE]).slice(0, 1) : [];
  return age.length && place.length
    ? {
        id: "minor_recruitment",
        label: "Merekrut pelamar di bawah 18 tahun untuk kerja ke luar negeri atau hiburan malam",
        severity: "strong",
        riskType: "tppo",
        floor: "tinggi",
        floorReason: "Anak di bawah 18 tahun tidak boleh ditempatkan bekerja ke luar negeri maupun di tempat hiburan.",
        legalBasis: LEGAL_BASIS.minor,
        description:
          "Lowongan menerima pelamar di bawah 18 tahun untuk kerja ke luar negeri atau di tempat hiburan malam. Keduanya tertutup bagi anak menurut hukum, dan pola ini dipakai perekrut TPPO.",
        evidence: [...age, ...place],
      }
    : null;
}

/**
 * A program that registers on one portal only (Magang Nasional, CPNS, Rekrutmen Bersama BUMN),
 * signed up for elsewhere: a sign-up link in the text, or a form or chat the trail reached.
 */
export function detectPortalMismatch(text: string, signUpUrls: string[] = []): DetectedSignal | null {
  const program = OFFICIAL_PROGRAMS.find((item) => item.claim.test(text));
  if (!program) {
    return null;
  }
  const withoutEmails = text.replace(EMAIL, " ");
  const presented = findLinks(withoutEmails).filter((url) => {
    const at = withoutEmails.indexOf(url.replace(/^https:\/\//, ""));
    const sentence = withoutEmails.slice(Math.max(0, at - 60), at).split(/[.!?]\s|\n/).pop() ?? "";
    return at >= 0 && SIGN_UP_WORD.test(sentence);
  });
  const outside = [...presented, ...signUpUrls]
    .map(hostOf)
    .find((host) => host && !NOT_A_SIGN_UP_HOST.test(host) && !program.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
  return outside
    ? {
        id: "official_portal",
        label: `Pendaftaran ${program.name} di luar portal resminya`,
        severity: "strong",
        riskType: "suspicious_contact",
        floor: "tinggi",
        floorReason: `Pendaftaran ${program.name} hanya dibuka di ${program.portal}; pendaftaran di alamat lain bukan bagian dari program itu.`,
        legalBasis: LEGAL_BASIS.impersonation,
        description: `Materi mengatasnamakan ${program.name}, tetapi pendaftarannya di ${outside}, padahal pendaftaran resminya hanya di ${program.portal}.`,
        evidence: [outside],
      }
    : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function detectSignals(text: string, { signUpUrls = [] }: { signUpUrls?: string[] } = {}): DetectedSignal[] {
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
  const minor = detectMinorRecruitment(text);
  if (minor) {
    signals.push(minor);
  }
  const portal = detectPortalMismatch(text, signUpUrls);
  if (portal) {
    signals.push(portal);
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
    legalBasis: LEGAL_BASIS.domain,
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
    // No law makes a row of sites a scam by itself, so even posing as many brands stops at "sedang"
    severity: "moderate",
    riskType: "suspicious_contact",
    floor: "sedang",
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

/**
 * From the knowledge base rather than the text: a phone, account, domain, or spreading account in
 * the posting already appears in a job scam a fact-checker debunked. Likely the same operation again,
 * but a number can be recycled or reused by someone else, and no law makes a shared contact a scam by
 * itself, so it is shown to the user to verify and lifts the verdict to "sedang" at most.
 */
export function knownScamSignal({ identifier, caseCount, entities }: { identifier: string; caseCount: number; entities: string[] }): DetectedSignal {
  const impersonated = entities.length ? `, atas nama ${entities.slice(0, 4).join(", ")}` : "";
  return {
    id: "known_scam_identity",
    label: "Identitas yang sama sudah dinyatakan penipuan oleh pemeriksa fakta",
    severity: "moderate",
    riskType: "suspicious_contact",
    floor: "sedang",
    floorReason: "Kontak atau akun di materi ini tercatat dalam lowongan palsu yang dibongkar pemeriksa fakta; cocokkan sendiri kasusnya.",
    description: `${identifier[0].toUpperCase()}${identifier.slice(1)} di materi ini tercatat di ${caseCount} kasus penipuan lowongan yang sudah diverifikasi pemeriksa fakta${impersonated}. Penipu memakai ulang kontak dan akun yang sama untuk lowongan palsu berikutnya.`,
    evidence: [identifier],
  };
}

/**
 * From the registration trail: the form the posting leads to asks for a verification code, a
 * password, or a selfie with the ID card. Fact-checks of 2025-2026 describe this as the takeover of
 * the applicant's Telegram account.
 */
export function formSecretSignal(url: string, asks: string[]): DetectedSignal {
  return {
    id: "form_secret",
    label: "Formulir pendaftaran meminta kode verifikasi, kata sandi, atau foto KTP",
    severity: "strong",
    riskType: "sensitive_data",
    floor: "tinggi",
    floorReason: "Rekrutmen resmi tidak pernah meminta kode verifikasi atau kata sandi pelamar.",
    legalBasis: LEGAL_BASIS.access,
    description: `Formulir di ${url} meminta ${asks.join(", ")}. Kode verifikasi dan kata sandi membuka akun pelamar (misalnya Telegram) bagi pihak lain.`,
    evidence: [url],
  };
}

/** From the trail: the form asks for the applicant's Telegram number, the most common 2026 pattern. */
export function telegramFormSignal(url: string): DetectedSignal {
  return {
    id: "form_telegram",
    label: "Formulir pendaftaran meminta nomor Telegram",
    severity: "moderate",
    riskType: "sensitive_data",
    floor: "sedang",
    floorReason: "Formulir lowongan palsu 2025-2026 meminta nomor Telegram, lalu kode verifikasinya untuk mengambil alih akun.",
    description: `Formulir di ${url} meminta nomor Telegram. Rekrutmen resmi memakai email atau nomor ponsel, bukan akun Telegram pelamar.`,
    evidence: [url],
  };
}

/**
 * A recruitment site on a long made-up subdomain of an unknown domain
 * ("rekrutmenbersamaskkmigasdankkks.piillly.com", "infolowonganbnn2024.iiaall.com"): the shape of
 * the addresses written in job scams the fact-checkers recorded.
 */
export function throwawaySubdomainSignal(host: string): DetectedSignal {
  return {
    id: "throwaway_subdomain",
    label: "Situs pendaftaran di subdomain panjang domain tak dikenal",
    severity: "moderate",
    riskType: "suspicious_contact",
    floor: "sedang",
    floorReason: "Perusahaan merekrut lewat domainnya sendiri, bukan subdomain buatan di domain lain.",
    description: `Alamat ${host} berupa nama rekrutmen panjang di atas domain yang tidak terkait perusahaan mana pun, pola yang sering dipakai situs lowongan palsu.`,
    evidence: [host],
  };
}

/**
 * From the company's own site: it states it never charges applicants or recruits over a channel the
 * posting uses. The posting then speaks in a name that is not its own.
 */
export function officialDenialSignal({ company, url, quote, conflict, fee }: { company: string; url: string; quote: string; conflict: string; fee: boolean }): DetectedSignal {
  return {
    id: "official_denial",
    label: `Pernyataan resmi ${company} membantah cara rekrutmen di materi`,
    severity: "strong",
    riskType: fee ? "payment_request" : "suspicious_contact",
    floor: "tinggi",
    floorReason: `Situs resmi ${company} menyatakan tidak pernah merekrut dengan cara yang dipakai materi ini.`,
    // A denied fee is also the posting's fee_request, which carries the fee laws
    legalBasis: LEGAL_BASIS.impersonation,
    description: `Situs resmi ${company} menyatakan "${quote}", sedangkan materi ini ${conflict}. Lowongan ini memakai nama ${company} tanpa mengikuti cara rekrutmen resminya.`,
    evidence: [url],
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
      const law = signal.legalBasis ? ` Dasar hukum: ${signal.legalBasis}.` : "";
      return `- [${severity}] ${signal.label}. Bukti: ${evidence}.${law}`;
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
