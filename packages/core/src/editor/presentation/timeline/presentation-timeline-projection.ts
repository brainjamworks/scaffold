import {
  PresentationConfigurationV1Schema,
  type EmbeddedDataId,
  type EmbeddedNodeId,
  type PresentationConfigurationV1,
  type PresentationVisualCapabilityId,
  type SurfacePresentationNarrationV1,
  type SurfaceTransitionV1,
  type TimelineActionV1,
} from "@scaffold/contracts";

import type {
  SemanticDocumentSnapshot,
  SemanticItem,
  SemanticItemKind,
} from "@/document/model/semantic-document";

export interface PresentationTimelineRowCapabilities {
  readonly visualActionIds: readonly PresentationVisualCapabilityId[];
  readonly reconstructableCommandTypes: readonly string[];
  readonly disabledReason: string | null;
}

export interface PresentationTimelineRow {
  readonly targetId: EmbeddedNodeId;
  readonly parentTargetId: EmbeddedNodeId | null;
  readonly depth: number;
  readonly semanticKind: SemanticItemKind;
  readonly label: string;
  readonly summary: string | null;
  readonly capabilities: PresentationTimelineRowCapabilities;
  readonly actions: readonly TimelineActionV1[];
}

export type PresentationTimelineProjectionDiagnostic =
  | {
      readonly reason: "surface-not-found";
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "surface-timeline-not-found";
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "action-target-not-found";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "action-target-on-another-surface";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly currentSurfaceId: EmbeddedNodeId | null;
    }
  | {
      readonly reason: "visual-capability-not-declared";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly capabilityId: PresentationVisualCapabilityId;
    }
  | {
      readonly reason: "navigation-surface-not-found";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly destinationSurfaceId: EmbeddedNodeId;
    };

export interface PresentationTimelineProjection {
  readonly surfaceId: EmbeddedNodeId;
  readonly configurationState: "absent" | "present";
  readonly durationMs: number | null;
  readonly narration: SurfacePresentationNarrationV1 | null;
  readonly transition: SurfaceTransitionV1 | null;
  readonly orderedActionIds: readonly EmbeddedDataId[];
  readonly rows: readonly PresentationTimelineRow[];
  readonly diagnostics: readonly PresentationTimelineProjectionDiagnostic[];
}

const EMPTY_STRINGS = Object.freeze([]) as readonly string[];

