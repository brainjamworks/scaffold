import type { EmbeddedNodeId, LearnerInteractionRuleId } from "@scaffold/contracts";

import type {
  ControlCommandType,
  ControlEventType,
  ControlStateKey,
  ControlValue,
} from "@/document/control-binding/control-definition";

export interface CompiledSurfaceLearnerInteractionProgram {
  readonly surfaceId: EmbeddedNodeId;
  readonly rulesByEvent: ReadonlyMap<string, readonly CompiledLearnerInteractionRule[]>;
}

export interface CompiledLearnerInteractionRule {
  readonly id: LearnerInteractionRuleId;
  readonly when: CompiledControlEventReference;
  readonly conditions: readonly CompiledControlStatePredicate[];
  readonly commands: readonly [
    CompiledLearnerInteractionCommand,
    ...CompiledLearnerInteractionCommand[],
  ];
}

export interface CompiledControlEventReference {
  readonly ownerId: EmbeddedNodeId;
  readonly targetId: EmbeddedNodeId;
  readonly type: ControlEventType;
}

export interface CompiledControlStatePredicate {
  readonly ownerId: EmbeddedNodeId;
  readonly targetId: EmbeddedNodeId;
  readonly key: ControlStateKey;
  readonly operator: "equals" | "not-equals";
  readonly value: ControlValue;
}

export type CompiledLearnerInteractionCommand =
  | {
      readonly kind: "reveal-target";
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "target-command";
      readonly ownerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly type: ControlCommandType;
      readonly input?: ControlValue;
    }
  | {
      readonly kind: "navigate-surface";
      readonly surfaceId: EmbeddedNodeId;
    };

export function createLearnerInteractionEventKey(reference: CompiledControlEventReference): string {
  return JSON.stringify([reference.ownerId, reference.targetId, reference.type]);
}
