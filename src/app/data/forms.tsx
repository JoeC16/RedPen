"use client";

import { useActionState, useState } from "react";
import { ErrorBox, inputClass, Notice, secondaryButtonClass } from "@/components/ui";
import { cancelDeletionAction, confirmDeletionAction, requestDeletionAction, type FormState } from "./actions";

const danger =
  "inline-flex items-center rounded bg-red-800 px-4 py-2 font-medium text-white hover:bg-red-900 disabled:opacity-60";

function NameField({ schoolName, value, onChange }: { schoolName: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="max-w-md">
      <label htmlFor="schoolName" className="block font-medium">Type the school&apos;s name to confirm: {schoolName}</label>
      <input id="schoolName" name="schoolName" autoComplete="off" required value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  );
}

export function RequestDeletionForm({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestDeletionAction.bind(null, schoolId), {});
  const [name, setName] = useState("");
  return (
    <form action={action} className="space-y-3">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      <NameField schoolName={schoolName} value={name} onChange={setName} />
      <button type="submit" disabled={pending} className={danger}>Request deletion</button>
    </form>
  );
}

export function ConfirmDeletionForm({ schoolId, requestId, schoolName }: { schoolId: string; requestId: string; schoolName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmDeletionAction.bind(null, schoolId, requestId), {});
  const [name, setName] = useState("");
  return (
    <form action={action} className="space-y-3">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      <NameField schoolName={schoolName} value={name} onChange={setName} />
      <button type="submit" disabled={pending} className={danger}>Confirm and delete everything</button>
    </form>
  );
}

export function CancelDeletionForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelDeletionAction.bind(null, requestId), {});
  return (
    <form action={action} className="space-y-2">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      <button type="submit" disabled={pending} className={secondaryButtonClass}>Cancel the request</button>
    </form>
  );
}
