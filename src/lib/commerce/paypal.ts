import {
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  LogLevel,
  CheckoutPaymentIntent,
  PaypalWalletContextShippingPreference,
  PaypalExperienceUserAction,
  ItemCategory,
} from "@paypal/paypal-server-sdk";
import type { CheckoutConfig } from "./config";
import type { CheckoutOrder } from "../../db/schema";
import { CheckoutError } from "./contracts";
import { minorToDecimal } from "./verification";

export interface PayPalGateway {
  create(order: CheckoutOrder): Promise<unknown>;
  retrieve(orderId: string): Promise<unknown>;
  retrieveCapture(captureId: string): Promise<unknown>;
  capture(orderId: string, requestId: string): Promise<void>;
}

export function createOrderBody(order: CheckoutOrder) {
  const amount = {
    currencyCode: "USD",
    value: minorToDecimal(order.amountMinor),
  };
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        referenceId: order.id,
        customId: order.id,
        invoiceId: `PALCARE-${order.id}`,
        description: "Pal Care fictional product — sandbox only; nothing ships",
        payee: { merchantId: order.expectedPayeeId },
        amount: { ...amount, breakdown: { itemTotal: amount } },
        items: [
          {
            name: order.product.name,
            sku: order.product.id,
            quantity: "1",
            category: ItemCategory.PhysicalGoods,
            unitAmount: amount,
          },
        ],
      },
    ],
    paymentSource: {
      paypal: {
        experienceContext: {
          brandName: "Pal Care Sandbox Demo",
          shippingPreference: PaypalWalletContextShippingPreference.NoShipping,
          userAction: PaypalExperienceUserAction.PayNow,
          returnUrl: `${order.returnOrigin}/checkout/${order.id}`,
          cancelUrl: `${order.returnOrigin}/checkout/${order.id}?cancel=1`,
        },
      },
    },
  };
}

export function safeProviderError(error: unknown) {
  const value = error as {
    statusCode?: number;
    headers?: Record<string, string>;
    result?: { details?: { issue?: string }[] };
  };
  const issue = value.result?.details?.[0]?.issue;
  const code = [
    "INSTRUMENT_DECLINED",
    "ORDER_NOT_APPROVED",
    "PAYER_ACTION_REQUIRED",
  ].includes(issue ?? "")
    ? issue!
    : "provider_unavailable";
  const debugId = value.headers?.["paypal-debug-id"];
  // No request/response bodies: provider payloads can contain payer data and tokens.
  console.warn("PayPal sandbox request failed", {
    status: typeof value.statusCode === "number" ? value.statusCode : undefined,
    debugId:
      debugId && /^[a-zA-Z0-9-]{1,80}$/.test(debugId) ? debugId : undefined,
    code,
  });
  return new CheckoutError(code, 502);
}

export class SandboxPayPal implements PayPalGateway {
  private orders: OrdersController;
  private payments: PaymentsController;
  constructor(config: Pick<CheckoutConfig, "clientId" | "clientSecret">) {
    const client = new Client({
      environment: Environment.Sandbox,
      timeout: 20_000,
      logging: {
        logLevel: LogLevel.Error,
        logRequest: { logBody: false, logHeaders: false },
        logResponse: { logBody: false, logHeaders: false },
      },
      clientCredentialsAuthCredentials: {
        oAuthClientId: config.clientId,
        oAuthClientSecret: config.clientSecret,
      },
      httpClientOptions: { retryConfig: { maxNumberOfRetries: 0 } },
    });
    this.orders = new OrdersController(client);
    this.payments = new PaymentsController(client);
  }
  async create(order: CheckoutOrder) {
    try {
      return (
        await this.orders.createOrder({
          body: createOrderBody(order),
          paypalRequestId: order.createKey,
          prefer: "return=representation",
        })
      ).result;
    } catch (error) {
      throw safeProviderError(error);
    }
  }
  async retrieve(id: string) {
    try {
      return (await this.orders.getOrder({ id })).result;
    } catch (error) {
      throw safeProviderError(error);
    }
  }
  async retrieveCapture(captureId: string) {
    try {
      return (await this.payments.getCapturedPayment({ captureId })).result;
    } catch (error) {
      throw safeProviderError(error);
    }
  }
  async capture(id: string, paypalRequestId: string) {
    try {
      await this.orders.captureOrder({
        id,
        paypalRequestId,
        prefer: "return=representation",
      });
    } catch (error) {
      throw safeProviderError(error);
    }
  }
}
