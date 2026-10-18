import type { ReactNode } from "react";

export function PageTitle({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {description ? <p className="mt-1 text-gray-600 dark:text-gray-300">{description}</p> : null}
    </div>
  );
}

export function Table({ caption, head, children }: { caption: string; head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2 align-top ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-300 p-6 text-gray-600 dark:border-gray-700 dark:text-gray-300">
      {children}
    </p>
  );
}

export const linkClass =
  "text-accent underline underline-offset-2 hover:text-accent-strong dark:text-red-300 dark:hover:text-red-200";

export const inputClass =
  "mt-1 block w-full rounded border border-gray-400 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:bg-gray-100 disabled:text-gray-600 dark:disabled:bg-gray-800 dark:disabled:text-gray-300";

export const buttonClass =
  "inline-flex items-center rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center rounded border border-gray-400 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-900";

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded border border-red-700 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
      {children}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-4 rounded border border-green-700 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
      {children}
    </p>
  );
}

/** Status badge with text, never colour alone. */
export function StatusBadge({ status, absent }: { status: string; absent?: boolean }) {
  const label = absent
    ? "Absent"
    : ({ todo: "Not marked", marking: "Marking", review: "Draft marks", approved: "Approved", failed: "Failed" } as Record<string, string>)[status] ?? status;
  const tone = absent
    ? "border-gray-500 text-gray-700 dark:text-gray-300"
    : status === "approved"
      ? "border-green-700 text-green-800 dark:border-green-400 dark:text-green-200"
      : status === "review"
        ? "border-amber-600 text-amber-800 dark:border-amber-400 dark:text-amber-200"
        : status === "failed"
          ? "border-red-700 text-red-800 dark:border-red-400 dark:text-red-200"
          : "border-gray-500 text-gray-700 dark:text-gray-300";
  return <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}
