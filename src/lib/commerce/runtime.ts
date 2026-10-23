import "server-only";
import { runtimeDatabase as createDatabase } from "../../db/runtime";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../../db/authority";
import { CheckoutError } from "./contracts";
import { parseCheckoutConfig } from "./config";
import { SandboxPayPal } from "./paypal";
import { CheckoutService } from "./service";
import type { Pool } from "pg";

const state = globalThis as unknown as {
  checkoutRuntime?: { service: CheckoutService; origin: string; pool: Pool };
};
export async function checkoutRuntime() {
  const config = parseCheckoutConfig(process.env);
  if (!config.enabled) throw new CheckoutError("checkout_unavailable", 503);
  if (!state.checkoutRuntime) {
    const { db, pool } = createDatabase(
      runtimeWriterUrl("CHECKOUT_DATABASE_URL"),
    );
    await assertDatabaseAuthority(pool, "checkout");
    state.checkoutRuntime = {
      service: new CheckoutService(db, new SandboxPayPal(config), config),
      origin: config.origin,
      pool,
    };
  }
  // Configuration cannot silently substitute a privileged fallback on an enabled path.
  runtimeWriterUrl("CHECKOUT_DATABASE_URL");
  await assertDatabaseAuthority(state.checkoutRuntime.pool, "checkout");
  return { service: state.checkoutRuntime.service, origin: config.origin };
}
