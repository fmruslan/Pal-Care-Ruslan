import { EvaluationAccess } from "@/components/careos/evaluation-access";
import { TestingAccess } from "@/components/careos/testing-access";
import { privateHttpsPresentation } from "@/lib/private-preview-origin";
import { cookies } from "next/headers";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  evaluationAccessStatus,
  evaluationCookie,
} from "@/lib/careos/evaluation-access";
export default async function EvaluationPage() {
  const jar = await cookies();
  const access = evaluationAccessStatus(
    {
      customer: jar.get(evaluationCookie("customer"))?.value,
      studio: jar.get(evaluationCookie("studio"))?.value,
    },
    process.env,
  );
  const target = process.env.CAREOS_OWNER_SSH_TARGET ?? "";
  const httpsTesting = privateHttpsPresentation(process.env);
  const ownerCommand =
    process.env.CAREOS_OWNER_PAIRING_ENABLED === "true" &&
    /^[a-z_][a-z0-9_-]*@[a-zA-Z0-9.-]+$/.test(target)
      ? {
          target,
          pnpm: join(homedir(), ".local/bin/pnpm"),
          directory: process.cwd(),
        }
      : undefined;
  return (
    <main id="main-content" className="mx-auto max-w-2xl p-5 sm:p-8">
      <h1 className="text-2xl font-semibold">Private CareOS evaluation</h1>
      <p className="my-4 text-sm text-muted-foreground">
        {httpsTesting
          ? "Review testing access and prepare an owner approval request. No billing, financial action or automatic renewal."
          : "Unlock an approved, expiring evaluation scope. This does not enable billing or financial actions. Never enter your OpenAI API key here."}
      </p>
      {httpsTesting ? (
        <TestingAccess initialAccess={access} />
      ) : (
        <EvaluationAccess initialAccess={access} ownerCommand={ownerCommand} />
      )}
    </main>
  );
}
