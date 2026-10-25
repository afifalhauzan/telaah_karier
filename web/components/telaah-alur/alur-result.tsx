"use client";

import React from "react";
import toast from "react-hot-toast";
import { AlertOctagon, CircleAlert, CircleCheck, ExternalLink, Info, Phone, Scale, Share2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/utils";
import type { AlurResult, Contact, Finding, Severity } from "@/lib/telaah-alur/rules";

const STATUS = {
  pelanggaran: {
    icon: AlertOctagon,
    title: "Ada pelanggaran prosedur atau pola berbahaya",
    advice: "Hentikan dulu prosesnya: jangan membayar, jangan menyerahkan dokumen asli, dan hubungi pihak di bawah.",
    className: "border-red-200 bg-red-50 text-red-900",
    iconClassName: "bg-red-600",
  },
  pastikan: {
    icon: CircleAlert,
    title: "Ada yang perlu dipastikan",
    advice: "Belum tentu berbahaya, tetapi pastikan hal-hal di bawah sebelum melangkah lebih jauh.",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    iconClassName: "bg-amber-500",
  },
  belum_ditemukan: {
    icon: ShieldCheck,
    title: "Belum ditemukan pelanggaran sejauh ini",
    advice: "Ini pemeriksaan awal dari jawabanmu, bukan jaminan aman. Periksa ulang jika ada perubahan dalam prosesnya.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconClassName: "bg-emerald-600",
  },
} as const;

const SEVERITY: Record<Severity, { label: string; icon: typeof CircleAlert; className: string }> = {
  bahaya: { label: "Bahaya", icon: AlertOctagon, className: "border-l-red-500 [&_[data-badge]]:bg-red-50 [&_[data-badge]]:text-red-700" },
  pastikan: { label: "Perlu dipastikan", icon: CircleAlert, className: "border-l-amber-400 [&_[data-badge]]:bg-amber-50 [&_[data-badge]]:text-amber-800" },
  info: { label: "Info", icon: Info, className: "border-l-sky-400 [&_[data-badge]]:bg-sky-50 [&_[data-badge]]:text-sky-800" },
};

function FindingCard({ finding }: { finding: Finding }) {
  const style = SEVERITY[finding.severity];
  return (
    <li className={cn("rounded-xl border border-border border-l-4 bg-card p-4", style.className)}>
      <span data-badge className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium">
        {style.label}
      </span>
      <p className="mt-2 text-sm font-semibold text-foreground">{finding.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground/90">{finding.explanation}</p>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {finding.basis}
      </p>
    </li>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{contact.name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{contact.description}</p>
      </div>
      {contact.actions.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {contact.actions.map((action) => (
            <Button key={action.href} asChild size="sm" variant="outline">
              <a href={action.href} target={action.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {action.href.startsWith("http") ? <ExternalLink /> : <Phone />}
                {action.label}
              </a>
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

/** The result as plain text, for the family share. */
function summaryText(result: AlurResult): string {
  return [
    `Hasil TelaahAlur: ${STATUS[result.status].title}.`,
    ...result.findings.map((finding) => `- [${SEVERITY[finding.severity].label}] ${finding.title}`),
    "",
    "Hubungi:",
    ...result.contacts.map((contact) => `- ${contact.name}${contact.actions[0] ? `: ${contact.actions[0].label}` : ""}`),
    "",
    "Dicek dengan TelaahKarier (telaahkarier.com). Ini pemeriksaan awal, bukan vonis.",
  ].join("\n");
}

export function AlurResultView({
  result,
  onEdit,
  onRestart,
}: {
  result: AlurResult;
  onEdit?: () => void;
  onRestart: () => void;
}) {
  const status = STATUS[result.status];
  const StatusIcon = status.icon;
  const contactsFirst = result.status === "pelanggaran";
  // Several results can sit in one chat, so headings need ids of their own
  const id = React.useId();

  const share = async () => {
    const text = summaryText(result);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Hasil TelaahAlur", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Hasil disalin. Tempel di chat keluargamu.");
      }
    } catch {
      // Closing the share sheet is not an error
    }
  };

  const contacts = (
    <section aria-labelledby={`${id}-kontak`} className="space-y-2">
      <h2 id={`${id}-kontak`} className="text-sm font-semibold text-foreground">
        {contactsFirst ? "Hubungi sekarang" : "Pihak yang bisa dihubungi"}
      </h2>
      <ul className="space-y-2">
        {result.contacts.map((contact) => (
          <ContactCard key={contact.id} contact={contact} />
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 rounded-xl border p-4", status.className)}>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", status.iconClassName)}>
          <StatusIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-base font-bold leading-snug">{status.title}</p>
          <p className="mt-1 text-sm leading-relaxed opacity-90">{status.advice}</p>
        </div>
      </div>

      {contactsFirst && contacts}

      {result.findings.length > 0 && (
        <section aria-labelledby={`${id}-temuan`} className="space-y-2">
          <h2 id={`${id}-temuan`} className="text-sm font-semibold text-foreground">
            Temuan ({result.findings.length})
          </h2>
          <ul className="space-y-2">
            {result.findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-langkah`} className="rounded-xl border border-border bg-card p-4">
        <h2 id={`${id}-langkah`} className="text-sm font-semibold text-foreground">
          Langkah aman sekarang
        </h2>
        <ul className="mt-2 space-y-1.5">
          {result.safeSteps.map((step) => (
            <li key={step} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {step}
            </li>
          ))}
        </ul>
      </section>

      {!contactsFirst && contacts}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button onClick={share}>
          <Share2 />
          Bagikan ke keluarga
        </Button>
        {onEdit && (
          <Button variant="outline" onClick={onEdit}>
            Ubah jawaban
          </Button>
        )}
        <Button variant="ghost" onClick={onRestart}>
          Mulai lagi
        </Button>
      </div>
    </div>
  );
}
