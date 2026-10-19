import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocFrame } from "@/components/doc-frame";
import { TrustShell } from "@/components/trust";
import { org } from "@/content/org";
import { getAuthority } from "@/server/dal/schools";
import { markingMode } from "@/server/marking/config";
import { currentUser } from "@/server/session";
import { DOCUMENTS, type DocSlug } from "../../doc-list";
import { Accessibility } from "./accessibility";
import type { DocCtx } from "./context";
import { DataSheet } from "./data-sheet";
import { Dpa } from "./dpa";
import { Dpia } from "./dpia";
import { SubProcessors } from "./subprocessors";

export const dynamic = "force-dynamic";

const BODY: Record<DocSlug, (c: DocCtx) => React.ReactNode> = {
  "data-sheet": DataSheet,
  dpia: Dpia,
  dpa: Dpa,
  subprocessors: SubProcessors,
  accessibility: Accessibility,
};
const TEMPLATES: DocSlug[] = ["dpia", "dpa"];

const find = (slug: string) => DOCUMENTS.find((d) => d.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: find((await params).slug)?.title ?? "Document" };
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = find((await params).slug);
  if (!doc) notFound();
  const user = await currentUser();
  // Only an authority's own users get its name and settings filled in.
  const authority = user ? await getAuthority(user) : null;
  const ctx: DocCtx = { o: org(), authorityName: authority?.name ?? null, retentionDays: authority?.retentionDays ?? null, demo: markingMode() === "demo" };
  const Body = BODY[doc.slug];
  return (
    <TrustShell user={user}>
      <DocFrame title={doc.title} template={TEMPLATES.includes(doc.slug)}>
        <Body {...ctx} />
      </DocFrame>
    </TrustShell>
  );
}
