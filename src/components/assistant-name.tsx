import { Star } from "lucide-react";
import {
  ASSISTANT_NAME,
  ASSISTANT_SPOKEN_NAME,
} from "@/lib/assistant-identity";

export function AssistantName() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true">{ASSISTANT_NAME.split(" ")[0]}</span>
      <Star className="size-[1em] shrink-0" fill="none" aria-hidden="true" />
      <span className="sr-only">{ASSISTANT_SPOKEN_NAME}</span>
    </span>
  );
}