/** Derives one current-Surface authoring view without creating or changing portable data. */
export function projectPresentationTimeline(
  surfaceId: EmbeddedNodeId,
  semanticSnapshot: SemanticDocumentSnapshot,
  configuration: PresentationConfigurationV1 | null,
): PresentationTimelineProjection {
  if (configuration) PresentationConfigurationV1Schema.parse(configuration);
  assertSemanticIdentities(semanticSnapshot);

  const configurationState = configuration ? "present" : "absent";
  const surface = semanticSnapshot.itemById.get(surfaceId);
  if (!surface) {
    return freezeProjection({
      surfaceId,
      configurationState,
      durationMs: null,
      narration: null,
      transition: null,
      orderedActionIds: [],
      rows: [],
      diagnostics: [Object.freeze({ reason: "surface-not-found", surfaceId })],
    });
  }
  if (surface.kind !== "surface") {
    throw new Error(`Presentation Timeline Surface identity "${surfaceId}" names ${surface.kind}.`);
  }

  const subtreeIds = collectSurfaceSubtreeIds(surface, semanticSnapshot);
  const timeline = configuration?.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  const diagnostics: PresentationTimelineProjectionDiagnostic[] = [];
  if (configuration && !timeline) {
    diagnostics.push(Object.freeze({ reason: "surface-timeline-not-found", surfaceId }));
  }

  const actionsByTargetId = new Map<EmbeddedNodeId, TimelineActionV1[]>();
  const surfaceActions: TimelineActionV1[] = [];
  const addressedTargetIds = new Set<EmbeddedNodeId>();

  for (const action of timeline?.actions ?? []) {
    if (action.kind === "manual-wait" || action.kind === "learner-wait") {
      surfaceActions.push(action);
      if (action.kind === "learner-wait") {
        diagnoseTargetReference(
          action.id,
          action.requirement.targetId,
          surfaceId,
          subtreeIds,
          semanticSnapshot,
          diagnostics,
        );
      }
      continue;
    }

    if (action.kind === "trigger" && action.command.kind === "navigate-surface") {
      surfaceActions.push(action);
      const destination = semanticSnapshot.itemById.get(action.command.surfaceId);
      if (!destination || destination.kind !== "surface") {
        diagnostics.push(
          Object.freeze({
            reason: "navigation-surface-not-found",
            surfaceId,
            actionId: action.id,
            destinationSurfaceId: action.command.surfaceId,
          }),
        );
      }
      continue;
    }

    const targetId =
      action.kind === "animate" ? action.targetId : requireTargetCommandId(action.command);
    const targetStatus = diagnoseTargetReference(
      action.id,
      targetId,
      surfaceId,
      subtreeIds,
      semanticSnapshot,
      diagnostics,
    );
    if (targetStatus !== "current") {
      surfaceActions.push(action);
      continue;
    }

    addressedTargetIds.add(targetId);
    if (targetId === surfaceId) surfaceActions.push(action);
    else appendAction(actionsByTargetId, targetId, action);
    if (action.kind === "animate") {
      const target = requireSemanticItem(semanticSnapshot, targetId);
      if (!target.presentation.actionIds.includes(action.visual.kind)) {
        diagnostics.push(
          Object.freeze({
            reason: "visual-capability-not-declared",
            surfaceId,
            actionId: action.id,
            targetId,
            capabilityId: action.visual.kind,
          }),
        );
      }
    }
  }

  if (surfaceActions.length > 0) actionsByTargetId.set(surfaceId, surfaceActions);

  const rows: PresentationTimelineRow[] = [];
  visitRows(surface, null, 0, addressedTargetIds, actionsByTargetId, rows);

  return freezeProjection({
    surfaceId,
    configurationState,
    durationMs: timeline?.durationMs ?? null,
    narration: timeline?.narration ?? null,
    transition: timeline?.transition ?? null,
    orderedActionIds: timeline?.actions.map(({ id }) => id) ?? [],
    rows,
    diagnostics,
  });
}

function visitRows(
  item: SemanticItem,
  parentTargetId: EmbeddedNodeId | null,
  depth: number,
  addressedTargetIds: ReadonlySet<EmbeddedNodeId>,
  actionsByTargetId: ReadonlyMap<EmbeddedNodeId, readonly TimelineActionV1[]>,
  rows: PresentationTimelineRow[],
): void {
  const included =
    item.kind === "surface" || isPresentationEligible(item) || addressedTargetIds.has(item.id);
  const nextParentTargetId = included ? item.id : parentTargetId;
  const nextDepth = included ? depth + 1 : depth;

  if (included) {
    rows.push(
      Object.freeze({
        targetId: item.id,
        parentTargetId,
        depth,
        semanticKind: item.kind,
        label: item.label,
        summary: item.summary,
        capabilities: Object.freeze({
          visualActionIds: item.presentation.actionIds,
          reconstructableCommandTypes:
            item.presentation.reconstructableCommandTypes ?? EMPTY_STRINGS,
          disabledReason: item.presentation.disabledReason,
        }),
        actions: Object.freeze([...(actionsByTargetId.get(item.id) ?? [])]),
      }),
    );
  }

  for (const child of item.children) {
    visitRows(child, nextParentTargetId, nextDepth, addressedTargetIds, actionsByTargetId, rows);
  }
}

