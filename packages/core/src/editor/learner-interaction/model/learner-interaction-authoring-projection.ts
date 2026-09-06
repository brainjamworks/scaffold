import type {
  ControlEventReferenceV1,
  ControlStatePredicateV1,
  EmbeddedNodeId,
  LearnerInteractionCommandV1,
  LearnerInteractionConfigurationV1,
  LearnerInteractionRuleV1,
} from "@scaffold/contracts";

import type { ControlCapabilityCatalogue } from "@/document/control-binding/control-capability-catalogue";
import type {
  ControlCommandInputDefinition,
  ControlStateValueTypeDefinition,
} from "@/document/control-binding/control-definition";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot } from "@/document/model/document-tree";
import {
  compileLearnerInteractions,
  type LearnerInteractionCompileDiagnostic,
  type LearnerInteractionRuleLocation,
} from "@/learner-interaction/model";

export type LearnerInteractionOptionAvailability = "available" | "unavailable";

export interface LearnerInteractionEventOption {
  readonly availability: LearnerInteractionOptionAvailability;
  readonly targetId: EmbeddedNodeId;
  readonly targetLabel: string;
  readonly type: string;
  readonly label: string;
}

export interface LearnerInteractionStateOption {
  readonly availability: LearnerInteractionOptionAvailability;
  readonly targetId: EmbeddedNodeId;
  readonly targetLabel: string;
  readonly key: string;
  readonly label: string;
  readonly valueType: ControlStateValueTypeDefinition | null;
}

export interface LearnerInteractionTargetCommandOption {
  readonly availability: LearnerInteractionOptionAvailability;
  readonly targetId: EmbeddedNodeId;
  readonly targetLabel: string;
  readonly type: string;
  readonly label: string;
  readonly input: ControlCommandInputDefinition | null | undefined;
}

export interface LearnerInteractionRevealTargetOption {
  readonly availability: LearnerInteractionOptionAvailability;
  readonly targetId: EmbeddedNodeId;
  readonly label: string;
}

export interface LearnerInteractionNavigationSurfaceOption {
  readonly availability: LearnerInteractionOptionAvailability;
  readonly surfaceId: EmbeddedNodeId;
  readonly label: string;
}

export interface ProjectedLearnerInteractionWhenSource {
  readonly reference: ControlEventReferenceV1;
  readonly option: LearnerInteractionEventOption;
  readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
}

export interface ProjectedLearnerInteractionConditionSource {
  readonly predicate: ControlStatePredicateV1;
  readonly option: LearnerInteractionStateOption;
  readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
}

export type ProjectedLearnerInteractionCommandSource =
  | {
      readonly kind: "reveal-target";
      readonly command: Extract<LearnerInteractionCommandV1, { readonly kind: "reveal-target" }>;
      readonly option: LearnerInteractionRevealTargetOption;
      readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
    }
  | {
      readonly kind: "target-command";
      readonly command: Extract<LearnerInteractionCommandV1, { readonly kind: "target-command" }>;
      readonly option: LearnerInteractionTargetCommandOption;
      readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
    }
  | {
      readonly kind: "navigate-surface";
      readonly command: Extract<LearnerInteractionCommandV1, { readonly kind: "navigate-surface" }>;
      readonly option: LearnerInteractionNavigationSurfaceOption;
      readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
    };

export interface ProjectedLearnerInteractionRule {
  readonly rule: LearnerInteractionRuleV1;
  readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
  readonly when: ProjectedLearnerInteractionWhenSource;
  readonly conditions: readonly ProjectedLearnerInteractionConditionSource[];
  readonly commands: readonly ProjectedLearnerInteractionCommandSource[];
}

export interface LearnerInteractionAuthoringProjection {
  readonly surfaceId: EmbeddedNodeId;
  readonly capabilityState: "available" | "empty";
  readonly rules: readonly ProjectedLearnerInteractionRule[];
  readonly whenEvents: readonly LearnerInteractionEventOption[];
  readonly conditionStates: readonly LearnerInteractionStateOption[];
  readonly targetCommands: readonly LearnerInteractionTargetCommandOption[];
  readonly revealTargets: readonly LearnerInteractionRevealTargetOption[];
  readonly navigationSurfaces: readonly LearnerInteractionNavigationSurfaceOption[];
}

