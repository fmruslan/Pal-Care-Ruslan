import { getDemoData } from "@/lib/demo/repository";
import { findTwin, recordIdSchema } from "@/lib/demo/presentation";
import { documentPresentation } from "@/lib/document-presentation";
import { documentViewSchema } from "@/lib/document-view";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success)
    return new Response("Not found", { status: 404 });
  const data = await getDemoData(undefined, id);
  const doc = data.documents.find(
    (d) => d.id === id && ["sample", "sandbox"].includes(d.origin),
  );
  const record = doc && findTwin(data, doc.twinId);
  if (!doc || !record) return new Response("Not found", { status: 404 });
  return Response.json(
    documentViewSchema.parse(documentPresentation(doc, record)),
    { headers: { "Cache-Control": "no-store" } },
  );
}
