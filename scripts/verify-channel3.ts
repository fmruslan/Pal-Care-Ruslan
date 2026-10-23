import {
  discoveryConfig,
  categorySchema,
} from "../src/lib/discovery/contracts";
import { Channel3Gateway } from "../src/lib/discovery/provider";
import { DiscoveryService } from "../src/lib/discovery/service";
import { createDatabase } from "../src/db/connection";
import "./environment";
try {
  const config = discoveryConfig(process.env);
  if (!config.enabled) throw new Error();
  const category = categorySchema.parse(process.argv[2]);
  const { pool } = createDatabase(config.databaseUrl);
  try {
    const service = new DiscoveryService(
      pool,
      new Channel3Gateway(config.apiKey),
      { ...config, restrictedWriter: true },
    );
    const found = await service.discover(category);
    const alternatives = await service.alternatives(category);
    console.log(
      JSON.stringify(
        {
          verification: "actual-channel3-api",
          category,
          productIds: found.productIds,
          acceptedOffers: alternatives.length,
          offersRefreshed: true,
          financialMutations: 0,
        },
        null,
        2,
      ),
    );
    if (!alternatives.length) process.exitCode = 2;
  } finally {
    await pool.end();
  }
} catch {
  console.error(
    "Channel3 verification BLOCKED or unavailable. Explicit owner-provided credentials, confirmed free credits, stable budget and restricted writer required. No automatic billing, MPP fallback or financial action.",
  );
  process.exitCode = 1;
}
