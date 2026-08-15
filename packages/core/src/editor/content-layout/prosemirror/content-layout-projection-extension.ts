import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Result } from "better-result";
import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";

import type {
  ContentLayoutProjectionInput,
  ContentLayoutProjectionIssue,
  DirectChildContentLayoutState,
} from "../model/content-layout-projection";
import { projectContentLayout } from "../model/content-layout-projection";
import { CONTENT_LAYOUT_ATTR } from "../model/content-layout-attribute";
import { contentLayoutProjectionDomAttributes } from "../view/content-layout-projection-dom";
import "../view/content-layout-projection.css";
import type {
  SemanticDocumentSnapshot,
  SemanticItem,
} from "@/document/model/semantic-document/semantic-document-snapshot";
import type { SemanticLocation } from "@/document/model/semantic-document/semantic-location";

export interface ContentLayoutProjectionBatch {
  readonly snapshot: SemanticDocumentSnapshot;
  readonly containers: readonly ContentLayoutProjectionInput[];
}

export type ContentLayoutProjectionSnapshotMismatchDiagnostic =
  | {
      readonly kind: "snapshot-mismatch";
      readonly containerId: EmbeddedNodeId;
      readonly reason: "container-not-indexed" | "container-not-published";
    }
  | {
      readonly kind: "snapshot-mismatch";
      readonly containerId: EmbeddedNodeId;
      readonly reason: "content-layout-mismatch";
      readonly expectedLayout: PresentationContentLayout;
      readonly actualLayout: PresentationContentLayout;
    }
  | {
      readonly kind: "snapshot-mismatch";
      readonly containerId: EmbeddedNodeId;
      readonly reason: "ordered-direct-children-mismatch";
      readonly expectedChildIds: readonly EmbeddedNodeId[];
      readonly actualChildIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly kind: "snapshot-mismatch";
      readonly containerId: EmbeddedNodeId;
      readonly reason: "child-index-mismatch";
      readonly childId: EmbeddedNodeId;
      readonly index: number;
      readonly expectedParentId: EmbeddedNodeId;
      readonly actualParentId: EmbeddedNodeId | null;
      readonly actualItemId: EmbeddedNodeId | null;
    }
  | {
      readonly kind: "snapshot-mismatch";
      readonly containerId: EmbeddedNodeId;
      readonly reason: "duplicate-container-input";
      readonly inputIndexes: readonly number[];
    };

export type ContentLayoutProjectionLocationDiagnostic =
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "missing-location";
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "location-identity-mismatch";
      readonly position: number;
      readonly expectedId: EmbeddedNodeId;
      readonly actualId: unknown;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "location-node-type-mismatch";
      readonly position: number;
      readonly expectedNodeType: string;
      readonly actualNodeType: string;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "invalid-location-range";
      readonly actualFrom: unknown;
      readonly actualTo: unknown;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "location-outside-container";
      readonly childFrom: number;
      readonly childTo: number;
      readonly containerFrom: number;
      readonly containerTo: number;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "location-order-mismatch";
      readonly index: number;
      readonly position: number;
      readonly previousIndex: number;
      readonly previousPosition: number;
      readonly previousTargetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "document-node-missing";
      readonly position: number;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "document-node-identity-mismatch";
      readonly position: number;
      readonly expectedId: EmbeddedNodeId;
      readonly actualId: unknown;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "document-node-type-mismatch";
      readonly position: number;
      readonly expectedNodeType: string;
      readonly actualNodeType: string;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "document-node-range-mismatch";
      readonly position: number;
      readonly expectedFrom: number;
      readonly expectedTo: number;
      readonly actualFrom: number;
      readonly actualTo: number;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "document-node-content-layout-mismatch";
      readonly position: number;
      readonly expectedLayout: PresentationContentLayout;
      readonly actualLayout: PresentationContentLayout;
    }
  | {
      readonly kind: "snapshot-location-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly reason: "document-node-content-layout-invalid";
      readonly position: number;
      readonly expectedLayout: PresentationContentLayout;
      readonly actualLayout: unknown;
    };

