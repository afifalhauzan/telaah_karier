"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  EyeOff,
  Flag,
  HandHelping,
  Link2,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { ProtectedTopNavbar } from "@/components/protected-top-navbar";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { RiskCard } from "@/components/cards/RiskCard";
import { ReportCard } from "@/components/cards/ReportCard";
import { buildReportDraft } from "@/lib/report-draft";
import { ModusBadge, RiskLevelBadge, SeedBadge } from "@/components/telaah-bersama/badges";
import { ReactionButton } from "@/components/telaah-bersama/reaction-button";
import { Discussion } from "@/components/telaah-bersama/discussion";
import { ReportModal } from "@/components/telaah-bersama/report-modal";
import { PostAttachment } from "@/components/telaah-bersama/post-attachment";
import { EditPostModal } from "@/components/telaah-bersama/edit-post-modal";
import { LoginPromptHost, useLoginPrompt } from "@/components/telaah-bersama/login-prompt";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { deletePost, getPost } from "@/lib/telaah-bersama/api";
import {
  CONTACT_LABELS,
  attachmentUrl,
  formatDate,
  formatPeriod,
  formatRelative,
  type TelaahContact,
  type TelaahPost,
} from "@/lib/telaah-bersama/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function ContactRow({ contact }: { contact: TelaahContact }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contact.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the value is still visible to copy by hand.
    }
  };

  return (
    <li className="flex items-start justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{CONTACT_LABELS[contact.kind]}</p>
        <p className="break-words text-sm font-medium text-foreground">{contact.value}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Salin ${CONTACT_LABELS[contact.kind]}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

function NewPostBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("baru") !== "1") return null;

  return (
    <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Telaahmu sudah terbit. Terima kasih sudah membantu orang lain waspada.</p>
        <p className="mt-1 text-emerald-900/80">Kamu bisa menyunting atau menghapus Telaah ini kapan saja.</p>
      </div>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ProtectedTopNavbar />
      {children}
      <LoginPromptHost />
    </div>
  );
}

