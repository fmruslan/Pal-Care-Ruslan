import { CareError, type CareTurn } from "../contracts";

/** The caller supplies only the current conversation's server-loaded, owned
 * chronology. A browser UUID selects a prefix; it supplies no trusted content,
 * record identity or permission, and never falls back to a different result. */
export function ownedFollowupHistory(
  history: CareTurn[],
  followupRequestId?: string,
): CareTurn[] {
  if (followupRequestId === undefined) return history;
  const index = history.findIndex(
    (turn) => turn.requestId === followupRequestId,
  );
  if (index < 0) throw new CareError("careos_records_followup_not_found", 409);
  // Keep reset markers in their original order for existing scope resolution.
  return history.slice(0, index + 1);
}
