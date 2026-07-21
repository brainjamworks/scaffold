import type { AssessmentInteractionKind } from "@scaffold/contracts";

import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";

/** Projection and response behavior owned by one assessment block definition. */
export interface AssessmentBlockAdapter {
  interactionKind: AssessmentInteractionKind;
  choiceMode: "single" | "multiple" | null;
  response: AssessmentCapabilityResponseDefinition;
}
