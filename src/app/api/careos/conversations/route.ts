import { cookies } from "next/headers";
import { careRuntime } from "@/lib/careos/runtime";
import {
  assertOrigin,
  careError,
  careResponse,
  CARE_COOKIE,
  digest,
  newCapability,
  readJson,
  validCapability,
} from "@/lib/careos/security";
import { CareError } from "@/lib/careos/contracts";

export async function POST(request: Request) {
  try {
    const runtime = careRuntime();
    assertOrigin(request, runtime.origin);
    const body = await readJson(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw new CareError("careos_invalid_request", 400);
    const jar = await cookies();
    const existing = jar.get(CARE_COOKIE)?.value;
    const token = validCapability(existing) ? existing : newCapability();
    const conversation = await runtime.store.create(digest(token));
    jar.set(CARE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: runtime.origin.startsWith("https:"),
      path: "/",
      maxAge: 86400,
    });
    return careResponse(conversation, 201);
  } catch (error) {
    return careError(error);
  }
}
