import { PresentationContentLayout, type EmbeddedNodeId } from "@scaffold/contracts";

import type {
  SemanticDocumentSnapshot,
  SemanticItem,
} from "@/document/model/semantic-document/semantic-document-snapshot";

import type { ContentLayoutProjectionInput } from "./content-layout-projection";

export type ContentLayoutAuthoringResolution =
  | "selected"
  | "retained"
  | "first-child"
  | "next-after-delete"
  | "previous-after-delete"
  | "empty"
  | "flow";

export interface ContentLayoutAuthoringContainerState {
  readonly containerId: EmbeddedNodeId;
  readonly directChildIds: readonly EmbeddedNodeId[];
  readonly activeChildId: EmbeddedNodeId | null;
  readonly resolution: ContentLayoutAuthoringResolution;
}

export interface ContentLayoutAuthoringState {
  readonly containers: ReadonlyMap<EmbeddedNodeId, ContentLayoutAuthoringContainerState>;
  readonly projectionInputs: readonly ContentLayoutProjectionInput[];
}

export interface DeriveContentLayoutAuthoringStateInput {
  readonly snapshot: SemanticDocumentSnapshot;
  readonly selectedId: EmbeddedNodeId | null;
  readonly previousState: ContentLayoutAuthoringState | null;
}

export function deriveContentLayoutAuthoringState({
  snapshot,
  selectedId,
  previousState,
}: DeriveContentLayoutAuthoringStateInput): ContentLayoutAuthoringState {
  const containers = new Map<EmbeddedNodeId, ContentLayoutAuthoringContainerState>();
  const projectionInputs: ContentLayoutProjectionInput[] = [];
  const selectedDirectChildIds = resolveSelectedDirectChildIds(snapshot, selectedId);

  for (const item of snapshot.itemById.values()) {
    const presentationContainer = item.presentationContainer;
    if (presentationContainer === null) continue;

    const directChildIds = Object.freeze(item.children.map((child) => child.id));
    const previousContainer = previousState?.containers.get(item.id) ?? null;
    const containerState = deriveContainerState(
      item,
      directChildIds,
      previousContainer,
      selectedDirectChildIds.get(item.id) ?? null,
    );

    containers.set(item.id, containerState);
    projectionInputs.push(
      Object.freeze({
        containerId: item.id,
        contentLayout: presentationContainer.contentLayout,
        directChildIds,
        activeChildId: containerState.activeChildId,
      }),
    );
  }

  return Object.freeze({
    containers: freezeReadonlyMap(containers),
    projectionInputs: Object.freeze(projectionInputs),
  });
}

function deriveContainerState(
  item: SemanticItem,
  directChildIds: readonly EmbeddedNodeId[],
  previousContainer: ContentLayoutAuthoringContainerState | null,
  selectedDirectChildId: EmbeddedNodeId | null,
): ContentLayoutAuthoringContainerState {
  const contentLayout = item.presentationContainer!.contentLayout;

  if (contentLayout === PresentationContentLayout.Flow) {
    return createContainerState(item.id, directChildIds, null, "flow");
  }

  if (directChildIds.length === 0) {
    return createContainerState(item.id, directChildIds, null, "empty");
  }

  const startsNewSequence = previousContainer === null || previousContainer.resolution === "flow";
  if (startsNewSequence) {
    return createContainerState(item.id, directChildIds, directChildIds[0]!, "first-child");
  }

  const previousActiveChildId = previousContainer?.activeChildId ?? null;
  const deletedFallback = resolveDeletedChildFallback(
    directChildIds,
    previousContainer,
    previousActiveChildId,
  );
  const selectedDirectChildIsNew =
    selectedDirectChildId !== null &&
    directChildIds.includes(selectedDirectChildId) &&
    previousContainer !== null &&
    !previousContainer.directChildIds.includes(selectedDirectChildId);

  if (deletedFallback !== null) {
    if (selectedDirectChildIsNew) {
      return createContainerState(item.id, directChildIds, selectedDirectChildId, "selected");
    }
    return createContainerState(
      item.id,
      directChildIds,
      deletedFallback.activeChildId,
      deletedFallback.resolution,
    );
  }

  if (selectedDirectChildId !== null && directChildIds.includes(selectedDirectChildId)) {
    return createContainerState(item.id, directChildIds, selectedDirectChildId, "selected");
  }

  if (previousActiveChildId !== null && directChildIds.includes(previousActiveChildId)) {
    return createContainerState(item.id, directChildIds, previousActiveChildId, "retained");
  }

  return createContainerState(item.id, directChildIds, directChildIds[0]!, "first-child");
}

function resolveSelectedDirectChildIds(
  snapshot: SemanticDocumentSnapshot,
  selectedId: EmbeddedNodeId | null,
): ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId> {
  const selectedDirectChildIds = new Map<EmbeddedNodeId, EmbeddedNodeId>();
  if (selectedId === null || !snapshot.itemById.has(selectedId)) return selectedDirectChildIds;

  let directChildId = selectedId;
  let ancestorId = snapshot.parentById.get(selectedId) ?? null;
  while (ancestorId !== null) {
    const ancestor = snapshot.itemById.get(ancestorId)!;
    if (ancestor.presentationContainer !== null) {
      selectedDirectChildIds.set(ancestor.id, directChildId);
    }
    directChildId = ancestor.id;
    ancestorId = snapshot.parentById.get(ancestorId) ?? null;
  }

  return selectedDirectChildIds;
}

function resolveDeletedChildFallback(
  directChildIds: readonly EmbeddedNodeId[],
  previousContainer: ContentLayoutAuthoringContainerState | null,
  previousActiveChildId: EmbeddedNodeId | null,
): {
  readonly activeChildId: EmbeddedNodeId | null;
  readonly resolution: "first-child" | "next-after-delete" | "previous-after-delete" | "empty";
} | null {
  if (previousContainer === null || previousActiveChildId === null) return null;

  const previousActiveIndex = previousContainer.directChildIds.indexOf(previousActiveChildId);
  if (previousActiveIndex < 0 || directChildIds.includes(previousActiveChildId)) return null;

  const currentChildIds = new Set(directChildIds);
  for (
    let index = previousActiveIndex + 1;
    index < previousContainer.directChildIds.length;
    index += 1
  ) {
    const candidate = previousContainer.directChildIds[index]!;
    if (currentChildIds.has(candidate)) {
      return { activeChildId: candidate, resolution: "next-after-delete" };
    }
  }

  for (let index = previousActiveIndex - 1; index >= 0; index -= 1) {
    const candidate = previousContainer.directChildIds[index]!;
    if (currentChildIds.has(candidate)) {
      return { activeChildId: candidate, resolution: "previous-after-delete" };
    }
  }

  if (directChildIds.length > 0) {
    return { activeChildId: directChildIds[0]!, resolution: "first-child" };
  }

  return { activeChildId: null, resolution: "empty" };
}

function createContainerState(
  containerId: EmbeddedNodeId,
  directChildIds: readonly EmbeddedNodeId[],
  activeChildId: EmbeddedNodeId | null,
  resolution: ContentLayoutAuthoringResolution,
): ContentLayoutAuthoringContainerState {
  return Object.freeze({ containerId, directChildIds, activeChildId, resolution });
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
