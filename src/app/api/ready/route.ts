import { getDemoData } from "@/lib/demo/repository";

export async function GET() {
  try {
    const data = await getDemoData();
    return Response.json(
      { status: "ready", source: data.source, records: "demo" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
