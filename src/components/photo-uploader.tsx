"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, ErrorBox } from "./ui";

type Result = { name: string; ok: boolean; message: string };

/**
 * Upload photographed pages, one request per file. In bulk mode each file is
 * matched to a pupil by the code its name starts with (e.g. NG10M01-2.jpg).
 * The teacher must confirm names are cropped out: photos cannot be redacted.
 */
export function PhotoUploader({ assignmentId, pupilId, pupilCode }: { assignmentId: string; pupilId?: string; pupilCode?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bulk = !pupilId;

  function choose(list: FileList | null) {
    const picked = [...(list ?? [])].filter((f) => !f.name.startsWith("."));
    // Page order: compare names without extensions, so NG01.jpg comes before NG01-2.jpg.
    const key = (f: File) => (f.webkitRelativePath || f.name).replace(/\.[^./\\]+$/, "");
    picked.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }));
    setFiles(picked);
    setResults([]);
    setError(null);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return setError("Tick the box to confirm pupil names are cropped out or covered.");
    if (files.length === 0) return setError("Choose at least one photo.");
    setBusy(true);
    setError(null);
    const done: Result[] = [];
    for (const f of files) {
      const body = new FormData();
      body.set("file", f);
      body.set("namesConfirmed", "yes");
      if (pupilId) body.set("pupilId", pupilId);
      try {
        const res = await fetch(`/api/assignments/${assignmentId}/photos`, { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { pupilCode?: string; position?: number; error?: string };
        done.push(
          res.ok
            ? { name: f.name, ok: true, message: `${json.pupilCode}, page ${json.position}` }
            : { name: f.name, ok: false, message: json.error ?? `Upload failed (${res.status}).` },
        );
      } catch {
        done.push({ name: f.name, ok: false, message: "Upload failed. Check your connection." });
      }
      setResults([...done]);
    }
    setBusy(false);
    setFiles([]);
    router.refresh();
  }

  const okCount = results.filter((r) => r.ok).length;
  return (
    <form onSubmit={upload} className="space-y-4">
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <div className="space-y-2">
        <label htmlFor={`photos-${pupilId ?? "bulk"}`} className="block text-sm font-medium">
          {bulk ? "Photos (file names start with the pupil code)" : `Photos of ${pupilCode}'s work`}
        </label>
        <input
          id={`photos-${pupilId ?? "bulk"}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => choose(e.target.files)}
          className="block text-sm"
        />
        {bulk ? (
          <>
            <label htmlFor="photo-folder" className="block text-sm font-medium">Or choose a whole folder</label>
            <input
              id="photo-folder"
              type="file"
              // @ts-expect-error: non-standard attribute supported by all major browsers
              webkitdirectory=""
              multiple
              onChange={(e) => choose(e.target.files)}
              className="block text-sm"
            />
          </>
        ) : null}
        <p className="text-sm text-gray-600 dark:text-gray-300">
          JPEG, PNG or WebP, up to 5 MB each. Location and other hidden data are removed from every photo.
          {files.length ? ` ${files.length} ${files.length === 1 ? "file" : "files"} chosen.` : ""}
        </p>
      </div>
      <div className="flex items-start gap-2">
        <input id={`confirm-${pupilId ?? "bulk"}`} type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4" />
        <label htmlFor={`confirm-${pupilId ?? "bulk"}`} className="text-sm">
          I confirm pupil names are cropped out or covered in these photos. Photos are sent to the AI as they are, so names in them cannot be removed automatically. This confirmation is recorded.
        </label>
      </div>
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? `Uploading ${Math.min(results.length + 1, files.length)} of ${files.length}…` : "Upload photos"}
      </button>
      {results.length ? (
        <div role="status" aria-live="polite" className="text-sm">
          <p className="font-medium">
            {okCount} of {results.length} uploaded.
          </p>
          <ul className="mt-1 space-y-0.5">
            {results.map((r) => (
              <li key={r.name}>
                {r.ok ? "Uploaded" : "Not uploaded"}: {r.name} {r.ok ? `→ ${r.message}` : `(${r.message})`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
