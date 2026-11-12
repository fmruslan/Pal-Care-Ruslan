import { getDemoData } from "@/lib/demo/repository";
import { contextChoices } from "@/lib/careos/context-choices";
import { purchaseNavigation } from "@/lib/careos/navigation-record";
import { z } from "zod";

/** Public fictional read, equivalent to the Purchases page. No inference access. */
export async function GET(request: Request) {
  try {
    const twinId = new URL(request.url).searchParams.get("twinId");
    if (twinId !== null) {
      if (!z.uuid().safeParse(twinId).success)
        return Response.json({ error: "invalid_purchase" }, { status: 400 });
      const navigation = purchaseNavigation(await getDemoData(twinId), twinId);
      return Response.json(navigation ?? { error: "purchase_not_found" }, {
        status: navigation ? 200 : 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return Response.json(
      { choices: contextChoices(await getDemoData()) },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Purchase context is unavailable. No sample fallback was substituted.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
