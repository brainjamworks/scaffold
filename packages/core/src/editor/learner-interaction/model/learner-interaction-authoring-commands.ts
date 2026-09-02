import {
  LearnerInteractionConfigurationV1Schema,
  LearnerInteractionRuleV1Schema,
  type EmbeddedNodeId,
  type LearnerInteractionConfigurationV1,
  type LearnerInteractionRuleId,
  type LearnerInteractionRuleV1,
  type SurfaceLearnerInteractionRulesV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { Result, type Result as ResultType } from "better-result";

import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import {
  compileLearnerInteractions,
  type LearnerInteractionCompileDiagnostic,
} from "@/learner-interaction/model";

import {
  validateLearnerInteractionRuleDraft,
  type LearnerInteractionDraftDiagnostic,
  type LearnerInteractionRuleDraft,
} from "./learner-interaction-rule-draft";

export type LearnerInteractionAuthoringCommandError =
  | { readonly reason: "editor-destroyed" }
  | { readonly reason: "editor-read-only" }
  | {
      readonly reason: "surface-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "rule-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly ruleId: LearnerInteractionRuleId;
    }
  | {
      readonly reason: "rule-belongs-to-another-surface";
      readonly surfaceId: EmbeddedNodeId;
      readonly actualSurfaceId: EmbeddedNodeId;
      readonly ruleId: LearnerInteractionRuleId;
    }
  | {
      readonly reason: "invalid-rule-draft";
      readonly diagnostics: readonly LearnerInteractionDraftDiagnostic[];
    }
  | {
      readonly reason: "rule-unresolved";
      readonly surfaceId: EmbeddedNodeId;
      readonly ruleId: LearnerInteractionRuleId;
      readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
    }
  | {
      readonly reason: "rule-reorder-boundary";
      readonly surfaceId: EmbeddedNodeId;
      readonly ruleId: LearnerInteractionRuleId;
      readonly direction: "earlier" | "later";
    };

export type LearnerInteractionAuthoringCommandResult<T = void> = ResultType<
  T,
  LearnerInteractionAuthoringCommandError
>;

interface RuleCommandInput {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly ruleId: LearnerInteractionRuleId;
}

interface LearnerInteractionSource {
  readonly configuration: LearnerInteractionConfigurationV1 | null;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
}

export function saveLearnerInteractionRule({
  editor,
  surfaceId,
  draft,
}: {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly draft: LearnerInteractionRuleDraft;
}): LearnerInteractionAuthoringCommandResult<LearnerInteractionRuleId> {
  const prepared = prepareSurfaceMutation(editor, surfaceId);
  if (prepared.isErr()) return Result.err(prepared.error);

  const draftDiagnostics = validateLearnerInteractionRuleDraft(draft);
  if (draftDiagnostics.length > 0) {
    return Result.err(
      Object.freeze({ reason: "invalid-rule-draft", diagnostics: draftDiagnostics }),
    );
  }
  if (draft.when === null || draft.commands.length === 0) {
    throw new Error("A complete Learner Interaction draft lost a required source.");
  }

  if (draft.ruleId !== null) {
    const current = requireCurrentRule(prepared.value, surfaceId, draft.ruleId);
    if (current.isErr()) return Result.err(current.error);
  }
  const ruleId = draft.ruleId ?? createUnusedRuleId(prepared.value.configuration, surfaceId);
  const rule = LearnerInteractionRuleV1Schema.parse({
    id: ruleId,
    isEnabled: draft.isEnabled,
    when: draft.when,
    conditions: draft.conditions,
    commands: draft.commands,
  });
  const candidate = saveRule(
    prepared.value.configuration,
    surfaceId,
    rule,
    prepared.value.courseStructure,
  );
  const controller = getSemanticDocumentControllerForEditor(editor);
  const compilation = compileLearnerInteractions({
    configuration: candidate,
    courseStructure: prepared.value.courseStructure,
    semanticSnapshot: controller.getSnapshot().semantics,
    controlCapabilities: controller.getControlCapabilityCatalogue(),
  });
  const diagnostics = compilation.diagnostics.filter(
    ({ source }) => source.surfaceId === surfaceId && source.ruleId === ruleId,
  );
  if (diagnostics.length > 0) {
    return Result.err(
      Object.freeze({
        reason: "rule-unresolved",
        surfaceId,
        ruleId,
        diagnostics: Object.freeze(diagnostics),
      }),
    );
  }

  dispatchConfiguration(editor, candidate);
  return Result.ok(ruleId);
}

export function setLearnerInteractionRuleEnabled({
  editor,
  surfaceId,
  ruleId,
  isEnabled,
}: RuleCommandInput & {
  readonly isEnabled: boolean;
}): LearnerInteractionAuthoringCommandResult {
  const prepared = prepareRuleMutation(editor, surfaceId, ruleId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const rules = prepared.value.group.rules.map((rule) =>
    rule.id === ruleId ? { ...rule, isEnabled } : rule,
  );
  dispatchConfiguration(
    editor,
    replaceGroup(prepared.value.configuration!, { ...prepared.value.group, rules }),
  );
  return Result.ok();
}

export function reorderLearnerInteractionRule({
  editor,
  surfaceId,
  ruleId,
  direction,
}: RuleCommandInput & {
  readonly direction: "earlier" | "later";
}): LearnerInteractionAuthoringCommandResult {
  const prepared = prepareRuleMutation(editor, surfaceId, ruleId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const adjacentIndex = prepared.value.ruleIndex + (direction === "earlier" ? -1 : 1);
  const adjacent = prepared.value.group.rules[adjacentIndex];
  if (!adjacent) {
    return Result.err(
      Object.freeze({ reason: "rule-reorder-boundary", surfaceId, ruleId, direction }),
    );
  }
  const rules = [...prepared.value.group.rules];
  rules[prepared.value.ruleIndex] = adjacent;
  rules[adjacentIndex] = prepared.value.group.rules[prepared.value.ruleIndex]!;
  dispatchConfiguration(
    editor,
    replaceGroup(prepared.value.configuration!, { ...prepared.value.group, rules }),
  );
  return Result.ok();
}

export function removeLearnerInteractionRule({
  editor,
  surfaceId,
  ruleId,
}: RuleCommandInput): LearnerInteractionAuthoringCommandResult {
  const prepared = prepareRuleMutation(editor, surfaceId, ruleId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const rules = prepared.value.group.rules.filter((rule) => rule.id !== ruleId);
  const remainingGroups =
    rules.length === 0
      ? prepared.value.configuration!.surfaces.filter((group) => group.surfaceId !== surfaceId)
      : prepared.value.configuration!.surfaces.map((group) =>
          group.surfaceId === surfaceId ? { ...group, rules } : group,
        );
  const configuration =
    remainingGroups.length === 0
      ? null
      : LearnerInteractionConfigurationV1Schema.parse({
          ...prepared.value.configuration,
          surfaces: remainingGroups,
        });
  dispatchConfiguration(editor, configuration);
  return Result.ok();
}

function requireAvailableEditor(editor: Editor): LearnerInteractionAuthoringCommandResult {
  if (editor.isDestroyed) return Result.err(Object.freeze({ reason: "editor-destroyed" }));
  if (!editor.isEditable) return Result.err(Object.freeze({ reason: "editor-read-only" }));
  return Result.ok();
}

function readSource(editor: Editor): LearnerInteractionSource {
  const courseStructure = projectAuthoringCourseStructure(editor.state.doc);
  if (!courseStructure || courseStructure.kind !== "slideshow") {
    throw new Error("Learner Interaction authoring requires a valid Slideshow Course Document.");
  }
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const value = courseDocument.attrs["learnerInteractions"];
  return {
    configuration:
      value === null || value === undefined
        ? null
        : LearnerInteractionConfigurationV1Schema.parse(value),
    courseStructure,
  };
}

function prepareSurfaceMutation(
  editor: Editor,
  surfaceId: EmbeddedNodeId,
): LearnerInteractionAuthoringCommandResult<LearnerInteractionSource> {
  const available = requireAvailableEditor(editor);
  if (available.isErr()) return Result.err(available.error);
  const source = readSource(editor);
  if (!source.courseStructure.surfaceById[surfaceId]) {
    return Result.err(
      Object.freeze({
        reason: "surface-not-current",
        surfaceId,
        currentSurfaceIds: source.courseStructure.surfaceIds,
      }),
    );
  }
  return Result.ok(source);
}

function prepareRuleMutation(
  editor: Editor,
  surfaceId: EmbeddedNodeId,
  ruleId: LearnerInteractionRuleId,
): LearnerInteractionAuthoringCommandResult<
  LearnerInteractionSource & {
    readonly configuration: LearnerInteractionConfigurationV1;
    readonly group: SurfaceLearnerInteractionRulesV1;
    readonly ruleIndex: number;
  }
> {
  const prepared = prepareSurfaceMutation(editor, surfaceId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const current = requireCurrentRule(prepared.value, surfaceId, ruleId);
  if (current.isErr()) return Result.err(current.error);
  return Result.ok({ ...prepared.value, ...current.value });
}

function requireCurrentRule(
  source: LearnerInteractionSource,
  surfaceId: EmbeddedNodeId,
  ruleId: LearnerInteractionRuleId,
): LearnerInteractionAuthoringCommandResult<{
  readonly configuration: LearnerInteractionConfigurationV1;
  readonly group: SurfaceLearnerInteractionRulesV1;
  readonly ruleIndex: number;
}> {
  const group = source.configuration?.surfaces.find(
    (candidate) => candidate.surfaceId === surfaceId,
  );
  const ruleIndex = group?.rules.findIndex((rule) => rule.id === ruleId) ?? -1;
  if (source.configuration && group && ruleIndex >= 0) {
    return Result.ok({ configuration: source.configuration, group, ruleIndex });
  }
  const actualGroup = source.configuration?.surfaces.find((candidate) =>
    candidate.rules.some((rule) => rule.id === ruleId),
  );
  return actualGroup
    ? Result.err(
        Object.freeze({
          reason: "rule-belongs-to-another-surface",
          surfaceId,
          actualSurfaceId: actualGroup.surfaceId,
          ruleId,
        }),
      )
    : Result.err(Object.freeze({ reason: "rule-not-current", surfaceId, ruleId }));
}

function createUnusedRuleId(
  configuration: LearnerInteractionConfigurationV1 | null,
  surfaceId: EmbeddedNodeId,
): LearnerInteractionRuleId {
  const used = new Set(
    configuration?.surfaces
      .find((candidate) => candidate.surfaceId === surfaceId)
      ?.rules.map(({ id }) => id) ?? [],
  );
  let id = createEmbeddedDataId();
  while (used.has(id)) id = createEmbeddedDataId();
  return id;
}

function saveRule(
  configuration: LearnerInteractionConfigurationV1 | null,
  surfaceId: EmbeddedNodeId,
  rule: LearnerInteractionRuleV1,
  courseStructure: ProjectedSlideshowCourseStructure,
): LearnerInteractionConfigurationV1 {
  const currentGroup = configuration?.surfaces.find((group) => group.surfaceId === surfaceId);
  const rules = currentGroup
    ? currentGroup.rules.some(({ id }) => id === rule.id)
      ? currentGroup.rules.map((candidate) => (candidate.id === rule.id ? rule : candidate))
      : [...currentGroup.rules, rule]
    : [rule];
  const group = { surfaceId, rules };
  const groups = currentGroup
    ? configuration!.surfaces.map((candidate) =>
        candidate.surfaceId === surfaceId ? group : candidate,
      )
    : [...(configuration?.surfaces ?? []), group].sort(
        (left, right) =>
          courseStructure.surfaceById[left.surfaceId]!.index -
          courseStructure.surfaceById[right.surfaceId]!.index,
      );
  return LearnerInteractionConfigurationV1Schema.parse({ schemaVersion: 1, surfaces: groups });
}

function replaceGroup(
  configuration: LearnerInteractionConfigurationV1,
  group: SurfaceLearnerInteractionRulesV1,
): LearnerInteractionConfigurationV1 {
  return LearnerInteractionConfigurationV1Schema.parse({
    ...configuration,
    surfaces: configuration.surfaces.map((candidate) =>
      candidate.surfaceId === group.surfaceId ? group : candidate,
    ),
  });
}

function dispatchConfiguration(
  editor: Editor,
  learnerInteractions: LearnerInteractionConfigurationV1 | null,
): void {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const tr = editor.state.tr.setNodeMarkup(0, undefined, {
    ...courseDocument.attrs,
    learnerInteractions,
  });
  tr.doc.check();
  editor.view.dispatch(tr);
}
