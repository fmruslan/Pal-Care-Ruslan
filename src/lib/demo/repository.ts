import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getEnvironment } from "../config";
import { runtimeDatabase as createDatabase } from "../../db/runtime";
import { assertDatabaseAuthority } from "../../db/authority";
import { readDemoData } from "../../db/read-demo";
import { demoData } from "./fixtures";
import { recordIdSchema } from "./presentation";
import { withTenProductFixtures } from "../care/demo/catalog";
import { getDemoCarePack } from "../care/demo/runtime";
import { withConsumerDemoFixtures } from "../care/demo/consumer-evidence";

function consumerDemoEnabled() {
  const enabled = process.env.CARE_CONSUMER_SCENARIOS_ENABLED === "true";
  if (enabled && process.env.CARE_DEMO_ENABLED !== "true")
    throw Error("consumer_demo_requires_saved_pack");
  return enabled;
}

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
    const demoCare = await getDemoCarePack();
    const consumerDemo = consumerDemoEnabled();
    if (config.dataSource === "fixtures") {
      const base = demoCare ? withTenProductFixtures(demoData) : demoData;
      const fixtures = consumerDemo ? withConsumerDemoFixtures(base) : base;
      const selected =
        twinId ??
        (documentId
          ? fixtures.documents.find((d) => d.id === documentId)?.twinId
          : undefined);
      const twins =
        twinId || documentId
          ? fixtures.twins.filter((t) => t.id === selected)
          : fixtures.twins;
      const ids = new Set(twins.map((t) => t.id));
      return {
        ...fixtures,
        twins,
        documents: fixtures.documents.filter((d) => ids.has(d.twinId)),
        events: fixtures.events.filter((e) => ids.has(e.twinId)),
        source: "fixtures" as const,
      };
    }
    if (!globalDatabase.palcareDatabase)
      globalDatabase.palcareDatabase = createDatabase(config.databaseUrl!, {
        readOnly: true,
      });
    try {
      await assertDatabaseAuthority(
        globalDatabase.palcareDatabase.pool,
        "reader",
        {
          requiredReads: [
            "demo_customers",
            "merchants",
            "products",
            "purchase_twins",
            "documents",
            "care_events",
          ],
        },
      );
      return {
        consumerDemo,
        demoCare,
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

/** Fixed fictional library only; no visitor scope, migration or model authority. */
export async function getSavedRecordsData() {
  await connection();
  const config = getEnvironment();
  const demoCare = await getDemoCarePack();
  const consumerDemo = consumerDemoEnabled();
  if (config.dataSource === "fixtures")
    return {
      ...(consumerDemo
        ? withConsumerDemoFixtures(withTenProductFixtures(demoData))
        : demoCare
          ? withTenProductFixtures(demoData)
          : demoData),
      source: "fixtures" as const,
    };
  const database = createDatabase(config.databaseUrl!, { readOnly: true });
  try {
    await assertDatabaseAuthority(database.pool, "reader", {
      requiredReads: [
        "demo_customers",
        "merchants",
        "products",
        "purchase_twins",
        "documents",
        "care_events",
      ],
    });
    return {
      consumerDemo,
      demoCare,
      ...(await readDemoData(database.db, { library: true })),
      source: "database" as const,
    };
  } catch {
    throw new Error(
      "Saved purchases could not be read. No sample fallback was used.",
    );
  }
}
