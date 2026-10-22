export function GET() {
  return Response.json(
    {
      status: "ok",
      stage: "sandbox-checkout",
      payments: "sandbox-configurable",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
