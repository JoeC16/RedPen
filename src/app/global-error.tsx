"use client";

// Last resort, when the root layout itself fails. Plain HTML, no app styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: "36rem", margin: "4rem auto", padding: "0 1rem" }}>
        <h1>Something went wrong</h1>
        <p>The service could not load this page. Nothing you had already saved or approved has been lost.</p>
        {error.digest ? <p>Reference: {error.digest}</p> : null}
        <button type="button" onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
