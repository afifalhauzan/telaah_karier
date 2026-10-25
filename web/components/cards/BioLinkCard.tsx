"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BioLink } from "@/langchain/agents/analyzer/schema";
import { findLinks } from "@/langchain/agents/telaah-bersama/identifiers";

const PLATFORM_NAMES = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;

// Where each app keeps the profile link and its "copy link" button
const STEPS: Record<keyof typeof PLATFORM_NAMES | "other", string[]> = {
  instagram: ["Ketuk link di bawah bio. Jika ada beberapa, pilih yang untuk pendaftaran.", "Di halaman yang terbuka, ketuk ⋯ di pojok kanan atas, lalu Salin link."],
  tiktok: ["Ketuk link di bawah bio.", "Di halaman yang terbuka, ketuk ⋯ atau ikon bagikan, lalu Salin link."],
  facebook: ["Buka bagian Intro atau Tentang, lalu ketuk link situs webnya.", "Di halaman yang terbuka, ketuk ⋯, lalu Salin link."],
  other: ["Ketuk link di bio atau tombol daftarnya.", "Di halaman yang terbuka, salin alamatnya lewat menu ⋯ atau bagikan."],
};

interface BioLinkCardProps {
  bioLink: BioLink;
  // Absent on a message whose turn has passed: the card then only shows the steps
  onSubmit?: (url: string) => void;
}

/** Asks the applicant for the link only they can see, and sends it to be traced. */
export function BioLinkCard({ bioLink, onSubmit }: BioLinkCardProps) {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const platform = bioLink.platform ? PLATFORM_NAMES[bioLink.platform] : null;
  const account = bioLink.handle ? `@${bioLink.handle}` : "akun yang mengunggah lowongan ini";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [url] = findLinks(value);
    if (!url) {
      setInvalid(true);
      return;
    }
    onSubmit?.(url);
  };

  return (
    <section className="rounded-xl border-2 border-sky-300 bg-sky-50/60 p-4 shadow-sm dark:border-sky-800 dark:bg-sky-950/30">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">Link pendaftarannya ada di bio, salin ke sini</p>
          <p className="text-sm leading-relaxed text-foreground">
            Link di bio hanya bisa dibuka dari aplikasi yang sudah login, jadi sistem belum bisa membacanya. Salin link-nya agar
            ditelusuri sampai ke formulir atau chat tujuannya.
          </p>
        </div>
      </div>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground">
        <li>
          Buka profil {account}
          {platform ? ` di aplikasi ${platform}` : ""}.
        </li>
        {STEPS[bioLink.platform ?? "other"].map((step) => (
          <li key={step}>{step}</li>
        ))}
        <li>Tempel link-nya di bawah. Jangan isi formulirnya dulu.</li>
      </ol>

      {onSubmit ? (
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <Input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
            placeholder="https://…"
            aria-label="Link dari bio"
            aria-invalid={invalid}
            inputMode="url"
          />
          <Button type="submit" size="sm" className="shrink-0">
            Telusuri
          </Button>
        </form>
      ) : null}
      {invalid ? <p className="mt-1 text-xs text-red-600">Tempel alamat link-nya, misalnya https://bit.ly/…</p> : null}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Tidak bisa disalin? Kirim screenshot halaman yang terbuka setelah link diketuk.</p>
    </section>
  );
}
