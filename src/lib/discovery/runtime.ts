import "server-only";
import { createDatabase } from "../../db/connection";
import { discoveryConfig, type DiscoveryCategory } from "./contracts";
import { Channel3Gateway } from "./provider";
import { DiscoveryService } from "./service";
import { illustrativeAlternatives } from "./fixtures";
const state = globalThis as unknown as {
  discoveryDb?: ReturnType<typeof createDatabase>;
};
export async function getAlternatives(category: DiscoveryCategory) {
  const provider = process.env.DISCOVERY_PROVIDER ?? "fixture";
  if (provider === "fixture")
    return {
      mode: "fixture" as const,
      alternatives: illustrativeAlternatives(category),
    };
  if (provider !== "channel3" || process.env.DEMO_DATA_SOURCE !== "database")
    throw new Error("Discovery provider unavailable. No fixture substitution.");
  const config = discoveryConfig(process.env);
  if (!config.enabled) throw new Error("Channel3 is not explicitly enabled.");
  const db = (state.discoveryDb ??= createDatabase(config.databaseUrl));
  const service = new DiscoveryService(
    db.pool,
    new Channel3Gateway(config.apiKey),
    { ...config, restrictedWriter: true },
  );
  return {
    mode: "channel3" as const,
    alternatives: await service.alternatives(category),
  };
}
