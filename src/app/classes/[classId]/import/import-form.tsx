"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass } from "@/components/ui";
import { importPupilsAction, type FormState } from "../../actions";

export function ImportForm({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(importPupilsAction.bind(null, classId), {});
  const [csv, setCsv] = useState("");
  return (
    <form action={action} className="max-w-2xl space-y-4">
      {state.error ? (
        <ErrorBox>
          <p>{state.error}</p>
          {state.errors?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {state.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          ) : null}
        </ErrorBox>
      ) : null}
      <div>
        <label htmlFor="file" className="block text-sm font-medium">CSV file</label>
        <input id="file" name="file" type="file" accept=".csv,text/csv" className="mt-1 block text-sm" />
      </div>
      <div>
        <label htmlFor="csv" className="block text-sm font-medium">Or paste the class list</label>
        <textarea id="csv" name="csv" rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} className={`${inputClass} font-mono text-sm`} placeholder={"code,name\nP001,Niamh Example\nP002,"} aria-describedby="csv-help" />
        <p id="csv-help" className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          First row is a header. The <code>code</code> column is required; <code>name</code> is optional. Codes are unique across the school: letters, digits, - or _. Names are encrypted, shown only to the class&apos;s teachers, and never sent to the AI.
        </p>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Importing…" : "Import pupils"}</button>
    </form>
  );
}
