// Run the marking worker on its own (set MARKING_WORKER=off on the web server).
// npm run worker
import { startMarkingWorker } from "../src/server/marking/queue";

await startMarkingWorker();
console.log("marking worker running; Ctrl+C to stop");