export default function TelaahDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const openLoginPrompt = useLoginPrompt((state) => state.open);
  const [post, setPost] = React.useState<TelaahPost | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getPost(params.id)
      .then((result) => !cancelled && setPost(result))
      .catch((error) => !cancelled && setLoadError(error instanceof Error ? error.message : "Telaah gagal dimuat."));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (!post) {
    return (
      <PageShell>
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">{loadError ?? "Memuat Telaah…"}</p>
          {loadError && (
            <Link href="/telaah-bersama" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Kembali ke TelaahBareng
            </Link>
          )}
        </main>
      </PageShell>
    );
  }

  const isOwner = post.viewer.isOwner;
  const comments = post.comments ?? [];
  const period = formatPeriod(post.openDate, post.closeDate);
  const details = [
    { label: "Perusahaan / instansi", value: post.company },
    { label: "Posisi", value: post.position },
    { label: "Lokasi", value: post.location },
    { label: "Gaji", value: post.salary },
    { label: "Periode pendaftaran", value: period },
    { label: "Sumber lowongan", value: [post.source.platform, post.source.account].filter(Boolean).join(" · ") },
  ].filter((item) => item.value);

  const handleDelete = async () => {
    try {
      await deletePost(post.id);
      toast.success("Telaah dihapus.");
      router.push("/telaah-bersama");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Telaah gagal dihapus.");
    }
  };

  return (
    <PageShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Link
          href="/telaah-bersama"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          TelaahBareng
        </Link>

        <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0 space-y-6">
            <React.Suspense fallback={null}>
              <NewPostBanner />
            </React.Suspense>

            {post.status === "hidden_pending_edit" && (
              <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Telaah ini disembunyikan dari publik karena laporan data pribadi terkonfirmasi. Sunting dan hapus bagian
                  yang memuat NIK atau kode, lalu simpan agar tampil lagi.
                </p>
              </div>
            )}

            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <RiskLevelBadge level={post.riskLevel} />
                <ModusBadge modus={post.modus} />
                {post.isSeed && <SeedBadge />}
                {post.spamReports > 0 && (
                  <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    Dilaporkan sebagai spam ({post.spamReports})
                  </span>
                )}
              </div>
              <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                <span className="text-muted-foreground">Telaah #{post.id} · </span>
                {post.title}
              </h1>
              <p className="text-xs text-muted-foreground">
                Dibagikan oleh <span className="text-foreground">{post.author}</span> · {formatRelative(post.createdAt)}
              </p>
            </header>

            {/* The level is the badge above and the reasons are in Ringkasan, so the claim is not repeated */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Dinilai otomatis pada {formatDate(post.analyzedAt)}. Ini penilaian awal, bukan vonis; cocokkan dengan kanal
                resmi perusahaan.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {isOwner ? (
                  // The owner cannot mark their own post; they see how many others did
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
                    <HandHelping className="h-4 w-4 text-primary" />
                    <span>
                      <span className="font-semibold text-foreground">{post.reactionCount}</span> orang juga menerima ini
                    </span>
                  </span>
                ) : (
                  <ReactionButton
                    post={post}
                    isSignedIn={!!user}
                    onChange={({ reacted, reactionCount }) =>
                      setPost((current) => current && { ...current, reactionCount, viewer: { ...current.viewer, reacted } })
                    }
                  />
                )}
                {isOwner ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditOpen(true)} className="text-muted-foreground">
                      <Pencil />
                      Sunting
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsDeleteOpen(true)} className="text-muted-foreground">
                      <Trash2 />
                      Hapus
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (user ? setIsReportOpen(true) : openLoginPrompt("Masuk untuk melaporkan Telaah ini."))}
                    disabled={post.viewer.reported}
                    className="text-muted-foreground"
                  >
                    <Flag />
                    {post.viewer.reported ? "Sudah dilaporkan" : "Laporkan"}
                  </Button>
                )}
              </div>
            </div>

            <Section title="Ringkasan">
              <p className="text-sm leading-relaxed text-foreground">{post.summary}</p>
            </Section>

            {post.evidence.length > 0 && (
              <Section title="Bukti dari telaah">
                <div className="space-y-2">
                  {post.evidence.map((item, index) => (
                    <RiskCard key={index} type={item.type} description={item.description} evidence={item.evidence ?? undefined} />
                  ))}
                </div>
              </Section>
            )}

            <Section title="Materi lowongan">
              <div className="space-y-1 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
                {post.materialLines.map((line, index) => (
                  <p key={index} className="break-words">
                    {line}
                  </p>
                ))}
              </div>
            </Section>

            {post.story && (
              <Section title={`Cerita ${post.author}`}>
                <p className="whitespace-pre-wrap rounded-xl border-l-2 border-primary/40 bg-card py-1 pl-4 text-sm italic leading-relaxed text-foreground">
                  {post.story}
                </p>
              </Section>
            )}

            {post.attachments.length > 0 && (
              <Section title="Lampiran">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {post.attachments.map((attachment) => (
                    <PostAttachment key={attachment.id} url={attachmentUrl(attachment)} label={attachment.label} />
                  ))}
                </div>
              </Section>
            )}

            {post.links.length > 0 && (
              <Section title="Link di materi">
                <ul className="space-y-1.5">
                  {post.links.map((link) => (
                    <li key={link} className="flex items-center gap-2 text-sm text-foreground">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="break-all">{link}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Link ditampilkan sebagai teks dan tidak bisa diklik. Jangan membuka atau mengisi data di link ini.
                </p>
              </Section>
            )}

            <ReportCard
              draft={buildReportDraft({
                level: post.riskLevel,
                company: post.company,
                findings: post.evidence.map((item) => item.description),
                phones: post.contacts.filter((contact) => contact.kind === "phone").map((contact) => contact.value),
                emails: post.contacts.filter((contact) => contact.kind === "email").map((contact) => contact.value),
                links: post.links,
                posting: post.materialLines.join("\n"),
              })}
            />

            <div className="border-t border-border pt-6">
              <Discussion
                postId={post.id}
                comments={comments}
                viewerName={user ? user.pseudonym ?? "kamu" : null}
                onAdded={(comment) =>
                  setPost(
                    (current) =>
                      current && {
                        ...current,
                        commentCount: current.commentCount + 1,
                        comments: [...(current.comments ?? []), comment],
                      }
                  )
                }
                onChanged={(changed) =>
                  setPost(
                    (current) =>
                      current && {
                        ...current,
                        comments: (current.comments ?? []).map((comment) => (comment.id === changed.id ? changed : comment)),
                      }
                  )
                }
                // The server decides whether a placeholder stays, so the thread is reloaded as it now is
                onDeleted={() =>
                  getPost(post.id)
                    .then(setPost)
                    .catch(() => toast.error("Diskusi gagal dimuat ulang. Muat ulang halaman."))
                }
              />
            </div>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {details.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground">Info lowongan</h2>
                <dl className="mt-2 divide-y divide-border">
                  {details.map((item) => (
                    <div key={item.label} className="py-2">
                      <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                      <dd className="text-sm text-foreground">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {post.contacts.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground">Kontak di lowongan</h2>
                <p className="mt-1 text-xs text-muted-foreground">Cocokkan dengan nomor atau rekening yang menghubungimu.</p>
                <ul className="mt-1 divide-y divide-border">
                  {post.contacts.map((contact) => (
                    <ContactRow key={`${contact.kind}-${contact.value}`} contact={contact} />
                  ))}
                </ul>
              </div>
            )}

            {!isOwner && (
              <Link
                href="/chat"
                className="group flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm transition-colors hover:bg-primary/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-foreground">Lowonganmu sedikit berbeda?</span>
                  <span className="mt-1 block text-muted-foreground">Telaah sendiri di chat untuk penilaian yang sesuai materimu.</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </aside>
        </div>
      </main>

      <ReportModal
        postId={post.id}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        onReported={() => setPost((current) => current && { ...current, viewer: { ...current.viewer, reported: true } })}
      />
      <EditPostModal
        post={post}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSaved={(saved) => setPost((current) => current && { ...saved, comments: current.comments })}
      />
      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Telaah ini?"
        description="Telaah beserta diskusinya akan hilang dari TelaahBareng. Tindakan ini tidak bisa dibatalkan."
        confirmText="Hapus"
        cancelText="Batal"
        isDestructive
      />
    </PageShell>
  );
}
