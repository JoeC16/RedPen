"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass, Notice } from "@/components/ui";
import { setMinutesAction, setRetentionAction, type FormState } from "./actions";

export function RetentionForm({ days }: { days: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setRetentionAction, {});
  const [value, setValue] = useState(String(days));
  const shorter = Number(value) < days;
  return (
    <form action={action} className="space-y-3">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      <div className="max-w-xs">
        <label htmlFor="days" className="block font-medium">Delete pupil work this many days after approval</label>
        <input id="days" name="days" type="number" min={1} max={3650} required value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} aria-describedby="days-help" />
      </div>
      <p id="days-help" className="text-sm text-gray-700 dark:text-gray-300">
        Applies to every school, including work already approved.
        {shorter ? <strong> Shortening it deletes any work now past the new date within the hour.</strong> : null}
      </p>
      <button type="submit" disabled={pending} className={buttonClass}>Save retention</button>
    </form>
  );
}

export function MinutesForm({ minutes }: { minutes: Record<"short" | "maths" | "essay", number> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setMinutesAction, {});
  const [v, setV] = useState({ short: String(minutes.short), maths: String(minutes.maths), essay: String(minutes.essay) });
  const field = (k: keyof typeof v, label: string) => (
    <div>
      <label htmlFor={`m-${k}`} className="block font-medium">{label}</label>
      <input id={`m-${k}`} name={k} type="number" min={0} max={120} step={0.5} required value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={inputClass} />
    </div>
  );
  return (
    <form action={action} className="space-y-3">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      <fieldset className="grid max-w-xl gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm text-gray-700 dark:text-gray-300">Minutes for a teacher to mark one script by hand</legend>
        {field("short", "Short answers")}
        {field("maths", "Maths working")}
        {field("essay", "Essays")}
      </fieldset>
      <button type="submit" disabled={pending} className={buttonClass}>Save minutes</button>
    </form>
  );
}
