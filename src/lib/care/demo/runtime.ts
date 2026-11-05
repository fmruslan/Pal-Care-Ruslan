import "server-only";
import { cache } from "react";
import { runtimeDatabase } from "../../../db/runtime";
import {
  assertDatabaseAuthority,
  runtimeWriterUrl,
} from "../../../db/authority";
import { getEnvironment } from "../../config";
import { tenProductPack } from "./catalog";
import { validateDemoPack } from "./model";
import { readDemoCarePack } from "./store";
import type { DemoCarePack } from "./contracts";

export const getDemoCarePack = cache(
  async (): Promise<DemoCarePack | undefined> => {
    if (process.env.CARE_DEMO_ENABLED !== "true") return undefined;
    if (getEnvironment().dataSource === "fixtures")
      return validateDemoPack(tenProductPack);
    const database = runtimeDatabase(
      runtimeWriterUrl("CARE_DEMO_READER_DATABASE_URL"),
      { readOnly: true },
    );
    await assertDatabaseAuthority(database.pool, "demo_care_reader");
    return readDemoCarePack(database.pool);
  },
);
