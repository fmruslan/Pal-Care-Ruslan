import { cookies } from "next/headers";
import { CareError } from "@/lib/careos/contracts";
import {
  recordsRuntime,
  recordsOwner,
  RECORDS_COOKIE,
} from "@/lib/careos/records/runtime";
import {
  assertOrigin,
  careError,
  careResponse,
  newCapability,
  readJson,
  validCapability,
} from "@/lib/careos/security";

/** Provider-free fixed-fictional records only; never an inference grant. */
export async function POST(request: Request) {
  try {
    const { origin, store } = recordsRuntime();
    assertOrigin(request, origin);
    const body = await readJson(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw new CareError("careos_invalid_request", 400);
    const jar = await cookies();
    const old = jar.get(RECORDS_COOKIE)?.value;
    const token = validCapability(old) ? old : newCapability();
    const value = await store.create(recordsOwner(token));
    jar.set(RECORDS_COOKIE, token, {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "strict",
      path: "/",
      maxAge: 86400,
    });
    return careResponse(value, 201);
  } catch (error) {
    return careError(error);
  }
}
