import type { KnowledgeSource } from "../knowledge";
import type { CareAnswer } from "../contracts";

export function fixtureCare(
  answer: CareAnswer,
  passages: KnowledgeSource[],
): CareAnswer {
  return {
    ...answer,
    mode: "fixture",
    outcome: "answered",
    text: "Safe shutdown for Raspberry Pi 5 running Raspberry Pi OS:",
    steps: [
      "Open the Raspberry Pi desktop menu, then choose Shutdown.",
      "Choose the shutdown option before disconnecting power. The guide also lists a double-press of the Raspberry Pi 5 power button as a shutdown shortcut.",
    ],
    sources: passages.map((source) => ({
      id: source.id,
      title: source.title,
      label: `${source.publisher} · ${source.license} · reviewed ${source.reviewedOn} · excerpt selection adapted`,
      href: `/vault/${answer.context!.twinId}/care#source-${source.id}`,
      excerpt: source.content,
    })),
    actions: [
      {
        label: "Open product-care guide",
        href: `/vault/${answer.context!.twinId}/care`,
      },
    ],
  };
}