export type ContentLayoutProjectionDiagnostic =
  | {
      readonly kind: "projection-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly issue: ContentLayoutProjectionIssue;
    }
  | ContentLayoutProjectionSnapshotMismatchDiagnostic
  | ContentLayoutProjectionLocationDiagnostic
  | {
      readonly kind: "stale-source";
      readonly containerId: null;
      readonly previousRevision: number;
    }
  | {
      readonly kind: "invalid-batch";
      readonly containerId: null;
      readonly reason: "malformed-meta" | "malformed-batch";
    };

interface ContentLayoutProjectionState {
  readonly decorations: DecorationSet;
  readonly batch: ContentLayoutProjectionBatch | null;
  readonly diagnostics: readonly ContentLayoutProjectionDiagnostic[];
}

interface ContentLayoutProjectionDecorationSpec {
  readonly containerId: EmbeddedNodeId;
  readonly state: DirectChildContentLayoutState;
}

interface ValidatedContentLayoutProjectionContainer {
  readonly locations: readonly SemanticLocation[];
}

type ContentLayoutProjectionValidationDiagnostic =
  | ContentLayoutProjectionSnapshotMismatchDiagnostic
  | ContentLayoutProjectionLocationDiagnostic;

type ContentLayoutProjectionValidationResult = Result<
  ValidatedContentLayoutProjectionContainer,
  ContentLayoutProjectionValidationDiagnostic
>;

type ContentLayoutProjectionMeta =
  | {
      readonly type: "replace";
      readonly batch: ContentLayoutProjectionBatch;
    }
  | {
      readonly type: "clear";
    };

type DecodedContentLayoutProjectionMeta =
  | { readonly kind: "none" }
  | { readonly kind: "replace"; readonly batch: ContentLayoutProjectionBatch }
  | { readonly kind: "clear" }
  | {
      readonly kind: "invalid";
      readonly diagnostic: ContentLayoutProjectionDiagnostic;
    };

const CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY = new PluginKey<ContentLayoutProjectionState>(
  "contentLayoutProjection",
);
const EMPTY_DIAGNOSTICS: readonly ContentLayoutProjectionDiagnostic[] = Object.freeze([]);
const CLEAR_META: ContentLayoutProjectionMeta = Object.freeze({ type: "clear" });

