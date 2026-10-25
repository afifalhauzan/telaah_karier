"use client";

import { Copy, ExternalLink, Flag, Mail, MessageCircle } from "lucide-react";
import toast from "react-hot-toast";
import {
  mailtoLink,
  REPORT_CHANNELS,
  whatsappLink,
  type ReportDraft,
} from "@/lib/report-draft";

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Gagal menyalin. Salin manual dari draf di bawah.");
  }
}

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent";

/**
 * Where to report the posting, with the draft filled in. Email and WhatsApp open the user's own app;
 * the agencies' forms open in a new tab with the draft copied, since another site's form cannot be
 * filled from here.
 */
export function ReportCard({ draft }: { draft: ReportDraft }) {
  const openForm = (url: string) => {
    void copy(draft.body, "Draf disalin. Tempel di formulir yang terbuka.");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="rounded-xl border border-input bg-background p-4">
      <div className="flex items-start gap-2.5">
        <Flag className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {draft.toAgencies
              ? "Laporkan lowongan ini"
              : "Minta pemeriksa fakta mengecek"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {draft.toAgencies
              ? "Draf laporan sudah disusun dari hasil telaah. Periksa dulu sebelum mengirim; laporanmu membantu pemeriksa fakta dan instansi."
              : "Lowongan ini belum pasti palsu, jadi cukup minta dicek dulu. Draf permintaannya sudah disusun dari hasil telaah."}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Pemeriksa fakta
      </p>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <a
          className={BUTTON}
          href={mailtoLink(
            REPORT_CHANNELS.turnbackhoaxEmail,
            draft.subject,
            draft.body,
          )}
        >
          <Mail className="h-3.5 w-3.5 text-primary" aria-hidden />
          TurnBackHoax · Email
        </a>
        <a
          className={BUTTON}
          href={whatsappLink(REPORT_CHANNELS.turnbackhoaxWhatsapp, draft.body)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="h-3.5 w-3.5 text-primary" aria-hidden />
          TurnBackHoax · WhatsApp
        </a>
        <a
          className={BUTTON}
          href={whatsappLink(REPORT_CHANNELS.cekfaktaWhatsapp, draft.body)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="h-3.5 w-3.5 text-primary" aria-hidden />
          CekFakta · WhatsApp
        </a>
      </div>

      {draft.toAgencies && (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Instansi
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              className={BUTTON}
              onClick={() => openForm(REPORT_CHANNELS.kemnaker)}
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" aria-hidden />
              Kemnaker (Lapor Loker)
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => openForm(REPORT_CHANNELS.patroliSiber)}
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" aria-hidden />
              Patroli Siber Polri
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => openForm(REPORT_CHANNELS.lapor)}
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" aria-hidden />
              LAPOR!
            </button>
          </div>
        </>
      )}

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-primary">
          {draft.toAgencies
            ? "Lihat draf dan isian formulir Kemnaker"
            : "Lihat draf"}
        </summary>
        <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-sans text-xs leading-relaxed text-foreground">
          {draft.body}
        </pre>
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          onClick={() => void copy(draft.body, "Draf disalin.")}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Salin draf
        </button>
        <ul className={draft.toAgencies ? "mt-3 space-y-1.5" : "hidden"}>
          {draft.kemnakerFields
            .filter((field) => field.value)
            .map((field) => (
              <li
                key={field.label}
                className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-muted-foreground">
                    {field.label}
                  </span>
                  <span className="block whitespace-pre-wrap break-words text-foreground">
                    {field.value}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void copy(field.value, `${field.label} disalin.`)
                  }
                  aria-label={`Salin ${field.label}`}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
        </ul>
      </details>
    </section>
  );
}
