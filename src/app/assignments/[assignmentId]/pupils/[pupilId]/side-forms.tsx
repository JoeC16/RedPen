"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass, Notice, secondaryButtonClass } from "@/components/ui";
import { deleteWorkAction, moveWorkAction, reopenAction, saveWorkAction, type FormState } from "@/app/assignments/actions";

export function WorkEditor({ assignmentId, pupilId, text, open }: { assignmentId: string; pupilId: string; text: string; open: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWorkAction.bind(null, assignmentId, pupilId), {});
  const [value, setValue] = useState(text);
  return (
    <details open={open} className="mt-3">
      <summary className="cursor-pointer text-sm font-medium">{text ? "Edit typed work" : "Add typed work"}</summary>
      <form action={action} className="mt-2 space-y-2">
        {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
        {state.notice ? <Notice>{state.notice}</Notice> : null}
        <label htmlFor="work-text" className="sr-only">Pupil work</label>
        <textarea id="work-text" name="text" rows={8} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
        <button type="submit" disabled={pending} className={secondaryButtonClass}>Save work</button>
      </form>
    </details>
  );
}

export function ReopenForm({ assignmentId, pupilId }: { assignmentId: string; pupilId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reopenAction.bind(null, assignmentId, pupilId), {});
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="space-y-2 rounded border border-gray-300 p-4 dark:border-gray-700">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      <label htmlFor="reason" className="block text-sm font-medium">Reason for reopening (recorded in the audit log)</label>
      <input id="reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} className={inputClass} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>Reopen marks</button>
    </form>
  );
}

export function MoveForm({ assignmentId, pupilId, targets }: { assignmentId: string; pupilId: string; targets: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(moveWorkAction.bind(null, assignmentId, pupilId), {});
  if (targets.length === 0) return null;
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-medium">Handed in for the wrong assignment?</summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-3">
        {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
        <div>
          <label htmlFor="target" className="block text-sm">Move this work to</label>
          <select id="target" name="target" className={inputClass}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending} className={buttonClass}>Move work</button>
      </form>
    </details>
  );
}

export function DeleteWorkForm({ assignmentId, pupilId, approved }: { assignmentId: string; pupilId: string; approved: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteWorkAction.bind(null, assignmentId, pupilId), {});
  const [confirmed, setConfirmed] = useState(false);
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-medium">Delete this pupil&apos;s work now</summary>
      <form action={action} className="mt-2 space-y-2 rounded border border-red-700 p-4 text-sm">
        {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
        <p>
          {approved
            ? "Deletes the typed work, photos, transcription, evidence quotes, comments and feedback now instead of on the retention date. The approved marks are kept for the markbook and for agreement figures. This cannot be undone, and the marks can no longer be reopened."
            : "Deletes the typed work, photos and any draft marks and feedback for this pupil. This cannot be undone."}
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="confirm" value="yes" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
          <span>I understand this permanently deletes the work.</span>
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center rounded bg-red-800 px-3 py-1.5 font-medium text-white hover:bg-red-900 disabled:opacity-60">
          Delete work
        </button>
      </form>
    </details>
  );
}
