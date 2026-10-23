import "server-only";
import { createHash } from "node:crypto";
import { createDatabase } from "../../db/connection";
import { careKnowledge } from "../../db/careos-schema";
import { getEnvironment } from "../config";
import { referenceSource, sourceSchema } from "./knowledge";

const state = globalThis as unknown as {
  careKnowledgeDatabase?: ReturnType<typeof createDatabase>;
};
export async function getKnowledge() {
  const config = getEnvironment();
  const rows =
    config.dataSource === "fixtures"
      ? [referenceSource]
      : await (state.careKnowledgeDatabase ??= createDatabase(
          config.databaseUrl!,
          { readOnly: true },
        )).db
          .select()
          .from(careKnowledge)
          .limit(100);
  return rows.map((row) => {
    const source = sourceSchema.parse(row);
    if (
      createHash("sha256").update(source.content).digest("hex") !==
      source.contentHash
    )
      throw new Error("Care source integrity check failed.");
    return source;
  });
}
