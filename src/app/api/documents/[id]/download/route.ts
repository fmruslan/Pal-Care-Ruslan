import { getDemoData } from "@/lib/demo/repository";
import { recordIdSchema } from "@/lib/demo/presentation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success)
    return new Response("Not found", { status: 404 });
  const data = await getDemoData();
  const document = data.documents.find(
    (record) =>
      record.id === id && ["sample", "sandbox"].includes(record.origin),
  );
  if (!document) return new Response("Not found", { status: 404 });
  return new Response(document.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="palcare-${document.origin}-${id}.txt"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
