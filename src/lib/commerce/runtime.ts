import "server-only";
import { createDatabase } from "../../db/connection";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../../db/authority";
import { CheckoutError } from "./contracts";
import { parseCheckoutConfig } from "./config";
import { SandboxPayPal } from "./paypal";
import { CheckoutService } from "./service";

const state = globalThis as unknown as {
  checkoutRuntime?: { service: CheckoutService; origin: string };
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
    };
  }
  // Configuration cannot silently substitute a privileged fallback on an enabled path.
  runtimeWriterUrl("CHECKOUT_DATABASE_URL");
  return { ...state.checkoutRuntime, origin: config.origin };
}
