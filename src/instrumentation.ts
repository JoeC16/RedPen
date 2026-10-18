// Runs once when the Next.js server starts. Starts the marking worker in the
// same process unless MARKING_WORKER=off (e.g. when a separate worker runs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.MARKING_WORKER === "off") return;
  const { startMarkingWorker } = await import("./server/marking/queue");
  // Not awaited: the worker keeps retrying until the database is ready, and the
  // web server must not wait for it.
  void startMarkingWorker().catch((err: Error) =>
    console.error(JSON.stringify({ event: "marking_worker_failed", name: err.name, message: err.message })),
  );
}
