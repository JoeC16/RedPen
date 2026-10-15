"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass } from "@/components/ui";
import { saveWorkBulkAction, type FormState } from "../../actions";

export type WorkRow = { pupilId: string; code: string; name: string | null; locked: boolean; hasWork: boolean; absent: boolean };

export function WorkForm({ assignmentId, rows }: { assignmentId: string; rows: WorkRow[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWorkBulkAction.bind(null, assignmentId), {});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const open = rows.filter((r) => !r.locked && !r.absent && !r.hasWork);
  return (
    <form action={action} className="space-y-6">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {open.length === 0 ? (
        <p>Every pupil already has work added, is absent, or is approved. Open a pupil from the review queue to change their work.</p>
      ) : (
        open.map((r) => (
          <div key={r.pupilId}>
            <label htmlFor={`w-${r.pupilId}`} className="block text-sm font-medium">
              <span className="font-mono">{r.code}</span>{r.name ? ` · ${r.name}` : ""}
            </label>
            <textarea
              id={`w-${r.pupilId}`}
              name={`work:${r.pupilId}`}
              rows={4}
              value={texts[r.pupilId] ?? ""}
              onChange={(e) => setTexts((t) => ({ ...t, [r.pupilId]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))
      )}
      {open.length > 0 ? <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Saving…" : "Save work"}</button> : null}
    </form>
  );
}
