import { getGuardian } from "@/lib/price-guardian/runtime";
import { guardianResponse, guardianError } from "@/lib/operator/http";
export async function GET() {
  try {
    return guardianResponse(await getGuardian());
  } catch (error) {
    return guardianError(error);
  }
}