export interface ProjectLearnerInteractionAuthoringInput {
  readonly configuration: LearnerInteractionConfigurationV1 | null;
  readonly surfaceId: EmbeddedNodeId;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly semanticSnapshot: DocumentTreeSnapshot;
  readonly controlCapabilities: ControlCapabilityCatalogue;
}

export function projectLearnerInteractionAuthoring({
  configuration,
  surfaceId,
  courseStructure,
  semanticSnapshot,
  controlCapabilities,
}: ProjectLearnerInteractionAuthoringInput): LearnerInteractionAuthoringProjection {
  if (!courseStructure.surfaceById[surfaceId]) {
    throw new Error(`Learner Interaction authoring Surface "${surfaceId}" is not current.`);
  }
  const surface = semanticSnapshot.itemById.get(surfaceId);
  if (!surface || surface.kind !== "surface") {
    throw new Error(`Learner Interaction authoring Surface "${surfaceId}" is not public.`);
  }

  const whenEvents: LearnerInteractionEventOption[] = [];
  const conditionStates: LearnerInteractionStateOption[] = [];
  const targetCommands: LearnerInteractionTargetCommandOption[] = [];
  const revealTargets: LearnerInteractionRevealTargetOption[] = [];

  for (const item of semanticSnapshot.itemById.values()) {
    const location = semanticSnapshot.locationById.get(item.id);
    if (!location) throw new Error(`Public semantic target "${item.id}" has no location.`);
    if (location.surfaceId !== surfaceId) continue;

    revealTargets.push(
      Object.freeze({ availability: "available", targetId: item.id, label: item.label }),
    );
    const resolved = controlCapabilities.resolve(item.id);
    if (resolved.isErr()) {
      if (resolved.error.reason === "target-not-public") {
        throw new Error(`Control catalogue rejected public semantic target "${item.id}".`);
      }
      continue;
    }
    if (resolved.value.targetId !== item.id) {
      throw new Error(
        `Control catalogue resolved target "${resolved.value.targetId}" for request "${item.id}".`,
      );
    }
    for (const event of resolved.value.capabilities.events ?? []) {
      whenEvents.push(
        Object.freeze({
          availability: "available",
          targetId: item.id,
          targetLabel: item.label,
          type: event.type,
          label: event.label,
        }),
      );
    }
    for (const state of resolved.value.capabilities.states ?? []) {
      conditionStates.push(
        Object.freeze({
          availability: "available",
          targetId: item.id,
          targetLabel: item.label,
          key: state.key,
          label: state.label,
          valueType: state.valueType,
        }),
      );
    }
    for (const command of resolved.value.capabilities.commands ?? []) {
      targetCommands.push(
        Object.freeze({
          availability: "available",
          targetId: item.id,
          targetLabel: item.label,
          type: command.type,
          label: command.label,
          input: command.input,
        }),
      );
    }
  }

  const navigationSurfaces = courseStructure.surfaceIds
    .filter((candidate) => candidate !== surfaceId)
    .map((candidate) => {
      const item = semanticSnapshot.itemById.get(candidate);
      if (item && item.kind !== "surface") {
        throw new Error(`Course Structure Surface "${candidate}" names ${item.kind}.`);
      }
      return Object.freeze({
        availability: "available" as const,
        surfaceId: candidate,
        label: item?.label ?? candidate,
      });
    });

  const diagnostics = compileLearnerInteractions({
    configuration,
    courseStructure,
    semanticSnapshot,
    controlCapabilities,
  }).diagnostics;
  const group = configuration?.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  const rules = (group?.rules ?? []).map((rule) =>
    projectRule({
      rule,
      surfaceId,
      diagnostics,
      semanticSnapshot,
      controlCapabilities,
      whenEvents,
      conditionStates,
      targetCommands,
      revealTargets,
      navigationSurfaces,
    }),
  );

  return Object.freeze({
    surfaceId,
    capabilityState:
      whenEvents.length > 0 &&
      (revealTargets.length > 0 || targetCommands.length > 0 || navigationSurfaces.length > 0)
        ? "available"
        : "empty",
    rules: Object.freeze(rules),
    whenEvents: Object.freeze(whenEvents),
    conditionStates: Object.freeze(conditionStates),
    targetCommands: Object.freeze(targetCommands),
    revealTargets: Object.freeze(revealTargets),
    navigationSurfaces: Object.freeze(navigationSurfaces),
  });
}

