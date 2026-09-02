import type {
  ControlCommandReferenceV1,
  ControlEventReferenceV1,
  ControlStatePredicateV1,
  EmbeddedNodeId,
  LearnerInteractionCommandV1,
  LearnerInteractionConfigurationV1,
  LearnerInteractionRuleId,
  LearnerInteractionRuleV1,
} from "@scaffold/contracts";

import type { ControlCapabilityCatalogue } from "@/document/control-binding/control-capability-catalogue";
import type { ControlValue } from "@/document/control-binding/control-definition";
import {
  isControlCommandInputValid,
  isControlValueValid,
} from "@/document/control-binding/control-value-validation";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { SemanticDocumentSnapshot } from "@/document/model/semantic-document/semantic-document-snapshot";

import {
  createLearnerInteractionEventKey,
  type CompiledControlEventReference,
  type CompiledControlStatePredicate,
  type CompiledLearnerInteractionCommand,
  type CompiledLearnerInteractionRule,
  type CompiledSurfaceLearnerInteractionProgram,
} from "./compiled-learner-interaction-program";

export interface CompileLearnerInteractionsInput {
  readonly configuration: LearnerInteractionConfigurationV1 | null;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly semanticSnapshot: SemanticDocumentSnapshot;
  readonly controlCapabilities: ControlCapabilityCatalogue;
}

export interface LearnerInteractionCompilation {
  readonly surfaceById: ReadonlyMap<EmbeddedNodeId, CompiledSurfaceLearnerInteractionProgram>;
  readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
}

export type LearnerInteractionRuleLocation =
  | { readonly kind: "when" }
  | { readonly kind: "condition"; readonly conditionIndex: number }
  | { readonly kind: "command"; readonly commandIndex: number };

export interface LearnerInteractionRuleSource {
  readonly surfaceId: EmbeddedNodeId;
  readonly ruleId: LearnerInteractionRuleId;
  readonly location: LearnerInteractionRuleLocation;
}

export type LearnerInteractionCompileDiagnostic =
  | {
      readonly reason: "target-not-public";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "target-outside-rule-surface";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
      readonly targetSurfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "event-not-declared";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
    }
  | {
      readonly reason: "state-not-declared";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
      readonly key: string;
    }
  | {
      readonly reason: "state-value-invalid";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
      readonly key: string;
      readonly value: ControlValue;
    }
  | {
      readonly reason: "command-not-declared";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
    }
  | {
      readonly reason: "command-input-invalid";
      readonly source: LearnerInteractionRuleSource;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
      readonly input:
        | { readonly kind: "absent" }
        | { readonly kind: "value"; readonly value: ControlValue };
    }
  | {
      readonly reason: "surface-not-found";
      readonly source: LearnerInteractionRuleSource;
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "navigation-target-is-rule-surface";
      readonly source: LearnerInteractionRuleSource;
      readonly surfaceId: EmbeddedNodeId;
    };

