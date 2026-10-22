import "server-only";
import { createDatabase } from "../../db/connection";
import { CheckoutError } from "./contracts";
import { parseCheckoutConfig } from "./config";
import { SandboxPayPal } from "./paypal";
import { CheckoutService } from "./service";

const state = globalThis as unknown as {
  checkoutRuntime?: { service: CheckoutService; origin: string };
};
export function checkoutRuntime() {
  const config = parseCheckoutConfig(process.env);
  if (!config.enabled) throw new CheckoutError("checkout_unavailable", 503);
  if (!state.checkoutRuntime) {
    const { db } = createDatabase(config.databaseUrl);
    state.checkoutRuntime = {
      service: new CheckoutService(db, new SandboxPayPal(config), config),
      origin: config.origin,
    };
  }
  return { ...state.checkoutRuntime, origin: config.origin };
}