interface ProjectRuleInput {
  readonly rule: LearnerInteractionRuleV1;
  readonly surfaceId: EmbeddedNodeId;
  readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
  readonly semanticSnapshot: DocumentTreeSnapshot;
  readonly controlCapabilities: ControlCapabilityCatalogue;
  readonly whenEvents: readonly LearnerInteractionEventOption[];
  readonly conditionStates: readonly LearnerInteractionStateOption[];
  readonly targetCommands: readonly LearnerInteractionTargetCommandOption[];
  readonly revealTargets: readonly LearnerInteractionRevealTargetOption[];
  readonly navigationSurfaces: readonly LearnerInteractionNavigationSurfaceOption[];
}

function projectRule(input: ProjectRuleInput): ProjectedLearnerInteractionRule {
  const ruleDiagnostics = input.diagnostics.filter(
    ({ source }) => source.surfaceId === input.surfaceId && source.ruleId === input.rule.id,
  );
  const whenDiagnostics = diagnosticsAt(ruleDiagnostics, { kind: "when" });
  const whenOption =
    input.whenEvents.find(
      (option) =>
        option.targetId === input.rule.when.targetId && option.type === input.rule.when.type,
    ) ?? unavailableEventOption(input.rule.when, input.semanticSnapshot, input.controlCapabilities);

  return Object.freeze({
    rule: input.rule,
    diagnostics: Object.freeze(ruleDiagnostics),
    when: Object.freeze({
      reference: input.rule.when,
      option: whenOption,
      diagnostics: whenDiagnostics,
    }),
    conditions: Object.freeze(
      input.rule.conditions.map((predicate, conditionIndex) =>
        Object.freeze({
          predicate,
          option:
            input.conditionStates.find(
              (option) => option.targetId === predicate.targetId && option.key === predicate.key,
            ) ??
            unavailableStateOption(predicate, input.semanticSnapshot, input.controlCapabilities),
          diagnostics: diagnosticsAt(ruleDiagnostics, { kind: "condition", conditionIndex }),
        }),
      ),
    ),
    commands: Object.freeze(
      input.rule.commands.map((command, commandIndex) =>
        projectCommandSource(command, commandIndex, ruleDiagnostics, input),
      ),
    ),
  });
}

function projectCommandSource(
  command: LearnerInteractionCommandV1,
  commandIndex: number,
  diagnostics: readonly LearnerInteractionCompileDiagnostic[],
  input: ProjectRuleInput,
): ProjectedLearnerInteractionCommandSource {
  const sourceDiagnostics = diagnosticsAt(diagnostics, { kind: "command", commandIndex });
  if (command.kind === "reveal-target") {
    return Object.freeze({
      kind: command.kind,
      command,
      option:
        input.revealTargets.find((option) => option.targetId === command.targetId) ??
        Object.freeze({
          availability: "unavailable",
          targetId: command.targetId,
          label: currentLabel(command.targetId, input.semanticSnapshot),
        }),
      diagnostics: sourceDiagnostics,
    });
  }
  if (command.kind === "target-command") {
    return Object.freeze({
      kind: command.kind,
      command,
      option:
        input.targetCommands.find(
          (option) =>
            option.targetId === command.command.targetId && option.type === command.command.type,
        ) ??
        unavailableTargetCommandOption(
          command.command.targetId,
          command.command.type,
          input.semanticSnapshot,
          input.controlCapabilities,
        ),
      diagnostics: sourceDiagnostics,
    });
  }
  return Object.freeze({
    kind: command.kind,
    command,
    option:
      input.navigationSurfaces.find((option) => option.surfaceId === command.surfaceId) ??
      Object.freeze({
        availability: "unavailable",
        surfaceId: command.surfaceId,
        label: currentLabel(command.surfaceId, input.semanticSnapshot),
      }),
    diagnostics: sourceDiagnostics,
  });
}

