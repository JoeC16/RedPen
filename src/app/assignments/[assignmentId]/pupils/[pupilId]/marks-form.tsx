"use client";

import { useActionState, useState } from "react";
import { buttonClass, ErrorBox, inputClass, Notice, secondaryButtonClass } from "@/components/ui";
import { saveMarksAction, type FormState } from "@/app/assignments/actions";

export type LineProps = {
  position: number;
  label: string;
  max: number;
  aiAwarded: number | null;
  finalAwarded: number | null;
  evidence: string | null;
  comment: string | null;
};

export function MarksForm({
  assignmentId,
  pupilId,
  pupilCode,
  lines,
  feedback,
  totalMarks,
  locked,
  disabledReason,
}: {
  assignmentId: string;
  pupilId: string;
  pupilCode: string;
  lines: LineProps[];
  feedback: string;
  totalMarks: number;
  locked: boolean;
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMarksAction.bind(null, assignmentId, pupilId), {});
  const [marks, setMarks] = useState<string[]>(lines.map((l) => (l.finalAwarded ?? l.aiAwarded)?.toString() ?? ""));
  const [comments, setComments] = useState<string[]>(lines.map((l) => l.comment ?? ""));
  const [feedbackText, setFeedbackText] = useState(feedback);
  const values = marks.map((m) => (m === "" ? null : Number(m)));
  const complete = values.every((v) => v !== null && !Number.isNaN(v));
  const total = values.reduce<number>((n, v) => n + (v ?? 0), 0);
  const disabled = locked || disabledReason !== null;

  return (
    <form action={action} className="space-y-6">
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
      {disabledReason ? <p className="text-sm text-gray-700 dark:text-gray-300">{disabledReason}</p> : null}
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="sr-only">Marks for {pupilCode}</legend>
        {lines.map((l, i) => (
          <div key={l.position} className="rounded border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor={`mark-${l.position}`} className="block text-sm font-medium">
                  {l.label} <span className="font-normal text-gray-600 dark:text-gray-300">(out of {l.max})</span>
                </label>
                <input
                  id={`mark-${l.position}`}
                  name={`mark:${l.position}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={l.max}
                  step={0.5}
                  value={marks[i]}
                  onChange={(e) => setMarks((ms) => ms.map((m, j) => (j === i ? e.target.value : m)))}
                  className={`${inputClass} w-28`}
                />
              </div>
              {l.aiAwarded !== null ? (
                <p className="text-sm text-gray-700 dark:text-gray-300">Suggested: {l.aiAwarded}</p>
              ) : null}
            </div>
            {l.evidence ? (
              <p className="mt-2 text-sm">
                <span className="font-medium">Evidence:</span> <q>{l.evidence}</q>
              </p>
            ) : null}
            <div className="mt-2" hidden={locked && !comments[i]}>
              <label htmlFor={`comment-${l.position}`} className="block text-xs">Note on {l.label} (for you, optional)</label>
              <input id={`comment-${l.position}`} name={`comment:${l.position}`} value={comments[i]} onChange={(e) => setComments((cs) => cs.map((c, j) => (j === i ? e.target.value : c)))} maxLength={1000} className={inputClass} />
            </div>
          </div>
        ))}
        <p aria-live="polite" className="text-lg font-medium">
          Total: {complete ? total : "—"} / {totalMarks}
          {!complete ? <span className="ml-2 text-sm font-normal">(some lines have no mark yet)</span> : null}
        </p>
        <div>
          <label htmlFor="feedback" className="block text-sm font-medium">Feedback to the pupil</label>
          <textarea id="feedback" name="feedback" rows={4} maxLength={5000} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} className={inputClass} aria-describedby="feedback-help" />
          <p id="feedback-help" className="mt-1 text-sm text-gray-600 dark:text-gray-300">One thing done well and one concrete next step works best.</p>
        </div>
      </fieldset>
      {!disabled ? (
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="save" disabled={pending} className={secondaryButtonClass}>Save draft</button>
          <button type="submit" name="intent" value="approve" disabled={pending || !complete} className={buttonClass}>
            Approve {pupilCode} and go to next
          </button>
        </div>
      ) : null}
    </form>
  );
}
