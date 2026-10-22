import { NextRequest } from "next/server";
import { recordIdSchema } from "@/lib/demo/presentation";
import { checkoutRuntime } from "@/lib/commerce/runtime";
import { CHECKOUT_COOKIE, CheckoutError } from "@/lib/commerce/contracts";
import { sessionHash } from "@/lib/commerce/security";
import { checkoutErrorResponse } from "@/lib/commerce/http";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!recordIdSchema.safeParse(id).success)
      throw new CheckoutError("checkout_not_found", 404);
    const runtime = checkoutRuntime();
    return Response.json(
      await runtime.service.view(
        id,
        sessionHash(request.cookies.get(CHECKOUT_COOKIE)?.value ?? ""),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return checkoutErrorResponse(error);
  }
}
