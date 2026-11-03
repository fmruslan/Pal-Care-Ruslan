import { ownedRecords, recordsRuntime } from "@/lib/careos/records/runtime";
import { assertOrigin, careError, careResponse } from "@/lib/careos/security";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { store } = recordsRuntime();
    const { id, owner } = await ownedRecords(params);
    return careResponse(await store.get(id, owner));
  } catch (error) {
    return careError(error);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { origin, store } = recordsRuntime();
    assertOrigin(request, origin);
    const { id, owner } = await ownedRecords(params);
    await store.clear(id, owner);
    return careResponse({ cleared: true });
  } catch (error) {
    return careError(error);
  }
}