export const ContentLayoutProjectionExtension = Extension.create({
  name: "contentLayoutProjection",

  addProseMirrorPlugins() {
    return [
      new Plugin<ContentLayoutProjectionState>({
        key: CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY,
        state: {
          init: () => createEmptyProjectionState(),
          apply(transaction, value) {
            const meta = decodeContentLayoutProjectionMeta(transaction);
            switch (meta.kind) {
              case "none":
                if (!transaction.docChanged) return value;
                return value.batch === null
                  ? createEmptyProjectionState()
                  : createStaleProjectionState(value.batch);
              case "clear":
                return createEmptyProjectionState();
              case "replace":
                return buildProjectionState(transaction.doc, meta.batch);
              case "invalid":
                return createInvalidProjectionState(
                  meta.diagnostic,
                  transaction.docChanged && value.batch !== null
                    ? createStaleSourceDiagnostic(value.batch.snapshot.revision)
                    : null,
                );
              default:
                return assertNeverProjectionMeta(meta);
            }
          },
        },
        props: {
          decorations(state) {
            return (
              CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});

export function setContentLayoutProjectionBatchMeta(
  transaction: Transaction,
  batch: ContentLayoutProjectionBatch,
): Transaction {
  return transaction.setMeta(
    CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY,
    Object.freeze({
      type: "replace",
      batch: normalizeContentLayoutProjectionBatch(batch),
    }) satisfies ContentLayoutProjectionMeta,
  );
}

export function clearContentLayoutProjectionMeta(transaction: Transaction): Transaction {
  return transaction.setMeta(CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY, CLEAR_META);
}

export function readContentLayoutProjectionDiagnostics(
  state: EditorState,
): readonly ContentLayoutProjectionDiagnostic[] {
  return readContentLayoutProjectionState(state).diagnostics;
}

export function readContentLayoutProjectionDecorations(state: EditorState): DecorationSet {
  return readContentLayoutProjectionState(state).decorations;
}

function readContentLayoutProjectionState(state: EditorState): ContentLayoutProjectionState {
  const projectionState = CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY.getState(state);
  if (!projectionState) {
    throw new Error("Content Layout Projection extension is not installed for this editor");
  }
  return projectionState;
}

function createEmptyProjectionState(): ContentLayoutProjectionState {
  return Object.freeze({
    decorations: DecorationSet.empty,
    batch: null,
    diagnostics: EMPTY_DIAGNOSTICS,
  });
}

function createStaleProjectionState(
  previousBatch: ContentLayoutProjectionBatch,
): ContentLayoutProjectionState {
  return Object.freeze({
    decorations: DecorationSet.empty,
    batch: null,
    diagnostics: freezeDiagnostics([createStaleSourceDiagnostic(previousBatch.snapshot.revision)]),
  });
}

function createInvalidProjectionState(
  diagnostic: ContentLayoutProjectionDiagnostic,
  staleSourceDiagnostic: ContentLayoutProjectionDiagnostic | null,
): ContentLayoutProjectionState {
  return Object.freeze({
    decorations: DecorationSet.empty,
    batch: null,
    diagnostics: freezeDiagnostics(
      staleSourceDiagnostic === null ? [diagnostic] : [diagnostic, staleSourceDiagnostic],
    ),
  });
}

function buildProjectionState(
  doc: ProseMirrorNode,
  batch: ContentLayoutProjectionBatch,
): ContentLayoutProjectionState {
  const diagnostics: ContentLayoutProjectionDiagnostic[] = [];
  const decorations: Decoration[] = [];
  const duplicateContainerInputIndexes = findDuplicateContainerInputIndexes(
    batch.containers.map(({ containerId }) => containerId),
  );
  for (const [containerId, inputIndexes] of duplicateContainerInputIndexes) {
    diagnostics.push(createDuplicateContainerInputDiagnostic(containerId, inputIndexes));
  }

  const validationResults = batch.containers
    .filter(({ containerId }) => !duplicateContainerInputIndexes.has(containerId))
    .map((input) =>
      validateContainerInput(doc, batch.snapshot, input).map((validation) => ({
        input,
        validation,
      })),
    );
  const [validations, validationDiagnostics] = Result.partition(validationResults);
  diagnostics.push(...validationDiagnostics);

  for (const { input, validation } of validations) {
    const outcome = projectContentLayout(input);
    switch (outcome.kind) {
      case "flow":
      case "empty-sequence":
        break;
      case "projected-sequence":
        for (const [index, state] of outcome.childStates.entries()) {
          const location = validation.locations[index];
          if (!location || location.id !== state.childId) {
            throw new Error("Validated projection child has no validated location.");
          }
          decorations.push(
            Decoration.node(
              location.from,
              location.to,
              contentLayoutProjectionDomAttributes(state),
              Object.freeze({
                containerId: input.containerId,
                state,
              } satisfies ContentLayoutProjectionDecorationSpec),
            ),
          );
        }
        break;
      case "projection-unavailable":
        diagnostics.push(
          Object.freeze({
            kind: "projection-unavailable" as const,
            containerId: input.containerId,
            issue: outcome.issue,
          }),
        );
        break;
      default:
        return assertNeverProjectionOutcome(outcome);
    }
  }

  return Object.freeze({
    decorations:
      decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations),
    batch,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

function validateContainerInput(
  doc: ProseMirrorNode,
  snapshot: SemanticDocumentSnapshot,
  input: ContentLayoutProjectionInput,
): ContentLayoutProjectionValidationResult {
  const item = snapshot.itemById.get(input.containerId);
  if (!isSemanticItemLike(item)) {
    return Result.err(createSnapshotMismatchDiagnostic(input.containerId, "container-not-indexed"));
  }
  if (item.id !== input.containerId) {
    return Result.err(createSnapshotMismatchDiagnostic(input.containerId, "container-not-indexed"));
  }

  const presentationContainer = item.presentationContainer;
  if (presentationContainer === null) {
    return Result.err(
      createSnapshotMismatchDiagnostic(input.containerId, "container-not-published"),
    );
  }
  if (presentationContainer.contentLayout !== input.contentLayout) {
    return Result.err(
      Object.freeze({
        kind: "snapshot-mismatch" as const,
        containerId: input.containerId,
        reason: "content-layout-mismatch" as const,
        expectedLayout: presentationContainer.contentLayout,
        actualLayout: input.contentLayout,
      }),
    );
  }

  const containerLocation = snapshot.locationById.get(input.containerId);
  if (!isSemanticLocationLike(containerLocation)) {
    return Result.err(createMissingLocationDiagnostic(input.containerId, input.containerId));
  }
  if (containerLocation.id !== input.containerId) {
    return Result.err(
      createLocationIdentityMismatchDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        input.containerId,
        containerLocation.id,
      ),
    );
  }
  if (containerLocation.nodeType !== item.nodeType) {
    return Result.err(
      createLocationNodeTypeMismatchDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        item.nodeType,
        containerLocation.nodeType,
      ),
    );
  }
  if (
    !Number.isSafeInteger(containerLocation.from) ||
    !Number.isSafeInteger(containerLocation.to) ||
    containerLocation.from < 0 ||
    containerLocation.from >= containerLocation.to
  ) {
    return Result.err(
      createInvalidLocationRangeDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        containerLocation.to,
      ),
    );
  }

  const containerNode = readDocumentNodeAt(doc, containerLocation.from);
  if (containerNode === null) {
    return Result.err(
      createDocumentNodeMissingDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
      ),
    );
  }
  const actualContainerId = containerNode.attrs["id"];
  if (actualContainerId !== input.containerId) {
    return Result.err(
      createDocumentNodeIdentityMismatchDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        input.containerId,
        actualContainerId,
      ),
    );
  }
  if (containerNode.type.name !== containerLocation.nodeType) {
    return Result.err(
      createDocumentNodeTypeMismatchDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        containerLocation.nodeType,
        containerNode.type.name,
      ),
    );
  }
  if (containerNode.nodeSize !== containerLocation.to - containerLocation.from) {
    return Result.err(
      createDocumentNodeRangeMismatchDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        containerLocation.from,
        containerLocation.to,
        containerLocation.from,
        containerLocation.from + containerNode.nodeSize,
      ),
    );
  }
  const actualContainerLayout = containerNode.attrs[CONTENT_LAYOUT_ATTR];
  if (!isContentLayout(actualContainerLayout)) {
    return Result.err(
      createDocumentNodeContentLayoutInvalidDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        input.contentLayout,
        actualContainerLayout,
      ),
    );
  }
  if (actualContainerLayout !== input.contentLayout) {
    return Result.err(
      createDocumentNodeContentLayoutMismatchDiagnostic(
        input.containerId,
        input.containerId,
        containerLocation.from,
        input.contentLayout,
        actualContainerLayout,
      ),
    );
  }

  const expectedChildIds = item.children.map(({ id }) => id);
  if (!idsEqual(expectedChildIds, input.directChildIds)) {
    return Result.err(
      Object.freeze({
        kind: "snapshot-mismatch" as const,
        containerId: input.containerId,
        reason: "ordered-direct-children-mismatch" as const,
        expectedChildIds: Object.freeze([...expectedChildIds]),
        actualChildIds: Object.freeze([...input.directChildIds]),
      }),
    );
  }

  for (const [index, child] of item.children.entries()) {
    const actualItem = snapshot.itemById.get(child.id);
    const actualParentId = snapshot.parentById.get(child.id) ?? null;
    if (
      !isSemanticItemLike(actualItem) ||
      actualItem !== child ||
      actualParentId !== input.containerId
    ) {
      return Result.err(
        createChildIndexMismatchDiagnostic(
          input.containerId,
          child.id,
          index,
          input.containerId,
          actualParentId,
          isSemanticItemLike(actualItem) ? actualItem.id : null,
        ),
      );
    }
  }

  const locations: SemanticLocation[] = [];
  let previousFrom = -1;
  let previousIndex = -1;
  let previousChildId: EmbeddedNodeId | null = null;
  for (const [index, childId] of input.directChildIds.entries()) {
    const location = snapshot.locationById.get(childId);
    if (!isSemanticLocationLike(location)) {
      return Result.err(createMissingLocationDiagnostic(input.containerId, childId));
    }
    if (location.id !== childId) {
      return Result.err(
        createLocationIdentityMismatchDiagnostic(
          input.containerId,
          childId,
          location.from,
          childId,
          location.id,
        ),
      );
    }
    if (
      !Number.isSafeInteger(location.from) ||
      !Number.isSafeInteger(location.to) ||
      location.from < 0 ||
      location.from >= location.to
    ) {
      return Result.err(
        createInvalidLocationRangeDiagnostic(
          input.containerId,
          childId,
          location.from,
          location.to,
        ),
      );
    }
    if (location.from <= containerLocation.from || location.to >= containerLocation.to) {
      return Result.err(
        createLocationOutsideContainerDiagnostic(
          input.containerId,
          childId,
          location.from,
          location.to,
          containerLocation.from,
          containerLocation.to,
        ),
      );
    }
    if (previousChildId !== null && location.from <= previousFrom && childId !== previousChildId) {
      return Result.err(
        createLocationOrderMismatchDiagnostic(
          input.containerId,
          childId,
          index,
          location.from,
          previousIndex,
          previousFrom,
          previousChildId,
        ),
      );
    }
    previousFrom = location.from;
    previousIndex = index;
    previousChildId = childId;

    const child = item.children[index];
    if (!child) {
      throw new Error("Validated projection child has no semantic item.");
    }
    if (child.nodeType !== location.nodeType) {
      return Result.err(
        createLocationNodeTypeMismatchDiagnostic(
          input.containerId,
          childId,
          location.from,
          child.nodeType,
          location.nodeType,
        ),
      );
    }

    const node = readDocumentNodeAt(doc, location.from);
    if (node === null) {
      return Result.err(
        createDocumentNodeMissingDiagnostic(input.containerId, childId, location.from),
      );
    }
    const actualId = node.attrs["id"];
    if (actualId !== childId) {
      return Result.err(
        createDocumentNodeIdentityMismatchDiagnostic(
          input.containerId,
          childId,
          location.from,
          childId,
          actualId,
        ),
      );
    }
    if (node.type.name !== location.nodeType) {
      return Result.err(
        createDocumentNodeTypeMismatchDiagnostic(
          input.containerId,
          childId,
          location.from,
          location.nodeType,
          node.type.name,
        ),
      );
    }
    if (node.nodeSize !== location.to - location.from) {
      return Result.err(
        createDocumentNodeRangeMismatchDiagnostic(
          input.containerId,
          childId,
          location.from,
          location.from,
          location.to,
          location.from,
          location.from + node.nodeSize,
        ),
      );
    }
    locations.push(location);
  }

  return Result.ok({ locations: Object.freeze(locations) });
}

function readDocumentNodeAt(doc: ProseMirrorNode, position: number): ProseMirrorNode | null {
  return position > doc.content.size ? null : doc.nodeAt(position);
}

function decodeContentLayoutProjectionMeta(
  transaction: Transaction,
): DecodedContentLayoutProjectionMeta {
  const rawMeta = transaction.getMeta(CONTENT_LAYOUT_PROJECTION_PLUGIN_KEY);
  if (rawMeta === undefined) return { kind: "none" };
  if (!isRecord(rawMeta)) {
    return {
      kind: "invalid",
      diagnostic: createInvalidBatchDiagnostic("malformed-meta"),
    };
  }
  if (rawMeta["type"] === "clear") return { kind: "clear" };
  if (rawMeta["type"] !== "replace") {
    return {
      kind: "invalid",
      diagnostic: createInvalidBatchDiagnostic("malformed-meta"),
    };
  }
  const rawBatch = rawMeta["batch"];
  if (!isContentLayoutProjectionBatch(rawBatch)) {
    return {
      kind: "invalid",
      diagnostic: createInvalidBatchDiagnostic("malformed-batch"),
    };
  }
  return { kind: "replace", batch: normalizeContentLayoutProjectionBatch(rawBatch) };
}

function normalizeContentLayoutProjectionBatch(
  batch: ContentLayoutProjectionBatch,
): ContentLayoutProjectionBatch {
  const containers = Object.freeze(
    batch.containers.map((input) =>
      Object.freeze({
        containerId: input.containerId,
        contentLayout: input.contentLayout,
        directChildIds: Object.freeze([...input.directChildIds]),
        activeChildId: input.activeChildId,
      }),
    ),
  );
  return Object.freeze({
    snapshot: batch.snapshot,
    containers,
  });
}

function isContentLayoutProjectionBatch(value: unknown): value is ContentLayoutProjectionBatch {
  if (!isRecord(value)) return false;
  if (!isSemanticDocumentSnapshot(value["snapshot"])) return false;
  return (
    Array.isArray(value["containers"]) && value["containers"].every(isContentLayoutProjectionInput)
  );
}

function isContentLayoutProjectionInput(value: unknown): value is ContentLayoutProjectionInput {
  if (!isRecord(value)) return false;
  return (
    isEmbeddedNodeId(value["containerId"]) &&
    isContentLayout(value["contentLayout"]) &&
    Array.isArray(value["directChildIds"]) &&
    value["directChildIds"].every(isEmbeddedNodeId) &&
    (value["activeChildId"] === null || isEmbeddedNodeId(value["activeChildId"]))
  );
}

function isSemanticDocumentSnapshot(value: unknown): value is SemanticDocumentSnapshot {
  if (!isRecord(value)) return false;
  const revision = value["revision"];
  return (
    typeof revision === "number" &&
    Number.isSafeInteger(revision) &&
    revision >= 0 &&
    (value["mode"] === "page" || value["mode"] === "slideshow") &&
    Array.isArray(value["roots"]) &&
    isReadonlyMapLike(value["itemById"]) &&
    isReadonlyMapLike(value["parentById"]) &&
    isReadonlyMapLike(value["locationById"]) &&
    Array.isArray(value["diagnostics"])
  );
}

function isSemanticItemLike(value: unknown): value is SemanticItem {
  if (!isRecord(value) || !isEmbeddedNodeId(value["id"]) || typeof value["nodeType"] !== "string") {
    return false;
  }
  const presentationContainer = value["presentationContainer"];
  return (
    (presentationContainer === null ||
      (isRecord(presentationContainer) &&
        isContentLayout(presentationContainer["contentLayout"]))) &&
    Array.isArray(value["children"]) &&
    value["children"].every((child) => isRecord(child) && isEmbeddedNodeId(child["id"]))
  );
}

function isSemanticLocationLike(value: unknown): value is SemanticLocation {
  return (
    isRecord(value) &&
    isEmbeddedNodeId(value["id"]) &&
    typeof value["nodeType"] === "string" &&
    typeof value["from"] === "number" &&
    typeof value["to"] === "number"
  );
}

function isReadonlyMapLike(value: unknown): value is ReadonlyMap<unknown, unknown> {
  return isRecord(value) && typeof value["get"] === "function";
}

function isEmbeddedNodeId(value: unknown): value is EmbeddedNodeId {
  return EmbeddedNodeIdSchema.safeParse(value).success;
}

function isContentLayout(value: unknown): value is PresentationContentLayout {
  return value === PresentationContentLayout.Flow || value === PresentationContentLayout.Sequence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idsEqual(expected: readonly EmbeddedNodeId[], actual: readonly EmbeddedNodeId[]): boolean {
  return expected.length === actual.length && expected.every((id, index) => id === actual[index]);
}

function findDuplicateContainerInputIndexes(
  ids: readonly EmbeddedNodeId[],
): ReadonlyMap<EmbeddedNodeId, readonly number[]> {
  const indexesById = new Map<EmbeddedNodeId, number[]>();
  for (const [index, id] of ids.entries()) {
    const indexes = indexesById.get(id);
    if (indexes) {
      indexes.push(index);
    } else {
      indexesById.set(id, [index]);
    }
  }
  return new Map(
    [...indexesById.entries()]
      .filter(([, indexes]) => indexes.length > 1)
      .map(([id, indexes]) => [id, Object.freeze([...indexes])] as const),
  );
}

function createSnapshotMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  reason: "container-not-indexed" | "container-not-published",
): ContentLayoutProjectionSnapshotMismatchDiagnostic {
  return Object.freeze({
    kind: "snapshot-mismatch" as const,
    containerId,
    reason,
  });
}

function createDuplicateContainerInputDiagnostic(
  containerId: EmbeddedNodeId,
  inputIndexes: readonly number[],
): ContentLayoutProjectionSnapshotMismatchDiagnostic {
  return Object.freeze({
    kind: "snapshot-mismatch" as const,
    containerId,
    reason: "duplicate-container-input" as const,
    inputIndexes: Object.freeze([...inputIndexes]),
  });
}

function createChildIndexMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  index: number,
  expectedParentId: EmbeddedNodeId,
  actualParentId: EmbeddedNodeId | null,
  actualItemId: EmbeddedNodeId | null,
): ContentLayoutProjectionSnapshotMismatchDiagnostic {
  return Object.freeze({
    kind: "snapshot-mismatch" as const,
    containerId,
    reason: "child-index-mismatch" as const,
    childId,
    index,
    expectedParentId,
    actualParentId,
    actualItemId,
  });
}

function createMissingLocationDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "missing-location" as const,
  });
}

function createLocationIdentityMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedId: EmbeddedNodeId,
  actualId: unknown,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "location-identity-mismatch" as const,
    position,
    expectedId,
    actualId,
  });
}

function createLocationNodeTypeMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedNodeType: string,
  actualNodeType: string,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "location-node-type-mismatch" as const,
    position,
    expectedNodeType,
    actualNodeType,
  });
}

function createInvalidLocationRangeDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  actualFrom: unknown,
  actualTo: unknown,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "invalid-location-range" as const,
    actualFrom,
    actualTo,
  });
}

function createLocationOutsideContainerDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  childFrom: number,
  childTo: number,
  containerFrom: number,
  containerTo: number,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "location-outside-container" as const,
    childFrom,
    childTo,
    containerFrom,
    containerTo,
  });
}

function createLocationOrderMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  index: number,
  position: number,
  previousIndex: number,
  previousPosition: number,
  previousTargetId: EmbeddedNodeId,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "location-order-mismatch" as const,
    index,
    position,
    previousIndex,
    previousPosition,
    previousTargetId,
  });
}

function createDocumentNodeMissingDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "document-node-missing" as const,
    position,
  });
}

function createDocumentNodeIdentityMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedId: EmbeddedNodeId,
  actualId: unknown,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "document-node-identity-mismatch" as const,
    position,
    expectedId,
    actualId,
  });
}

function createDocumentNodeTypeMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedNodeType: string,
  actualNodeType: string,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "document-node-type-mismatch" as const,
    position,
    expectedNodeType,
    actualNodeType,
  });
}

function createDocumentNodeRangeMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedFrom: number,
  expectedTo: number,
  actualFrom: number,
  actualTo: number,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "document-node-range-mismatch" as const,
    position,
    expectedFrom,
    expectedTo,
    actualFrom,
    actualTo,
  });
}

function createDocumentNodeContentLayoutMismatchDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedLayout: PresentationContentLayout,
  actualLayout: PresentationContentLayout,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "document-node-content-layout-mismatch" as const,
    position,
    expectedLayout,
    actualLayout,
  });
}

function createDocumentNodeContentLayoutInvalidDiagnostic(
  containerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  position: number,
  expectedLayout: PresentationContentLayout,
  actualLayout: unknown,
): ContentLayoutProjectionLocationDiagnostic {
  return Object.freeze({
    kind: "snapshot-location-unavailable" as const,
    containerId,
    targetId,
    reason: "document-node-content-layout-invalid" as const,
    position,
    expectedLayout,
    actualLayout,
  });
}

function createStaleSourceDiagnostic(previousRevision: number): ContentLayoutProjectionDiagnostic {
  return Object.freeze({
    kind: "stale-source" as const,
    containerId: null,
    previousRevision,
  });
}

function createInvalidBatchDiagnostic(
  reason: "malformed-meta" | "malformed-batch",
): ContentLayoutProjectionDiagnostic {
  return Object.freeze({
    kind: "invalid-batch" as const,
    containerId: null,
    reason,
  });
}

function freezeDiagnostics(
  diagnostics: readonly ContentLayoutProjectionDiagnostic[],
): readonly ContentLayoutProjectionDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function assertNeverProjectionMeta(value: never): never {
  throw new Error("Unsupported content-layout projection metadata: " + String(value));
}

function assertNeverProjectionOutcome(value: never): never {
  throw new Error("Unsupported content-layout projection outcome: " + String(value));
}
