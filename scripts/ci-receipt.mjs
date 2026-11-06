/** Local startup continuity for evidence already verified against GitHub. Not a signature or new authority. */
export function assertCiReceipt(build, receipt) {
  if (
    receipt?.schema !== 1 ||
    receipt.commit !== build.commit ||
    receipt.sourceHash !== build.sourceHash ||
    receipt.buildId !== build.buildId ||
    !["fast", "feature", "full"].includes(receipt.lane) ||
    receipt.exactChecks !== true ||
    !Number.isSafeInteger(receipt.runId) ||
    receipt.runId <= 0 ||
    receipt.workflow !== ".github/workflows/repository-checks.yml" ||
    !Number.isFinite(Date.parse(receipt.checkedAt))
  )
    throw Error("exact_verified_ci_receipt_required");
  return receipt;
}
