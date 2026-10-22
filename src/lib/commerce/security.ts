import { createHash, randomBytes } from "node:crypto";
import { CheckoutError, checkoutTokenSchema } from "./contracts";

export function sessionHash(token: string) {
  if (!checkoutTokenSchema.safeParse(token).success)
    throw new CheckoutError("checkout_not_found", 404);
  return createHash("sha256").update(token).digest("hex");
}
export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export function requireSameOrigin(request: Request, origin: string) {
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new CheckoutError("origin_not_allowed", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new CheckoutError("json_required", 415);
}

export async function boundedJson(request: Request) {
  if (Number(request.headers.get("content-length")) > 2048)
    throw new CheckoutError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutError("invalid_request", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2048) {
        await reader.cancel();
        throw new CheckoutError("request_too_large", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError("invalid_request", 400);
  }
}
