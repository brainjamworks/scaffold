import type {
  ControlEventReferenceV1,
  ControlStatePredicateV1,
  LearnerInteractionCommandV1,
  LearnerInteractionRuleId,
} from "@scaffold/contracts";

export interface LearnerInteractionRuleDraft {
  readonly ruleId: LearnerInteractionRuleId | null;
  readonly isEnabled: boolean;
  readonly when: ControlEventReferenceV1 | null;
  readonly conditions: readonly ControlStatePredicateV1[];
  readonly commands: readonly LearnerInteractionCommandV1[];
}

export type LearnerInteractionDraftDiagnostic =
  | { readonly reason: "when-required" }
  | { readonly reason: "then-required" };

export function validateLearnerInteractionRuleDraft(
  draft: LearnerInteractionRuleDraft,
): readonly LearnerInteractionDraftDiagnostic[] {
  const diagnostics: LearnerInteractionDraftDiagnostic[] = [];
  if (draft.when === null) diagnostics.push(Object.freeze({ reason: "when-required" }));
  if (draft.commands.length === 0) diagnostics.push(Object.freeze({ reason: "then-required" }));
  return Object.freeze(diagnostics);
}
