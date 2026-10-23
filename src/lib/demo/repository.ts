import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getEnvironment } from "../config";
import { runtimeDatabase as createDatabase } from "../../db/runtime";
import { assertDatabaseAuthority } from "../../db/authority";
import { readDemoData } from "../../db/read-demo";
import { demoData } from "./fixtures";
import { recordIdSchema } from "./presentation";

const globalDatabase = globalThis as unknown as {
  palcareDatabase?: ReturnType<typeof createDatabase>;
};

export const getDemoData = cache(
  async (twinId?: string, documentId?: string) => {
    if (
      (twinId && !recordIdSchema.safeParse(twinId).success) ||
      (documentId && !recordIdSchema.safeParse(documentId).success)
    )
      throw new Error("Invalid record scope.");
    await connection(); // Never pre-render a database-backed page during a build.
    const config = getEnvironment();
    if (config.dataSource === "fixtures")
      return { ...demoData, source: "fixtures" as const };
    if (!globalDatabase.palcareDatabase)
      globalDatabase.palcareDatabase = createDatabase(config.databaseUrl!, {
        readOnly: true,
      });
    try {
      await assertDatabaseAuthority(
        globalDatabase.palcareDatabase.pool,
        "reader",
      );
      return {
        ...(await readDemoData(
          globalDatabase.palcareDatabase.db,
          twinId || documentId ? { twinId, documentId } : undefined,
        )),
        source: "database" as const,
      };
    } catch {
      // No silent sample fallback after database errors. Never log a DSN or raw query.
      throw new Error(
        "Demo records are temporarily unavailable. Check migrations and seed setup.",
      );
    }
  },
);

export async function getCareData(twinId: string | null) {
  const data = await getDemoData();
  if (!twinId || data.twins.some((t) => t.id === twinId)) return data;
  const scoped = await getDemoData(twinId);
  return {
    ...data,
    twins: [...data.twins, ...scoped.twins],
    documents: [...data.documents, ...scoped.documents],
    events: [...data.events, ...scoped.events],
  };
}
