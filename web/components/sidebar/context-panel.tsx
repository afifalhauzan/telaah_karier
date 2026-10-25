/* eslint-disable @next/next/no-img-element */
import { Building2, ExternalLink, FileText, Link2, Mail, Paperclip, Phone } from "lucide-react";
import { AnalysisSchema } from "@/langchain/agents/analyzer/schema";
import type { MetabotUIMessage, MetabotUIMessagePart } from "@/types/streaming";
import { SourceItem, type SidebarSourceItem } from "@/components/sidebar/SourceItem";

export interface SessionAttachment {
  name: string;
  mediaType?: string;
  // Only present while the page is open; saved sessions keep the file name alone.
  url?: string;
}

export interface SessionContext {
  attachments: SessionAttachment[];
  links: string[];
  companies: string[];
  phones: string[];
  emails: string[];
}

const URL_IN_TEXT = /https?:\/\/[^\s<>()"']+/gi;
// chat-persistence.ts replaces inline files with this note when a session is saved.
const SAVED_ATTACHMENT_NOTE = /^\[Lampiran: (.+)\]$/;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/** What the session has shown so far: the user's files and links, and the entities the analysis read. */
export function collectSessionContext(messages: MetabotUIMessage[]): SessionContext {
  const attachments: SessionAttachment[] = [];
  const links: string[] = [];
  const companies: string[] = [];
  const phones: string[] = [];
  const emails: string[] = [];

  for (const message of messages) {
    for (const part of (message.parts || []) as MetabotUIMessagePart[]) {
      if (message.role === "user" && part.type === "file") {
        attachments.push({ name: part.filename || "Lampiran", mediaType: part.mediaType, url: part.url });
      }
      if (message.role === "user" && part.type === "text") {
        const saved = part.text.trim().match(SAVED_ATTACHMENT_NOTE);
        if (saved) attachments.push({ name: saved[1] });
        else links.push(...(part.text.match(URL_IN_TEXT) ?? []));
      }
      if (part.type === "data-analysis") {
        let data: unknown = part.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            continue;
          }
        }
        const parsed = AnalysisSchema.safeParse(data);
        const entities = parsed.success ? parsed.data.material?.entities : undefined;
        if (entities) {
          companies.push(...entities.companyNames);
          phones.push(...entities.phones);
          emails.push(...entities.emails);
          links.push(...entities.urls);
        }
      }
    }
  }

  return { attachments, links: unique(links), companies: unique(companies), phones: unique(phones), emails: unique(emails) };
}

export function countSessionContext(context: SessionContext, sources: SidebarSourceItem[]): number {
  return (
    context.attachments.length +
    context.links.length +
    context.companies.length +
    context.phones.length +
    context.emails.length +
    sources.length
  );
}

function Section({ title, icon: Icon, children, isEmpty }: { title: string; icon: typeof Link2; children: React.ReactNode; isEmpty: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {isEmpty ? <p className="text-xs text-muted-foreground">Belum ada.</p> : children}
    </section>
  );
}

function Chip({ icon: Icon, children, href }: { icon: typeof Link2; children: React.ReactNode; href?: string }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label="Buka di tab baru"
          title="Buka di tab baru"
          className="-my-0.5 shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  );
}

export function ContextPanel({ context, sources }: { context: SessionContext; sources: SidebarSourceItem[] }) {
  const entityCount = context.companies.length + context.phones.length + context.emails.length;

  return (
    <div className="space-y-5">
      <Section title="Lampiran" icon={Paperclip} isEmpty={context.attachments.length === 0}>
        <ul className="space-y-1.5">
          {context.attachments.map((attachment, index) =>
            attachment.url && attachment.mediaType?.startsWith("image/") ? (
              <li key={index}>
                <a href={attachment.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                  <img src={attachment.url} alt={attachment.name} className="max-h-40 w-full object-cover" />
                  <span className="block truncate bg-card px-2.5 py-1 text-[11px] text-muted-foreground">{attachment.name}</span>
                </a>
              </li>
            ) : (
              <Chip key={index} icon={FileText}>
                {attachment.name}
              </Chip>
            )
          )}
        </ul>
      </Section>

      <Section title="Link" icon={Link2} isEmpty={context.links.length === 0}>
        <ul className="space-y-1.5">
          {context.links.map((link) => (
            <Chip key={link} icon={Link2} href={/^https?:\/\//i.test(link) ? link : `https://${link}`}>
              {link}
            </Chip>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">Buka hanya untuk melihat. Jangan isi data atau unduh apa pun dari link yang mencurigakan.</p>
      </Section>

      <Section title="Kontak & entitas" icon={Building2} isEmpty={entityCount === 0}>
        <ul className="space-y-1.5">
          {context.companies.map((company) => (
            <Chip key={company} icon={Building2}>
              {company}
            </Chip>
          ))}
          {context.phones.map((phone) => (
            <Chip key={phone} icon={Phone}>
              {phone}
            </Chip>
          ))}
          {context.emails.map((email) => (
            <Chip key={email} icon={Mail}>
              {email}
            </Chip>
          ))}
        </ul>
      </Section>

      <Section title="Sumber verifikasi" icon={FileText} isEmpty={sources.length === 0}>
        <div className="space-y-2">
          {sources.map((source) => (
            <SourceItem key={source.id} item={source} />
          ))}
        </div>
      </Section>
    </div>
  );
}
