"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass } from "@/components/ui";
import { createClassAction, type FormState } from "../actions";

export function ClassForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createClassAction, {});
  const [v, setV] = useState({ name: "", yearGroup: "9", subject: "" });
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value })) });
  return (
    <form action={action} className="max-w-md space-y-4">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      <div>
        <label htmlFor="name" className="block text-sm font-medium">Class name</label>
        <input id="name" name="name" required maxLength={40} placeholder="e.g. 9S1" {...bind("name")} className={inputClass} />
      </div>
      <div>
        <label htmlFor="yearGroup" className="block text-sm font-medium">Year group</label>
        <select id="yearGroup" name="yearGroup" {...bind("yearGroup")} className={inputClass}>
          {[8, 9, 10, 11, 12, 13, 14].map((y) => (
            <option key={y} value={y}>Year {y}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="subject" className="block text-sm font-medium">Subject</label>
        <input id="subject" name="subject" required maxLength={60} placeholder="e.g. Science" {...bind("subject")} className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Creating…" : "Create class"}</button>
    </form>
  );
}
