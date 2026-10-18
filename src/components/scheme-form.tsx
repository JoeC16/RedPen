"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass, secondaryButtonClass } from "./ui";

type Criterion = { label: string; max: number | "" };
export type SchemeDefaults = {
  title: string;
  workType: "short" | "maths" | "essay";
  schemeText: string;
  totalMarks: number | "";
  criteria: { label: string; max: number }[];
};
type State = { error?: string };

const WORK_TYPES = [
  { value: "short", label: "Short answers" },
  { value: "maths", label: "Maths working" },
  { value: "essay", label: "Essay (feedback draft)" },
] as const;

export function SchemeForm({
  action,
  defaults,
  submitLabel,
  warnOnSchemeChange = false,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  defaults: SchemeDefaults;
  submitLabel: string;
  warnOnSchemeChange?: boolean;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  const [criteria, setCriteria] = useState<Criterion[]>(defaults.criteria.length ? defaults.criteria : [{ label: "Q1", max: "" }]);
  const [total, setTotal] = useState<number | "">(defaults.totalMarks);
  // Controlled so a validation error never wipes what the teacher typed (React resets uncontrolled fields after an action).
  const [title, setTitle] = useState(defaults.title);
  const [workType, setWorkType] = useState<string>(defaults.workType);
  const [schemeText, setSchemeText] = useState(defaults.schemeText);
  const sum = criteria.reduce((n, c) => n + (typeof c.max === "number" ? c.max : 0), 0);
  const update = (i: number, patch: Partial<Criterion>) => setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {warnOnSchemeChange ? (
        <p className="rounded border border-amber-600 p-3 text-sm">
          Changing the scheme, total or mark lines starts a new scheme version. Approved marks stay as approved; draft marks go back to be marked again under the new scheme. Earlier marks are kept in the history.
        </p>
      ) : null}
      <div>
        <label htmlFor="title" className="block text-sm font-medium">Title</label>
        <input id="title" name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="workType" className="block text-sm font-medium">Type of work</label>
        <select id="workType" name="workType" value={workType} onChange={(e) => setWorkType(e.target.value)} className={inputClass}>
          {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="schemeText" className="block text-sm font-medium">Questions and mark scheme</label>
        <textarea id="schemeText" name="schemeText" required rows={12} value={schemeText} onChange={(e) => setSchemeText(e.target.value)} className={`${inputClass} font-mono text-sm`} aria-describedby="scheme-help" />
        <p id="scheme-help" className="mt-1 text-sm text-gray-600 dark:text-gray-300">Paste the questions and the mark scheme as you would give them to a colleague.</p>
      </div>
      <div>
        <label htmlFor="totalMarks" className="block text-sm font-medium">Total marks</label>
        <input id="totalMarks" name="totalMarks" type="number" min={1} max={500} required value={total} onChange={(e) => setTotal(e.target.value === "" ? "" : Number(e.target.value))} className={`${inputClass} max-w-32`} />
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Mark lines (one per question or criterion)</legend>
        <input type="hidden" name="criteria" value={JSON.stringify(criteria.map((c) => ({ label: c.label, max: c.max === "" ? null : c.max })))} />
        <ol className="mt-2 space-y-2">
          {criteria.map((c, i) => (
            <li key={i} className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label htmlFor={`label-${i}`} className="block text-xs">Line {i + 1} label</label>
                <input id={`label-${i}`} value={c.label} maxLength={80} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor={`max-${i}`} className="block text-xs">Line {i + 1} max marks</label>
                <input id={`max-${i}`} type="number" min={0} max={500} value={c.max} onChange={(e) => update(i, { max: e.target.value === "" ? "" : Number(e.target.value) })} className={`${inputClass} w-28`} />
              </div>
              <button type="button" className={secondaryButtonClass} disabled={criteria.length === 1} onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" className={secondaryButtonClass} onClick={() => setCriteria((cs) => [...cs, { label: `Q${cs.length + 1}`, max: "" }])}>
            Add line
          </button>
          <p aria-live="polite" className={`text-sm ${total !== "" && sum !== total ? "font-medium text-red-800 dark:text-red-200" : ""}`}>
            Lines add up to {sum}{total !== "" ? ` of ${total}` : ""}{total !== "" && sum !== total ? " (must match the total)" : ""}.
          </p>
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
