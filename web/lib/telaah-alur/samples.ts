import type { Flow, ReadFacts } from "./questions";

// A typical story for each flow, with the answers it gives: fixtures for the rule tests, and demo
// messages for the chat ("saya sudah ...").
export const SAMPLE_STORIES: Partial<Record<Flow, { story: string; facts: ReadFacts }>> = {
  migran: {
    story:
      "Saya ditawari kerja jadi operator komputer di Kamboja oleh orang yang saya kenal di Facebook. Gajinya 12 juta per bulan. Katanya berangkat pakai visa turis dulu lewat Bangkok, nanti visa kerjanya diurus di sana. Tiket ditanggung sponsor tapi nanti dipotong dari gaji. Paspor dipegang sponsor biar aman. Saya disuruh tidak usah cerita ke orang tua dulu.",
    facts: {
      negara: { value: "kamboja", quote: "operator komputer di Kamboja" },
      pekerjaan: { value: "online", quote: "kerja jadi operator komputer" },
      visa: { value: "kunjungan", quote: "berangkat pakai visa turis dulu" },
      transit: { value: "ya", quote: "lewat Bangkok" },
      biaya: { value: ["potong_gaji"], quote: "Tiket ditanggung sponsor tapi nanti dipotong dari gaji" },
      dokumen_ditahan: { value: "ya", quote: "Paspor dipegang sponsor biar aman" },
      rahasia: { value: "ya", quote: "disuruh tidak usah cerita ke orang tua dulu" },
    },
  },
  domestik: {
    story:
      "Saya dapat tawaran kerja di pabrik di Kalimantan dari orang yang keliling di kampung. Katanya gaji 5 juta. Tiket kapal ditalangi dulu, nanti dipotong dari gaji. Ijazah asli harus diserahkan ke perusahaan sebagai jaminan. Sebelum mulai kerja kami tinggal di mess dulu dan HP dikumpulkan.",
    facts: {
      pekerjaan: { value: "pabrik", quote: "kerja di pabrik" },
      biaya: { value: ["transport", "potong_gaji"], quote: "Tiket kapal ditalangi dulu, nanti dipotong dari gaji" },
      dokumen_ditahan: { value: "ya", quote: "Ijazah asli harus diserahkan ke perusahaan sebagai jaminan" },
      penampungan: { value: "ya", quote: "tinggal di mess dulu dan HP dikumpulkan" },
    },
  },
  remote: {
    story:
      "Saya dichat di WhatsApp ditawari kerja paruh waktu dari rumah, tugasnya cuma like video dan kasih rating hotel, dibayar 50 ribu per tugas. Setelah 3 tugas pertama dibayar, saya dimasukkan ke grup Telegram dan disuruh top up 500 ribu dulu supaya bisa ambil tugas premium. Admin juga minta foto KTP dan selfie sambil pegang KTP untuk verifikasi.",
    facts: {
      pekerjaan: { value: "tugas_online", quote: "tugasnya cuma like video dan kasih rating hotel" },
      biaya: { value: ["deposit"], quote: "disuruh top up 500 ribu dulu supaya bisa ambil tugas premium" },
      data_pribadi: { value: ["ktp", "selfie_ktp"], quote: "minta foto KTP dan selfie sambil pegang KTP" },
      bayaran_tidak_wajar: { value: "ya", quote: "dibayar 50 ribu per tugas" },
    },
  },
  magang: {
    story:
      "Kampus saya bekerja sama dengan sebuah PT untuk program magang ke Jerman selama 3 bulan, katanya bisa dikonversi jadi SKS. Kami harus bayar biaya pendaftaran dan tiket, dan yang tidak punya uang bisa pakai dana talangan yang nanti dipotong dari gaji di sana. Kakak tingkat yang sudah berangkat cerita mereka malah kerja angkut barang di gudang, bukan magang sesuai jurusan.",
    facts: {
      negara: { value: "jerman", quote: "program magang ke Jerman" },
      biaya: { value: ["pendaftaran", "transport", "potong_gaji"], quote: "dana talangan yang nanti dipotong dari gaji di sana" },
      beda_pekerjaan: { value: "ya", quote: "mereka malah kerja angkut barang di gudang, bukan magang sesuai jurusan" },
    },
  },
};