export function compileLearnerInteractions({
  configuration,
  courseStructure,
  semanticSnapshot,
  controlCapabilities,
}: CompileLearnerInteractionsInput): LearnerInteractionCompilation {
  const surfaceById = new Map<EmbeddedNodeId, CompiledSurfaceLearnerInteractionProgram>();
  const diagnostics: LearnerInteractionCompileDiagnostic[] = [];

  if (configuration === null) return freezeCompilation(surfaceById, diagnostics);

  for (const surface of configuration.surfaces) {
    if (!courseStructure.surfaceById[surface.surfaceId]) {
      throw new Error(
        `Learner Interaction Surface group "${surface.surfaceId}" is not in Course Structure.`,
      );
    }

    const rulesByEvent = new Map<string, CompiledLearnerInteractionRule[]>();
    for (const rule of surface.rules) {
      const diagnosticStart = diagnostics.length;
      const when = compileEvent(
        rule.when,
        ruleSource(surface.surfaceId, rule.id, { kind: "when" }),
        surface.surfaceId,
        semanticSnapshot,
        controlCapabilities,
        diagnostics,
      );
      const conditions = rule.conditions.map((condition, conditionIndex) =>
        compileCondition(
          condition,
          ruleSource(surface.surfaceId, rule.id, { kind: "condition", conditionIndex }),
          surface.surfaceId,
          semanticSnapshot,
          controlCapabilities,
          diagnostics,
        ),
      );
      const commands = rule.commands.map((command, commandIndex) =>
        compileCommand(
          command,
          ruleSource(surface.surfaceId, rule.id, { kind: "command", commandIndex }),
          surface.surfaceId,
          courseStructure,
          semanticSnapshot,
          controlCapabilities,
          diagnostics,
        ),
      );

      if (diagnostics.length !== diagnosticStart || !when) continue;
      const compiledRule = freezeCompiledRule(rule, when, conditions, commands);
      if (!rule.isEnabled) continue;
      const eventKey = createLearnerInteractionEventKey(when);
      const bucket = rulesByEvent.get(eventKey);
      if (bucket) bucket.push(compiledRule);
      else rulesByEvent.set(eventKey, [compiledRule]);
    }

    const readonlyRulesByEvent = freezeReadonlyMap(
      new Map(
        [...rulesByEvent].map(([eventKey, rules]) => [eventKey, Object.freeze(rules)] as const),
      ),
    );
    surfaceById.set(
      surface.surfaceId,
      Object.freeze({
        surfaceId: surface.surfaceId,
        rulesByEvent: readonlyRulesByEvent,
      }),
    );
  }

  return freezeCompilation(surfaceById, diagnostics);
}

function compileEvent(
  reference: ControlEventReferenceV1,
  source: LearnerInteractionRuleSource,
  ruleSurfaceId: EmbeddedNodeId,
  semanticSnapshot: SemanticDocumentSnapshot,
  controlCapabilities: ControlCapabilityCatalogue,
  diagnostics: LearnerInteractionCompileDiagnostic[],
): CompiledControlEventReference | undefined {
  if (
    !validateTargetSurface(reference.targetId, source, ruleSurfaceId, semanticSnapshot, diagnostics)
  ) {
    return undefined;
  }
  const resolved = controlCapabilities.resolve(reference.targetId);
  if (resolved.isErr()) {
    assertCatalogueTargetRemainsPublic(resolved.error.reason, reference.targetId);
    diagnostics.push(
      Object.freeze({
        reason: "event-not-declared",
        source,
        targetId: reference.targetId,
        type: reference.type,
      }),
    );
    return undefined;
  }
  assertResolvedTargetIdentity(resolved.value.targetId, reference.targetId);
  if (!resolved.value.capabilities.events?.some((event) => event.type === reference.type)) {
    diagnostics.push(
      Object.freeze({
        reason: "event-not-declared",
        source,
        targetId: reference.targetId,
        type: reference.type,
      }),
    );
    return undefined;
  }
  return Object.freeze({
    ownerId: resolved.value.ownerId,
    targetId: reference.targetId,
    type: reference.type,
  });
}

function compileCondition(
  predicate: ControlStatePredicateV1,
  source: LearnerInteractionRuleSource,
  ruleSurfaceId: EmbeddedNodeId,
  semanticSnapshot: SemanticDocumentSnapshot,
  controlCapabilities: ControlCapabilityCatalogue,
  diagnostics: LearnerInteractionCompileDiagnostic[],
): CompiledControlStatePredicate | undefined {
  if (
    !validateTargetSurface(predicate.targetId, source, ruleSurfaceId, semanticSnapshot, diagnostics)
  ) {
    return undefined;
  }
  const resolved = controlCapabilities.resolve(predicate.targetId);
  if (resolved.isErr()) {
    assertCatalogueTargetRemainsPublic(resolved.error.reason, predicate.targetId);
    diagnostics.push(
      Object.freeze({
        reason: "state-not-declared",
        source,
        targetId: predicate.targetId,
        key: predicate.key,
      }),
    );
    return undefined;
  }
  assertResolvedTargetIdentity(resolved.value.targetId, predicate.targetId);
  const state = resolved.value.capabilities.states?.find(
    (candidate) => candidate.key === predicate.key,
  );
  if (!state) {
    diagnostics.push(
      Object.freeze({
        reason: "state-not-declared",
        source,
        targetId: predicate.targetId,
        key: predicate.key,
      }),
    );
    return undefined;
  }
  if (!isControlValueValid(predicate.value, state.valueType)) {
    diagnostics.push(
      Object.freeze({
        reason: "state-value-invalid",
        source,
        targetId: predicate.targetId,
        key: predicate.key,
        value: predicate.value,
      }),
    );
    return undefined;
  }
  return Object.freeze({
    ownerId: resolved.value.ownerId,
    targetId: predicate.targetId,
    key: predicate.key,
    operator: predicate.operator,
    value: predicate.value,
  });
}

