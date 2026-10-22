import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { CareError } from "./contracts";
import { CARE_COOKIE, digest, validCapability } from "./security";

export async function ownedConversation(params: Promise<{ id: string }>) {
  const { id } = await params;
  const token = (await cookies()).get(CARE_COOKIE)?.value;
  if (!z.uuid().safeParse(id).success || !validCapability(token))
    throw new CareError("careos_conversation_not_found", 404);
  return { id, owner: digest(token) };
}
