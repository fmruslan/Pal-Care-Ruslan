import { createHash, randomBytes } from "node:crypto";
import { CareError, turnSchema } from "./contracts";

export const CARE_COOKIE = "palcare-careos";
export function newCapability() {
  return randomBytes(32).toString("hex");
}
export function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function validCapability(token: string | undefined): token is string {
  return Boolean(token && /^[a-f0-9]{64}$/.test(token));
}

export function assertOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin)
    throw new CareError("careos_origin_rejected", 403);
}
export async function readJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new CareError("careos_json_required", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CareError("careos_invalid_request", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) {
      await reader.cancel();
      throw new CareError("careos_body_too_large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new CareError("careos_invalid_request", 400);
  }
}
export async function readTurn(request: Request) {
  const parsed = turnSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new CareError("careos_invalid_request", 400);
  return parsed.data;
}
export function careResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export function careError(error: unknown) {
  const known = error instanceof CareError;
  return Response.json(
    { error: known ? error.code : "careos_unavailable" },
    {
      status: known ? error.status : 503,
      headers: {
        "Cache-Control": "private, no-store",
        ...(known && error.status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
