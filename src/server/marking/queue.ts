import { PgBoss } from "pg-boss";
import { runMarkingJob, type MarkJob } from "./engine";

export const MARKING_QUEUE = "marking";
const RETRY_LIMIT = 3;

type Enqueue = (jobs: Omit<MarkJob, "jobId">[]) => Promise<void>;

const g = globalThis as unknown as { redpenBoss?: Promise<PgBoss>; redpenWorker?: boolean };

/**
 * pg-boss on the app's own Postgres, in its own schema, connecting as the app
 * role. Jobs carry ids only (submission and teacher), never pupil content.
 */
function boss(): Promise<PgBoss> {
  g.redpenBoss ??= (async () => {
    const b = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss", application_name: "redpen-queue" });
    b.on("error", (err: Error) => console.error(JSON.stringify({ event: "queue_error", name: err.name })));
    await b.start();
    await b.createQueue(MARKING_QUEUE, { retryLimit: RETRY_LIMIT, retryDelay: 5, retryBackoff: true, expireInSeconds: 600 });
    return b;
  })();
  // A failed start (database not ready or not yet migrated) is not cached.
  g.redpenBoss.catch(() => {
    g.redpenBoss = undefined;
  });
  return g.redpenBoss;
}

let enqueueOverride: Enqueue | undefined;

/** Tests only: capture jobs instead of queueing them. */
export function setEnqueueForTests(fn: Enqueue | undefined) {
  enqueueOverride = fn;
}

export async function enqueueMarking(jobs: Omit<MarkJob, "jobId">[]): Promise<void> {
  if (enqueueOverride) return enqueueOverride(jobs);
  const b = await boss();
  for (const data of jobs) {
    // One live job per submission, however many times "Run marking" is pressed.
    await b.send(MARKING_QUEUE, data, { singletonKey: data.submissionId });
  }
}

/** Start the worker in this process. Several jobs run at once; one failure never blocks the rest. */
export async function startMarkingWorker(): Promise<void> {
  if (g.redpenWorker) return;
  g.redpenWorker = true;
  let b: PgBoss | undefined;
  for (let attempt = 1; !b; attempt++) {
    try {
      b = await boss();
    } catch (err) {
      // Typically the database is still starting or migrations have not run yet.
      const wait = Math.min(30, 2 * attempt);
      console.error(JSON.stringify({ event: "marking_worker_waiting", attempt, retryInSeconds: wait, message: (err as Error).message }));
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  const concurrency = Number(process.env.MARKING_CONCURRENCY ?? 4);
  await b.work<Omit<MarkJob, "jobId">>(MARKING_QUEUE, { batchSize: 1, localConcurrency: concurrency }, async ([job]) => {
    if (!job) return;
    await runMarkingJob({ ...job.data, jobId: job.id }, { finalAttempt: job.retryCount >= RETRY_LIMIT });
  });
  console.info(JSON.stringify({ event: "marking_worker_started", concurrency }));
}
