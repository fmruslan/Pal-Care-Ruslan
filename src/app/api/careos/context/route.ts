import { getDemoData } from "@/lib/demo/repository";
import { contextChoices } from "@/lib/careos/context-choices";

/** Public fictional read, equivalent to the Purchases page. No inference access. */
export async function GET() {
  try {
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
