import { retrieveCpsc, sourceHash } from "../src/lib/safety/cpsc";
import { referenceSource } from "../src/lib/safety/reference";
import { saveRecall, markRecallUnavailable } from "../src/lib/safety/service";
import { createDatabase } from "../src/db/connection";
import { databaseUrl } from "./environment";
const command = process.argv[2];
try {
  if (!["verify", "refresh"].includes(command)) throw new Error();
  if (command === "refresh" && process.env.CPSC_REFRESH_ENABLED !== "true")
    throw new Error();
  const snapshot = await retrieveCpsc().catch(async (error) => {
    if (command === "refresh") {
      const { pool } = createDatabase(databaseUrl());
      try {
        await markRecallUnavailable(pool);
      } finally {
        await pool.end();
      }
    }
    throw error;
  });
  if (command === "refresh") {
    const { pool } = createDatabase(databaseUrl());
    try {
      console.log(await saveRecall(pool, snapshot));
    } finally {
      await pool.end();
    }
  }
  console.log(
    JSON.stringify(
      {
        verification: "actual-official-cpsc-retrieval",
        recallNumber: snapshot.source.RecallNumber,
        recallId: snapshot.source.RecallID,
        hash: snapshot.hash,
        reviewedRevisionMatches: snapshot.hash === sourceHash(referenceSource),
        retrievedAt: snapshot.retrievedAt,
        financialMutations: 0,
        continuousMonitoring: false,
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "CPSC check unavailable, disabled or invalid. No recall applicability or product safety is established; no financial/provider mutation performed.",
  );
  process.exitCode = 1;
}