function compileCommand(
  command: LearnerInteractionCommandV1,
  source: LearnerInteractionRuleSource,
  ruleSurfaceId: EmbeddedNodeId,
  courseStructure: ProjectedSlideshowCourseStructure,
  semanticSnapshot: SemanticDocumentSnapshot,
  controlCapabilities: ControlCapabilityCatalogue,
  diagnostics: LearnerInteractionCompileDiagnostic[],
): CompiledLearnerInteractionCommand | undefined {
  if (command.kind === "navigate-surface") {
    if (command.surfaceId === ruleSurfaceId) {
      diagnostics.push(
        Object.freeze({
          reason: "navigation-target-is-rule-surface",
          source,
          surfaceId: command.surfaceId,
        }),
      );
      return undefined;
    }
    if (!courseStructure.surfaceById[command.surfaceId]) {
      diagnostics.push(
        Object.freeze({ reason: "surface-not-found", source, surfaceId: command.surfaceId }),
      );
      return undefined;
    }
    return Object.freeze({ kind: "navigate-surface", surfaceId: command.surfaceId });
  }

  const targetId = command.kind === "reveal-target" ? command.targetId : command.command.targetId;
  if (!validateTargetSurface(targetId, source, ruleSurfaceId, semanticSnapshot, diagnostics)) {
    return undefined;
  }
  if (command.kind === "reveal-target") {
    return Object.freeze({ kind: "reveal-target", targetId: command.targetId });
  }
  return compileTargetCommand(command.command, source, controlCapabilities, diagnostics);
}

function compileTargetCommand(
  reference: ControlCommandReferenceV1,
  source: LearnerInteractionRuleSource,
  controlCapabilities: ControlCapabilityCatalogue,
  diagnostics: LearnerInteractionCompileDiagnostic[],
): CompiledLearnerInteractionCommand | undefined {
  const resolved = controlCapabilities.resolveCommand(reference.targetId, reference.type);
  if (resolved.isErr()) {
    assertCatalogueTargetRemainsPublic(resolved.error.reason, reference.targetId);
    diagnostics.push(
      Object.freeze({
        reason: "command-not-declared",
        source,
        targetId: reference.targetId,
        type: reference.type,
      }),
    );
    return undefined;
  }
  assertResolvedTargetIdentity(resolved.value.targetId, reference.targetId);
  const hasInput = Object.hasOwn(reference, "input");
  if (!isControlCommandInputValid(reference.input, resolved.value.command.input, hasInput)) {
    diagnostics.push(
      Object.freeze({
        reason: "command-input-invalid",
        source,
        targetId: reference.targetId,
        type: reference.type,
        input: Object.freeze(
          reference.input === undefined
            ? { kind: "absent" as const }
            : { kind: "value" as const, value: reference.input },
        ),
      }),
    );
    return undefined;
  }
  return Object.freeze({
    kind: "target-command",
    ownerId: resolved.value.ownerId,
    targetId: reference.targetId,
    type: reference.type,
    ...(hasInput ? { input: reference.input } : {}),
  }) as CompiledLearnerInteractionCommand;
}

