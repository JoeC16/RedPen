"use client";

import Link from "next/link";
import { useEffect } from "react";

// An unexpected error on a page. No details are shown (they could hold pupil
// data); the reference lets support find the server log entry.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    document.title = "Something went wrong";
  }, []);
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-gray-700 dark:text-gray-300">
        The page could not be loaded. Nothing you had already saved or approved has been lost. Try again, and if it keeps happening, contact support.
      </p>
      {error.digest ? <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Reference: <span className="font-mono">{error.digest}</span></p> : null}
      <div className="mt-6 flex gap-4">
        <button type="button" onClick={reset} className="inline-flex items-center rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong">
          Try again
        </button>
        <Link href="/" className="self-center underline">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