function unavailableEventOption(
  reference: ControlEventReferenceV1,
  snapshot: DocumentTreeSnapshot,
  catalogue: ControlCapabilityCatalogue,
): LearnerInteractionEventOption {
  const capabilities = currentCapabilities(reference.targetId, snapshot, catalogue);
  return Object.freeze({
    availability: "unavailable",
    targetId: reference.targetId,
    targetLabel: currentLabel(reference.targetId, snapshot),
    type: reference.type,
    label:
      capabilities?.events?.find((candidate) => candidate.type === reference.type)?.label ??
      reference.type,
  });
}

function unavailableStateOption(
  predicate: ControlStatePredicateV1,
  snapshot: DocumentTreeSnapshot,
  catalogue: ControlCapabilityCatalogue,
): LearnerInteractionStateOption {
  const state = currentCapabilities(predicate.targetId, snapshot, catalogue)?.states?.find(
    (candidate) => candidate.key === predicate.key,
  );
  return Object.freeze({
    availability: "unavailable",
    targetId: predicate.targetId,
    targetLabel: currentLabel(predicate.targetId, snapshot),
    key: predicate.key,
    label: state?.label ?? predicate.key,
    valueType: state?.valueType ?? null,
  });
}

function unavailableTargetCommandOption(
  targetId: EmbeddedNodeId,
  type: string,
  snapshot: DocumentTreeSnapshot,
  catalogue: ControlCapabilityCatalogue,
): LearnerInteractionTargetCommandOption {
  const command = currentCapabilities(targetId, snapshot, catalogue)?.commands?.find(
    (candidate) => candidate.type === type,
  );
  return Object.freeze({
    availability: "unavailable",
    targetId,
    targetLabel: currentLabel(targetId, snapshot),
    type,
    label: command?.label ?? type,
    input: command?.input ?? null,
  });
}

function currentCapabilities(
  targetId: EmbeddedNodeId,
  snapshot: DocumentTreeSnapshot,
  catalogue: ControlCapabilityCatalogue,
) {
  if (!snapshot.itemById.has(targetId)) return undefined;
  const resolved = catalogue.resolve(targetId);
  if (resolved.isErr()) {
    if (resolved.error.reason === "target-not-public") {
      throw new Error(`Control catalogue rejected public semantic target "${targetId}".`);
    }
    return undefined;
  }
  if (resolved.value.targetId !== targetId) {
    throw new Error(
      `Control catalogue resolved target "${resolved.value.targetId}" for request "${targetId}".`,
    );
  }
  return resolved.value.capabilities;
}

function currentLabel(targetId: EmbeddedNodeId, snapshot: DocumentTreeSnapshot): string {
  return snapshot.itemById.get(targetId)?.label ?? targetId;
}

function diagnosticsAt(
  diagnostics: readonly LearnerInteractionCompileDiagnostic[],
  location: LearnerInteractionRuleLocation,
): readonly LearnerInteractionCompileDiagnostic[] {
  return Object.freeze(diagnostics.filter(({ source }) => sameLocation(source.location, location)));
}

function sameLocation(
  left: LearnerInteractionRuleLocation,
  right: LearnerInteractionRuleLocation,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "condition" && right.kind === "condition") {
    return left.conditionIndex === right.conditionIndex;
  }
  if (left.kind === "command" && right.kind === "command") {
    return left.commandIndex === right.commandIndex;
  }
  return true;
}
