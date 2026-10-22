import { CheckoutError } from "./contracts";

export function checkoutErrorResponse(error: unknown) {
  const known = error instanceof CheckoutError;
  return Response.json(
    { error: known ? error.code : "checkout_unavailable" },
    {
      status: known ? error.status : 503,
      headers: {
        "Cache-Control": "no-store",
        ...(known && error.status === 429 ? { "Retry-After": "3600" } : {}),
      },
    },
  );
}
