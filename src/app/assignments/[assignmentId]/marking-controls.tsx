"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { buttonClass, ErrorBox, Notice, secondaryButtonClass } from "@/components/ui";
import { startMarkingAction, type FormState } from "../actions";

/** "Run AI marking" for the class, or "Mark again with AI" for one pupil. */
export function RunMarkingButton({
  assignmentId,
  pupilId,
  label,
  secondary,
  disabledReason,
}: {
  assignmentId: string;
  pupilId?: string;
  label: string;
  secondary?: boolean;
  /** Shown instead of enabling the button, e.g. when nothing is left to mark. */
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(startMarkingAction.bind(null, assignmentId, pupilId ?? null), {});
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        aria-describedby={disabledReason ? "run-marking-why" : undefined}
        className={secondary ? secondaryButtonClass : buttonClass}
      >
        {pending ? "Starting…" : label}
      </button>
      {disabledReason ? <p id="run-marking-why" className="text-xs text-gray-600 dark:text-gray-300">{disabledReason}</p> : null}
      {state.error ? <ErrorBox>{state.error}</ErrorBox> : null}
      {state.notice ? <Notice>{state.notice}</Notice> : null}
    </form>
  );
}

/**
 * While any script is being marked, refresh every few seconds. Progress lives
 * in the database, so a page reload or leaving the page loses nothing.
 */
export function MarkingProgress({ marking, total }: { marking: number; total: number }) {
  const router = useRouter();
  useEffect(() => {
    if (marking === 0) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [marking, router]);
  if (marking === 0) return null;
  return (
    <p role="status" aria-live="polite" className="mb-4 rounded border border-blue-700 bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">
      AI marking in progress: {marking} of {total} {total === 1 ? "script" : "scripts"} still to come back. This page updates by itself.
    </p>
  );
}
