import type { CompiledLearnerRequirement } from "./compiled-presentation-program";

export type PresentationGateObservationSnapshot =
  | { readonly status: "inactive" }
  | { readonly status: "awaiting-satisfaction" }
  | { readonly status: "satisfaction-observed" };

export interface PresentationGateObservationPort {
  getGateObservationSnapshot(): PresentationGateObservationSnapshot;
  subscribeGateObservation(listener: () => void): () => void;
}

export interface PresentationGatePort {
  waitUntilSatisfied(
    requirement: CompiledLearnerRequirement,
    options: { readonly signal: AbortSignal },
  ): Promise<void>;
}