function isPresentationEligible(item: SemanticItem): boolean {
  return (
    item.presentation.disabledReason === null &&
    (item.presentation.actionIds.length > 0 ||
      (item.presentation.reconstructableCommandTypes?.length ?? 0) > 0)
  );
}

function diagnoseTargetReference(
  actionId: EmbeddedDataId,
  targetId: EmbeddedNodeId,
  surfaceId: EmbeddedNodeId,
  subtreeIds: ReadonlySet<EmbeddedNodeId>,
  semanticSnapshot: SemanticDocumentSnapshot,
  diagnostics: PresentationTimelineProjectionDiagnostic[],
): "current" | "missing" | "another-surface" {
  if (subtreeIds.has(targetId)) return "current";

  if (!semanticSnapshot.itemById.has(targetId)) {
    diagnostics.push(
      Object.freeze({
        reason: "action-target-not-found",
        surfaceId,
        actionId,
        targetId,
      }),
    );
    return "missing";
  }

  const location = semanticSnapshot.locationById.get(targetId);
  if (!location) {
    throw new Error(`Semantic item "${targetId}" has no current location.`);
  }
  diagnostics.push(
    Object.freeze({
      reason: "action-target-on-another-surface",
      surfaceId,
      actionId,
      targetId,
      currentSurfaceId: location.surfaceId,
    }),
  );
  return "another-surface";
}

function collectSurfaceSubtreeIds(
  surface: SemanticItem,
  snapshot: SemanticDocumentSnapshot,
): ReadonlySet<EmbeddedNodeId> {
  const ids = new Set<EmbeddedNodeId>();

  const visit = (item: SemanticItem, expectedParentId: EmbeddedNodeId | null): void => {
    if (ids.has(item.id)) {
      throw new Error(`Semantic Surface subtree contains duplicate identity "${item.id}".`);
    }
    const current = snapshot.itemById.get(item.id);
    if (!current) {
      throw new Error(`Semantic Surface subtree item "${item.id}" is not in the Address Book.`);
    }
    if (current !== item) {
      throw new Error(`Semantic Surface subtree identity "${item.id}" is inconsistent.`);
    }
    if (expectedParentId !== null && snapshot.parentById.get(item.id) !== expectedParentId) {
      throw new Error(`Semantic parent identity for "${item.id}" is inconsistent.`);
    }

    ids.add(item.id);
    for (const child of item.children) visit(child, item.id);
  };

  visit(surface, null);
  return ids;
}

function assertSemanticIdentities(snapshot: SemanticDocumentSnapshot): void {
  for (const [id, item] of snapshot.itemById) {
    if (item.id !== id) {
      throw new Error(`Semantic item identity "${id}" does not match "${item.id}".`);
    }
  }
}

function requireSemanticItem(
  snapshot: SemanticDocumentSnapshot,
  targetId: EmbeddedNodeId,
): SemanticItem {
  const item = snapshot.itemById.get(targetId);
  if (!item) throw new Error(`Current Semantic target "${targetId}" is missing.`);
  return item;
}

function requireTargetCommandId(
  command: Extract<TimelineActionV1, { readonly kind: "trigger" }>["command"],
): EmbeddedNodeId {
  if (command.kind !== "target-command") {
    throw new Error("Surface navigation Trigger reached target action projection.");
  }
  return command.targetId;
}

function appendAction(
  actionsByTargetId: Map<EmbeddedNodeId, TimelineActionV1[]>,
  targetId: EmbeddedNodeId,
  action: TimelineActionV1,
): void {
  const actions = actionsByTargetId.get(targetId);
  if (actions) actions.push(action);
  else actionsByTargetId.set(targetId, [action]);
}

function freezeProjection(
  projection: PresentationTimelineProjection,
): PresentationTimelineProjection {
  return Object.freeze({
    ...projection,
    orderedActionIds: Object.freeze([...projection.orderedActionIds]),
    rows: Object.freeze([...projection.rows]),
    diagnostics: Object.freeze([...projection.diagnostics]),
  });
}
