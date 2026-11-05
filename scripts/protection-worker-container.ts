import { launchCareWorker } from "./care-worker-container";
launchCareWorker("protection").catch(() => {
  console.error(
    "Isolated protection worker stopped; no scope/expiry/allowance was renewed.",
  );
  process.exitCode = 1;
});
