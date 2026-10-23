import { NextRequest } from "next/server";
import { z } from "zod";
import { checkoutRuntime } from "@/lib/commerce/runtime";
import { recordIdSchema } from "@/lib/demo/presentation";
import { CHECKOUT_COOKIE, CheckoutError } from "@/lib/commerce/contracts";
import {
  boundedJson,
  requireSameOrigin,
  sessionHash,
} from "@/lib/commerce/security";
import { checkoutErrorResponse } from "@/lib/commerce/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    if (
      !recordIdSchema.safeParse(id).success ||
      !["capture", "reconcile", "cancel", "retry"].includes(action)
    )
      throw new CheckoutError("checkout_not_found", 404);
    const runtime = await checkoutRuntime();
    requireSameOrigin(request, runtime.origin);
    if (
      !z
        .object({})
        .strict()
        .safeParse(await boundedJson(request)).success
    )
      throw new CheckoutError("invalid_request", 400);
    const hash = sessionHash(request.cookies.get(CHECKOUT_COOKIE)?.value ?? "");
    const order =
      action === "capture"
        ? await runtime.service.capture(id, hash)
        : action === "reconcile"
          ? await runtime.service.reconcile(id, hash)
          : action === "retry"
            ? await runtime.service.retryCreation(id, hash)
            : await runtime.service.cancel(id, hash);
    return Response.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return checkoutErrorResponse(error);
  }
}