function validateTargetSurface(
  targetId: EmbeddedNodeId,
  source: LearnerInteractionRuleSource,
  ruleSurfaceId: EmbeddedNodeId,
  semanticSnapshot: SemanticDocumentSnapshot,
  diagnostics: LearnerInteractionCompileDiagnostic[],
): boolean {
  if (!semanticSnapshot.itemById.has(targetId)) {
    diagnostics.push(Object.freeze({ reason: "target-not-public", source, targetId }));
    return false;
  }
  const location = semanticSnapshot.locationById.get(targetId);
  if (!location) {
    throw new Error(`Public semantic target "${targetId}" has no location.`);
  }
  if (location.surfaceId === null) {
    diagnostics.push(Object.freeze({ reason: "target-not-public", source, targetId }));
    return false;
  }
  if (location.surfaceId !== ruleSurfaceId) {
    diagnostics.push(
      Object.freeze({
        reason: "target-outside-rule-surface",
        source,
        targetId,
        targetSurfaceId: location.surfaceId,
      }),
    );
    return false;
  }
  return true;
}

function ruleSource(
  surfaceId: EmbeddedNodeId,
  ruleId: LearnerInteractionRuleId,
  location: LearnerInteractionRuleLocation,
): LearnerInteractionRuleSource {
  return Object.freeze({ surfaceId, ruleId, location: Object.freeze(location) });
}

function freezeCompiledRule(
  rule: LearnerInteractionRuleV1,
  when: CompiledControlEventReference,
  conditions: readonly (CompiledControlStatePredicate | undefined)[],
  commands: readonly (CompiledLearnerInteractionCommand | undefined)[],
): CompiledLearnerInteractionRule {
  if (
    conditions.some((condition) => condition === undefined) ||
    commands.some((command) => command === undefined)
  ) {
    throw new Error(
      `Learner Interaction rule "${rule.id}" lost a compiled source without a diagnostic.`,
    );
  }
  return Object.freeze({
    id: rule.id,
    when,
    conditions: Object.freeze(conditions) as readonly CompiledControlStatePredicate[],
    commands: Object.freeze(commands) as readonly [
      CompiledLearnerInteractionCommand,
      ...CompiledLearnerInteractionCommand[],
    ],
  });
}

function freezeCompilation(
  surfaceById: Map<EmbeddedNodeId, CompiledSurfaceLearnerInteractionProgram>,
  diagnostics: LearnerInteractionCompileDiagnostic[],
): LearnerInteractionCompilation {
  return Object.freeze({
    surfaceById: freezeReadonlyMap(surfaceById),
    diagnostics: Object.freeze(diagnostics),
  });
}

function freezeReadonlyMap<Key, Value>(entries: ReadonlyMap<Key, Value>): ReadonlyMap<Key, Value> {
  const source = new Map(entries);
  let view: ReadonlyMap<Key, Value>;
  view = Object.freeze({
    get size() {
      return source.size;
    },
    get(key: Key) {
      return source.get(key);
    },
    has(key: Key) {
      return source.has(key);
    },
    forEach(
      callback: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
      thisArg?: unknown,
    ) {
      source.forEach((value, key) => callback.call(thisArg, value, key, view));
    },
    entries() {
      return source.entries();
    },
    keys() {
      return source.keys();
    },
    values() {
      return source.values();
    },
    [Symbol.iterator]() {
      return source[Symbol.iterator]();
    },
  });
  return view;
}

function assertCatalogueTargetRemainsPublic(reason: string, targetId: EmbeddedNodeId): void {
  if (reason === "target-not-public") {
    throw new Error(`Control catalogue rejected public semantic target "${targetId}".`);
  }
}

function assertResolvedTargetIdentity(
  resolvedTargetId: EmbeddedNodeId,
  requestedTargetId: EmbeddedNodeId,
): void {
  if (resolvedTargetId !== requestedTargetId) {
    throw new Error(
      `Control catalogue resolved target "${resolvedTargetId}" for request "${requestedTargetId}".`,
    );
  }
}
