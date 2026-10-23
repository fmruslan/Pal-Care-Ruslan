import { boundedReadiness } from "@/lib/readiness";

export async function GET() {
  try {
    const data = await boundedReadiness();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
