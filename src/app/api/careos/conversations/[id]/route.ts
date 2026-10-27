import { careRuntime, assertCustomerRuntimeAccess } from "@/lib/careos/runtime";
import { assertOrigin, careError, careResponse } from "@/lib/careos/security";
import { ownedConversation } from "@/lib/careos/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const runtime = careRuntime();
    await assertCustomerRuntimeAccess(runtime.config);
    const { id, owner } = await ownedConversation(params);
    return careResponse(await runtime.store.get(id, owner));
  } catch (error) {
    return careError(error);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const runtime = careRuntime();
    assertOrigin(request, runtime.origin);
    await assertCustomerRuntimeAccess(runtime.config);
    const { id, owner } = await ownedConversation(params);
    await runtime.store.clear(id, owner);
    return careResponse({ cleared: true });
  } catch (error) {
    return careError(error);
  }
}
