import { NextRequest, NextResponse } from "next/server";
import { checkoutRuntime } from "@/lib/commerce/runtime";
import { CHECKOUT_COOKIE, checkoutTokenSchema } from "@/lib/commerce/contracts";
import {
  boundedJson,
  newSessionToken,
  requireSameOrigin,
  sessionHash,
} from "@/lib/commerce/security";
import { checkoutErrorResponse } from "@/lib/commerce/http";

export async function POST(request: NextRequest) {
  try {
    const runtime = await checkoutRuntime();
    requireSameOrigin(request, runtime.origin);
    const existing = request.cookies.get(CHECKOUT_COOKIE)?.value;
    const token = checkoutTokenSchema.safeParse(existing).success
      ? existing!
      : newSessionToken();
    const order = await runtime.service.start(
      await boundedJson(request),
      sessionHash(token),
    );
    const response = NextResponse.json(order, {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(CHECKOUT_COOKIE, token, {
      httpOnly: true,
      secure: runtime.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 86400,
    });
    return response;
  } catch (error) {
    return checkoutErrorResponse(error);
  }
}
