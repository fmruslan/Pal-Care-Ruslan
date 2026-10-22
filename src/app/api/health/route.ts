export function GET() {
  return Response.json(
    { status: "ok", stage: "foundation", payments: "not-implemented" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
