import type { EmbeddedNodeId, LearnerInteractionRuleId } from "@scaffold/contracts";

import type {
  LearnerInteractionAuthoringCommandError,
  LearnerInteractionAuthoringCommandResult,
  LearnerInteractionRuleDraft,
} from "../model";

export type LearnerInteractionContextChange =
  | { readonly kind: "rule"; readonly ruleId: LearnerInteractionRuleId | null }
  | { readonly kind: "surface"; readonly surfaceId: EmbeddedNodeId }
  | { readonly kind: "workspace"; readonly workspace: "timeline" | "interactions" };

interface IdleSnapshot {
  readonly status: "idle";
  readonly draft: null;
  readonly baseline: null;
  readonly pendingContextChange: null;
  readonly saveError: null;
}

interface FocusedSnapshot {
  readonly status: "focused-clean" | "focused-dirty";
  readonly draft: LearnerInteractionRuleDraft;
  readonly baseline: LearnerInteractionRuleDraft | null;
  readonly pendingContextChange: null;
  readonly saveError: LearnerInteractionAuthoringCommandError | null;
}

interface DecisionRequiredSnapshot {
  readonly status: "decision-required";
  readonly draft: LearnerInteractionRuleDraft;
  readonly baseline: LearnerInteractionRuleDraft | null;
  readonly pendingContextChange: LearnerInteractionContextChange;
  readonly saveError: LearnerInteractionAuthoringCommandError | null;
}

export type LearnerInteractionWorkspaceSnapshot =
  | IdleSnapshot
  | FocusedSnapshot
  | DecisionRequiredSnapshot;

export interface CreateLearnerInteractionWorkspaceControllerInput {
  readonly saveDraft: (
    draft: LearnerInteractionRuleDraft,
  ) => LearnerInteractionAuthoringCommandResult<LearnerInteractionRuleId>;
}

const EMPTY_DRAFT = freezeDraft({
  ruleId: null,
  isEnabled: true,
  when: null,
  conditions: [],
  commands: [],
});

const IDLE_SNAPSHOT: IdleSnapshot = Object.freeze({
  status: "idle",
  draft: null,
  baseline: null,
  pendingContextChange: null,
  saveError: null,
});

export class LearnerInteractionWorkspaceController {
  readonly #listeners = new Set<() => void>();
  readonly #saveDraft: CreateLearnerInteractionWorkspaceControllerInput["saveDraft"];
  #snapshot: LearnerInteractionWorkspaceSnapshot = IDLE_SNAPSHOT;
  #pendingApply: (() => void) | null = null;
  #disposed = false;

  constructor({ saveDraft }: CreateLearnerInteractionWorkspaceControllerInput) {
    this.#saveDraft = saveDraft;
  }

  readonly getSnapshot = (): LearnerInteractionWorkspaceSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  startNewRule(): void {
    this.#focus(EMPTY_DRAFT, null);
  }

  focusRule(rule: LearnerInteractionRuleDraft): void {
    const baseline = freezeDraft(rule);
    this.#focus(baseline, baseline);
  }

  updateDraft(draft: LearnerInteractionRuleDraft): void {
    if (this.#disposed) return;
    if (this.#snapshot.status === "idle") {
      throw new Error("A Learner Interaction draft cannot update without a focused rule.");
    }
    this.#setFocused(freezeDraft(draft), this.#snapshot.baseline, null);
  }

  save(): "saved" | "save-failed" | "no-draft" {
    if (this.#disposed || this.#snapshot.status === "idle") return "no-draft";
    const result = this.#saveDraft(this.#snapshot.draft);
    if (result.isErr()) {
      this.#replaceSnapshot({ ...this.#snapshot, saveError: freezeError(result.error) });
      return "save-failed";
    }
    const saved = freezeDraft({ ...this.#snapshot.draft, ruleId: result.value });
    this.#setFocused(saved, saved, null);
    return "saved";
  }

  discard(): void {
    if (this.#disposed || this.#snapshot.status === "idle") return;
    if (this.#snapshot.baseline === null) {
      this.#replaceSnapshot(IDLE_SNAPSHOT);
      return;
    }
    this.#setFocused(this.#snapshot.baseline, this.#snapshot.baseline, null);
  }

  requestContextChange(
    request: LearnerInteractionContextChange,
    apply: () => void,
  ): "applied" | "decision-required" {
    if (this.#disposed) return "applied";
    if (this.#snapshot.status === "decision-required") return "decision-required";
    if (this.#snapshot.status !== "focused-dirty") {
      apply();
      return "applied";
    }
    this.#pendingApply = apply;
    this.#replaceSnapshot(
      Object.freeze({
        ...this.#snapshot,
        status: "decision-required" as const,
        pendingContextChange: Object.freeze({ ...request }),
      }),
    );
    return "decision-required";
  }

  resolveContextChange(
    decision: "save" | "discard" | "cancel",
  ): "applied" | "cancelled" | "save-failed" | "no-decision" {
    if (this.#disposed || this.#snapshot.status !== "decision-required") return "no-decision";
    if (decision === "cancel") {
      this.#pendingApply = null;
      this.#setFocused(this.#snapshot.draft, this.#snapshot.baseline, null);
      return "cancelled";
    }
    if (decision === "save" && this.save() === "save-failed") return "save-failed";
    if (decision === "discard") this.discard();
    const apply = this.#pendingApply;
    this.#pendingApply = null;
    apply?.();
    return "applied";
  }

  replaceArtifact(): void {
    if (this.#disposed) return;
    this.#pendingApply = null;
    this.#replaceSnapshot(IDLE_SNAPSHOT);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pendingApply = null;
    this.#snapshot = IDLE_SNAPSHOT;
    this.#listeners.clear();
  }

  #focus(draft: LearnerInteractionRuleDraft, baseline: LearnerInteractionRuleDraft | null): void {
    if (this.#disposed) return;
    if (
      this.#snapshot.status === "focused-dirty" ||
      this.#snapshot.status === "decision-required"
    ) {
      throw new Error("A dirty Learner Interaction draft requires an exit decision.");
    }
    this.#setFocused(draft, baseline, null);
  }

  #setFocused(
    draft: LearnerInteractionRuleDraft,
    baseline: LearnerInteractionRuleDraft | null,
    saveError: LearnerInteractionAuthoringCommandError | null,
  ): void {
    const dirty = !sameDraft(draft, baseline ?? EMPTY_DRAFT);
    this.#replaceSnapshot(
      Object.freeze({
        status: dirty ? "focused-dirty" : "focused-clean",
        draft,
        baseline,
        pendingContextChange: null,
        saveError,
      }),
    );
  }

  #replaceSnapshot(snapshot: LearnerInteractionWorkspaceSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}

function freezeDraft(draft: LearnerInteractionRuleDraft): LearnerInteractionRuleDraft {
  return deepFreeze(structuredClone(draft));
}

function freezeError(
  error: LearnerInteractionAuthoringCommandError,
): LearnerInteractionAuthoringCommandError {
  return deepFreeze(structuredClone(error));
}

function sameDraft(left: LearnerInteractionRuleDraft, right: LearnerInteractionRuleDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
