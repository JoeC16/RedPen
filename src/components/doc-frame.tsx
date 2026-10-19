import Link from "next/link";
import type { ReactNode } from "react";
import { linkClass } from "@/components/ui";

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/London" });

/** A printable document: A4-friendly, with the template warning and generation date on the page itself. */
export function DocFrame({ title, template, children }: { title: string; template?: boolean; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl print:max-w-none">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm print:hidden">
        <Link href="/trust" className={linkClass}>Trust centre</Link> › Documents
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-gray-700 print:hidden dark:text-gray-300">Use your browser&apos;s Print, then Save as PDF.</p>
      </div>
      {template ? (
        <p role="note" className="mb-6 rounded border border-amber-600 p-3 text-sm">
          <strong>Template.</strong> Pre-filled from how the service works today. Blanks in dashed boxes are for you; highlighted items are details we have
          not yet confirmed. Have it reviewed by your data protection officer (and, for the agreement, a solicitor) before relying on it.
        </p>
      ) : null}
      <div className="doc space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <p className="mt-10 border-t border-gray-300 pt-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
        Generated from the live service on {day.format(new Date())}. Statements about the AI provider and UK guidance come from the claims register, which records
        each source and the date it was checked.
      </p>
    </article>
  );
}

/** Label and value rows, for the details tables in documents (no empty header row). */
export function KeyTable({ caption, rows }: { caption: string; rows: [string, ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row" className="w-1/3 px-4 py-2 align-top font-medium">{k}</th>
              <td className="px-4 py-2 align-top">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
