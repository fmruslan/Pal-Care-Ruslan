import { EvaluationAccess } from "@/components/careos/evaluation-access";
export default function EvaluationPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Private CareOS evaluation</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Unlock an approved, expiring evaluation scope. This does not enable
        billing or financial actions. Never enter your OpenAI API key here.
      </p>
      <EvaluationAccess />
    </main>
  );
}
