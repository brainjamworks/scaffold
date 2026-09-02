import {
  PresentationConfigurationV1Schema,
  SurfacePresentationNarrationV1Schema,
  SurfaceTransitionV1Schema,
  TimelineActionV1Schema,
  type EmbeddedDataId,
  type EmbeddedNodeId,
  type PresentationConfigurationV1,
  type SurfacePresentationTimelineV1,
  type SurfacePresentationNarrationV1,
  type SurfaceTransitionV1,
  type TimelineActionV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { Result, type Result as ResultType } from "better-result";

import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import { compilePresentation, type PresentationCompilationError } from "@/presentation/model";

type PresentationAuthoringCompilationError = Exclude<
  PresentationCompilationError,
  { readonly reason: "surface-coverage-missing" }
>;

export type PresentationAuthoringCommandError =
  | { readonly reason: "editor-destroyed" }
  | { readonly reason: "editor-read-only" }
  | {
      readonly reason: "surface-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "invalid-surface-duration";
      readonly surfaceId: EmbeddedNodeId;
      readonly durationMs: number;
    }
  | {
      readonly reason: "surface-duration-before-action-end";
      readonly surfaceId: EmbeddedNodeId;
      readonly durationMs: number;
      readonly blockingActionId: EmbeddedDataId;
      readonly requiredDurationMs: number;
    }
  | {
      readonly reason: "invalid-surface-narration";
      readonly surfaceId: EmbeddedNodeId;
      readonly issues: readonly PresentationAuthoringInputIssue[];
    }
  | {
      readonly reason: "invalid-surface-transition";
      readonly surfaceId: EmbeddedNodeId;
      readonly issues: readonly PresentationAuthoringInputIssue[];
    }
  | {
      readonly reason: "invalid-new-action";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly issues: readonly PresentationAuthoringInputIssue[];
    }
  | {
      readonly reason: "invalid-action-update";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly issues: readonly PresentationAuthoringInputIssue[];
    }
  | {
      readonly reason: "action-outside-surface-duration";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly atMs: number;
      readonly endMs: number;
      readonly surfaceDurationMs: number;
    }
  | {
      readonly reason: "wait-time-occupied";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly blockingActionId: EmbeddedDataId;
      readonly atMs: number;
    }
  | {
      readonly reason: "action-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
    }
  | {
      readonly reason: "action-belongs-to-another-surface";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
    }
  | {
      readonly reason: "action-reorder-boundary";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly atMs: number;
      readonly direction: "earlier" | "later";
    }
  | PresentationAuthoringCompilationError;

export interface PresentationAuthoringInputIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type PresentationAuthoringCommandResult<T = void> = ResultType<
  T,
  PresentationAuthoringCommandError
>;

type WithoutId<T> = T extends { readonly id: EmbeddedDataId } ? Omit<T, "id"> : never;
export type NewPresentationTimelineAction = WithoutId<TimelineActionV1>;

interface ActionCommandInput {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly actionId: EmbeddedDataId;
}

export function createPresentationAction({
  editor,
  surfaceId,
  action,
}: {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly action: NewPresentationTimelineAction;
}): PresentationAuthoringCommandResult<EmbeddedDataId> {
  const created = createPresentationActions({ editor, surfaceId, actions: [action] });
  return created.isErr() ? Result.err(created.error) : Result.ok(created.value[0]!);
}

export function createPresentationActions({
  editor,
  surfaceId,
  actions,
}: {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly actions: readonly [NewPresentationTimelineAction, ...NewPresentationTimelineAction[]];
}): PresentationAuthoringCommandResult<readonly EmbeddedDataId[]> {
  const prepared = prepareSurfaceMutation(editor, surfaceId);
  if (prepared.isErr()) return Result.err(prepared.error);

  const ids: EmbeddedDataId[] = [];
  const created: TimelineActionV1[] = [];
  let timeline = prepared.value.timeline;
  for (const action of actions) {
    const id = createUnusedActionId(prepared.value.configuration, ids);
    const parsed = TimelineActionV1Schema.safeParse({ ...action, id });
    if (!parsed.success) {
      return Result.err(
        Object.freeze({
          reason: "invalid-new-action",
          surfaceId,
          actionId: id,
          issues: freezeInputIssues(parsed.error.issues),
        }),
      );
    }
    const schedule = validateActionSchedule(timeline, parsed.data);
    if (schedule.isErr()) return Result.err(schedule.error);
    ids.push(id);
    created.push(parsed.data);
    timeline = { ...timeline, actions: [...timeline.actions, parsed.data] };
  }

  const next = replaceTimeline(
    prepared.value.configuration,
    prepared.value.timeline,
    stableTimeOrder([...prepared.value.timeline.actions, ...created]),
  );
  const written = validateAndDispatch(editor, next, prepared.value.courseStructure, ids);
  return written.isErr() ? Result.err(written.error) : Result.ok(Object.freeze(ids));
}

export function updatePresentationAction({
  editor,
  surfaceId,
  actionId,
  action,
}: ActionCommandInput & {
  readonly action: NewPresentationTimelineAction;
}): PresentationAuthoringCommandResult {
  const prepared = prepareActionMutation(editor, surfaceId, actionId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const parsed = TimelineActionV1Schema.safeParse({ ...action, id: actionId });
  if (!parsed.success) {
    return Result.err(
      Object.freeze({
        reason: "invalid-action-update",
        surfaceId,
        actionId,
        issues: freezeInputIssues(parsed.error.issues),
      }),
    );
  }
  const replacement = parsed.data;
  const schedule = validateActionSchedule(prepared.value.timeline, replacement, actionId);
  if (schedule.isErr()) return Result.err(schedule.error);
  const actions = [...prepared.value.timeline.actions];
  actions[prepared.value.actionIndex] = replacement;
  return validateAndDispatch(
    editor,
    replaceTimeline(
      prepared.value.configuration,
      prepared.value.timeline,
      stableTimeOrder(actions),
    ),
    prepared.value.courseStructure,
    [actionId],
  );
}

export function removePresentationAction(
  input: ActionCommandInput,
): PresentationAuthoringCommandResult {
  const prepared = prepareActionMutation(input.editor, input.surfaceId, input.actionId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const actions = prepared.value.timeline.actions.filter(({ id }) => id !== input.actionId);
  return validateAndDispatch(
    input.editor,
    replaceTimeline(prepared.value.configuration, prepared.value.timeline, actions),
    prepared.value.courseStructure,
  );
}

export function setPresentationActionEnabled({
  editor,
  surfaceId,
  actionId,
  isEnabled,
}: ActionCommandInput & { readonly isEnabled: boolean }): PresentationAuthoringCommandResult {
  const prepared = prepareActionMutation(editor, surfaceId, actionId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const actions = prepared.value.timeline.actions.map((action) =>
    action.id === actionId ? { ...action, isEnabled } : action,
  );
  return validateAndDispatch(
    editor,
    replaceTimeline(prepared.value.configuration, prepared.value.timeline, actions),
    prepared.value.courseStructure,
  );
}

export function reorderPresentationAction({
  editor,
  surfaceId,
  actionId,
  direction,
}: ActionCommandInput & {
  readonly direction: "earlier" | "later";
}): PresentationAuthoringCommandResult {
  const prepared = prepareActionMutation(editor, surfaceId, actionId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const action = prepared.value.timeline.actions[prepared.value.actionIndex]!;
  const adjacentIndex = prepared.value.actionIndex + (direction === "earlier" ? -1 : 1);
  const adjacent = prepared.value.timeline.actions[adjacentIndex];
  if (!adjacent || adjacent.atMs !== action.atMs) {
    return Result.err(
      Object.freeze({
        reason: "action-reorder-boundary",
        surfaceId,
        actionId,
        atMs: action.atMs,
        direction,
      }),
    );
  }

  const actions = [...prepared.value.timeline.actions];
  actions[prepared.value.actionIndex] = adjacent;
  actions[adjacentIndex] = action;
  return validateAndDispatch(
    editor,
    replaceTimeline(prepared.value.configuration, prepared.value.timeline, actions),
    prepared.value.courseStructure,
  );
}

export function setPresentationSurfaceDuration({
  editor,
  surfaceId,
  durationMs,
}: {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly durationMs: number;
}): PresentationAuthoringCommandResult {
  const available = requireAvailableEditor(editor);
  if (available.isErr()) return Result.err(available.error);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    return Result.err(Object.freeze({ reason: "invalid-surface-duration", surfaceId, durationMs }));
  }

  const source = readPresentationSource(editor);
  if (!source.currentSurfaceIds.includes(surfaceId)) {
    return Result.err(
      Object.freeze({
        reason: "surface-not-current",
        surfaceId,
        currentSurfaceIds: source.currentSurfaceIds,
      }),
    );
  }

  const configuration = source.configuration ?? createConfiguration(source.currentSurfaceIds);
  const timeline = configuration.surfaces.find((surface) => surface.surfaceId === surfaceId);
  if (!timeline) {
    throw new Error(`Presentation configuration has no Timeline for Surface "${surfaceId}".`);
  }
  const blockingAction = timeline.actions
    .map((action) => ({ action, endMs: action.atMs + actionDuration(action) }))
    .filter(({ endMs }) => endMs > durationMs)
    .sort((left, right) => right.endMs - left.endMs)[0];
  if (blockingAction) {
    return Result.err(
      Object.freeze({
        reason: "surface-duration-before-action-end",
        surfaceId,
        durationMs,
        blockingActionId: blockingAction.action.id,
        requiredDurationMs: blockingAction.endMs,
      }),
    );
  }
  const next = PresentationConfigurationV1Schema.parse({
    ...configuration,
    surfaces: configuration.surfaces.map((surface) =>
      surface.surfaceId === surfaceId ? { ...surface, durationMs } : surface,
    ),
  });
  return validateAndDispatch(editor, next, source.courseStructure);
}

export function setPresentationSurfaceNarration({
  editor,
  surfaceId,
  narration,
}: {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly narration: SurfacePresentationNarrationV1 | null;
}): PresentationAuthoringCommandResult {
  const prepared = prepareSurfaceMutation(editor, surfaceId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const { narration: _currentNarration, ...timeline } = prepared.value.timeline;
  const parsed = narration ? SurfacePresentationNarrationV1Schema.safeParse(narration) : null;
  if (parsed && !parsed.success) {
    return Result.err(
      Object.freeze({
        reason: "invalid-surface-narration",
        surfaceId,
        issues: freezeInputIssues(parsed.error.issues),
      }),
    );
  }
  const nextTimeline = parsed ? { ...timeline, narration: parsed.data } : timeline;
  return validateAndDispatch(
    editor,
    replaceSurfaceTimeline(prepared.value.configuration, nextTimeline),
    prepared.value.courseStructure,
  );
}

export function setPresentationSurfaceTransition({
  editor,
  surfaceId,
  transition,
}: {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly transition: SurfaceTransitionV1 | null;
}): PresentationAuthoringCommandResult {
  const prepared = prepareSurfaceMutation(editor, surfaceId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const { transition: _currentTransition, ...timeline } = prepared.value.timeline;
  const parsed = transition ? SurfaceTransitionV1Schema.safeParse(transition) : null;
  if (parsed && !parsed.success) {
    return Result.err(
      Object.freeze({
        reason: "invalid-surface-transition",
        surfaceId,
        issues: freezeInputIssues(parsed.error.issues),
      }),
    );
  }
  const nextTimeline = parsed ? { ...timeline, transition: parsed.data } : timeline;
  return validateAndDispatch(
    editor,
    replaceSurfaceTimeline(prepared.value.configuration, nextTimeline),
    prepared.value.courseStructure,
  );
}

function requireAvailableEditor(editor: Editor): PresentationAuthoringCommandResult {
  if (editor.isDestroyed) return Result.err(Object.freeze({ reason: "editor-destroyed" }));
  if (!editor.isEditable) return Result.err(Object.freeze({ reason: "editor-read-only" }));
  return Result.ok();
}

function prepareSurfaceMutation(
  editor: Editor,
  surfaceId: EmbeddedNodeId,
): PresentationAuthoringCommandResult<{
  readonly configuration: PresentationConfigurationV1;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly timeline: SurfacePresentationTimelineV1;
}> {
  const available = requireAvailableEditor(editor);
  if (available.isErr()) return Result.err(available.error);
  const source = readPresentationSource(editor);
  if (!source.currentSurfaceIds.includes(surfaceId)) {
    return Result.err(
      Object.freeze({
        reason: "surface-not-current",
        surfaceId,
        currentSurfaceIds: source.currentSurfaceIds,
      }),
    );
  }
  const configuration = source.configuration ?? createConfiguration(source.currentSurfaceIds);
  const timeline = configuration.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!timeline) {
    throw new Error(`Presentation configuration has no Timeline for Surface "${surfaceId}".`);
  }
  return Result.ok({ configuration, courseStructure: source.courseStructure, timeline });
}

function prepareActionMutation(
  editor: Editor,
  surfaceId: EmbeddedNodeId,
  actionId: EmbeddedDataId,
): PresentationAuthoringCommandResult<{
  readonly actionIndex: number;
  readonly configuration: PresentationConfigurationV1;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly timeline: SurfacePresentationTimelineV1;
}> {
  const prepared = prepareSurfaceMutation(editor, surfaceId);
  if (prepared.isErr()) return Result.err(prepared.error);
  const actionIndex = prepared.value.timeline.actions.findIndex(({ id }) => id === actionId);
  if (actionIndex >= 0) return Result.ok({ ...prepared.value, actionIndex });

  const currentSurface = prepared.value.configuration.surfaces.find((timeline) =>
    timeline.actions.some(({ id }) => id === actionId),
  );
  if (currentSurface) {
    return Result.err(
      Object.freeze({
        reason: "action-belongs-to-another-surface",
        surfaceId,
        currentSurfaceId: currentSurface.surfaceId,
        actionId,
      }),
    );
  }
  return Result.err(Object.freeze({ reason: "action-not-current", surfaceId, actionId }));
}

function readPresentationSource(editor: Editor): {
  readonly configuration: PresentationConfigurationV1 | null;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly currentSurfaceIds: readonly EmbeddedNodeId[];
} {
  const courseStructure = projectAuthoringCourseStructure(editor.state.doc);
  if (!courseStructure || courseStructure.kind !== "slideshow") {
    throw new Error("Presentation authoring requires a valid Slideshow Course Document.");
  }
  const courseDocument = editor.state.doc.firstChild!;
  const value = courseDocument.attrs["presentation"];
  return {
    configuration:
      value === null || value === undefined ? null : PresentationConfigurationV1Schema.parse(value),
    courseStructure,
    currentSurfaceIds: courseStructure.surfaceIds,
  };
}

function createConfiguration(surfaceIds: readonly EmbeddedNodeId[]): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: surfaceIds.map(createEmptyTimeline),
  };
}

function createEmptyTimeline(surfaceId: EmbeddedNodeId): SurfacePresentationTimelineV1 {
  return { surfaceId, durationMs: 0, actions: [] };
}

function createUnusedActionId(
  configuration: PresentationConfigurationV1,
  reserved: readonly EmbeddedDataId[] = [],
): EmbeddedDataId {
  const used = new Set(
    configuration.surfaces.flatMap(({ actions }) => actions.map(({ id }) => id)).concat(reserved),
  );
  let id = createEmbeddedDataId();
  while (used.has(id)) id = createEmbeddedDataId();
  return id;
}

function stableTimeOrder(actions: readonly TimelineActionV1[]): readonly TimelineActionV1[] {
  return [...actions].sort((left, right) => left.atMs - right.atMs);
}

function actionDuration(action: TimelineActionV1): number {
  if (action.kind !== "animate") return 0;
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

function validateActionSchedule(
  timeline: SurfacePresentationTimelineV1,
  action: TimelineActionV1,
  replacedActionId?: EmbeddedDataId,
): PresentationAuthoringCommandResult {
  const endMs = action.atMs + actionDuration(action);
  if (endMs > timeline.durationMs) {
    return Result.err(
      Object.freeze({
        reason: "action-outside-surface-duration",
        surfaceId: timeline.surfaceId,
        actionId: action.id,
        atMs: action.atMs,
        endMs,
        surfaceDurationMs: timeline.durationMs,
      }),
    );
  }
  if (action.kind !== "manual-wait" && action.kind !== "learner-wait") return Result.ok();
  const blocking = timeline.actions.find(
    (candidate) =>
      candidate.id !== replacedActionId &&
      (candidate.kind === "manual-wait" || candidate.kind === "learner-wait") &&
      candidate.atMs === action.atMs,
  );
  return blocking
    ? Result.err(
        Object.freeze({
          reason: "wait-time-occupied",
          surfaceId: timeline.surfaceId,
          actionId: action.id,
          blockingActionId: blocking.id,
          atMs: action.atMs,
        }),
      )
    : Result.ok();
}

function freezeInputIssues(
  issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
): readonly PresentationAuthoringInputIssue[] {
  return Object.freeze(
    issues.map(({ path, message }) => Object.freeze({ path: Object.freeze([...path]), message })),
  );
}

function replaceTimeline(
  configuration: PresentationConfigurationV1,
  timeline: SurfacePresentationTimelineV1,
  actions: readonly TimelineActionV1[],
): PresentationConfigurationV1 {
  return replaceSurfaceTimeline(configuration, { ...timeline, actions: [...actions] });
}

function replaceSurfaceTimeline(
  configuration: PresentationConfigurationV1,
  timeline: SurfacePresentationTimelineV1,
): PresentationConfigurationV1 {
  return {
    ...configuration,
    surfaces: configuration.surfaces.map((candidate) =>
      candidate.surfaceId === timeline.surfaceId ? timeline : candidate,
    ),
  };
}

function validateAndDispatch(
  editor: Editor,
  candidate: PresentationConfigurationV1,
  courseStructure: ProjectedSlideshowCourseStructure,
  validateActionIds?: readonly EmbeddedDataId[],
): PresentationAuthoringCommandResult {
  const configuration = PresentationConfigurationV1Schema.parse(candidate);
  const semanticSnapshot = getSemanticDocumentControllerForEditor(editor).getSnapshot().semantics;
  const configurations = validateActionIds?.length
    ? validateActionIds.map((actionId) => configurationWithEnabledAction(configuration, actionId))
    : [configuration];
  for (const configurationToCompile of configurations) {
    const compiled = compilePresentation({
      configuration: configurationToCompile,
      courseStructure,
      semanticSnapshot,
    });
    if (compiled.isErr()) {
      if (compiled.error.reason === "surface-coverage-missing") {
        throw new Error(
          `Semantic Address Book has no current Surface "${compiled.error.surfaceId}".`,
        );
      }
      return Result.err(compiled.error);
    }
  }
  dispatchPresentation(editor, configuration);
  return Result.ok();
}

function configurationWithEnabledAction(
  configuration: PresentationConfigurationV1,
  actionId: EmbeddedDataId,
): PresentationConfigurationV1 {
  let found = false;
  const surfaces = configuration.surfaces.map((timeline) => ({
    ...timeline,
    actions: timeline.actions.map((action) => {
      if (action.id !== actionId) return action;
      found = true;
      return { ...action, isEnabled: true };
    }),
  }));
  if (!found) throw new Error(`Presentation action "${actionId}" is missing after mutation.`);
  return { ...configuration, surfaces };
}

function dispatchPresentation(editor: Editor, presentation: PresentationConfigurationV1): void {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const tr = editor.state.tr.setNodeMarkup(0, undefined, {
    ...courseDocument.attrs,
    presentation,
  });
  tr.doc.check();
  editor.view.dispatch(tr);
}
