import type { CompiledLearnerRequirement } from "./compiled-presentation-program";

export interface PresentationGatePort {
  waitUntilSatisfied(
    requirement: CompiledLearnerRequirement,
    options: { readonly signal: AbortSignal },
  ): Promise<void>;
}
