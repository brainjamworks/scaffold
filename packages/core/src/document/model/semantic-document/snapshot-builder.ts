import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";

import type { SemanticLocation } from "./semantic-location";
import type { SemanticProjectionDiagnostic } from "./projection-diagnostic";
import type {
  SemanticDocumentSnapshot,
  SemanticItem,
  SemanticItemKind,
  SemanticPresentationCapability,
} from "./semantic-document-snapshot";

export interface SemanticSnapshotItemInput {
  readonly id: EmbeddedNodeId;
  readonly kind: SemanticItemKind;
  readonly nodeType: string;
  readonly definitionId: string | null;
  readonly label: string;
  readonly summary: string | null;
  readonly presentation: SemanticPresentationCapability;
}

export interface AddSemanticSnapshotItemInput {
  readonly item: SemanticSnapshotItemInput;
  readonly parentId: EmbeddedNodeId | null;
  readonly location: SemanticLocation;
}

export type SemanticSnapshotBuildErrorCode =
  | "builder-finalized"
  | "duplicate-item-id"
  | "invalid-item-id"
  | "invalid-location"
  | "invalid-selection-target"
  | "missing-parent"
  | "cyclic-parent-edge"
  | "invalid-surface-reference";

export class SemanticSnapshotBuildError extends Error {
  readonly code: SemanticSnapshotBuildErrorCode;
  readonly itemId: EmbeddedNodeId | null;

  constructor(code: SemanticSnapshotBuildErrorCode, itemId: EmbeddedNodeId | null) {
    super(`Semantic snapshot build failed: ${code}${itemId ? ` (${itemId})` : ""}.`);
    this.name = "SemanticSnapshotBuildError";
    this.code = code;
    this.itemId = itemId;
  }
}

export interface SemanticSnapshotBuilder {
  addItem(input: AddSemanticSnapshotItemInput): void;
  addDiagnostic(diagnostic: SemanticProjectionDiagnostic): void;
  build(): SemanticDocumentSnapshot;
}

interface ItemRecord extends AddSemanticSnapshotItemInput {}

export function createSemanticSnapshotBuilder(input: {
  readonly revision: number;
  readonly mode: "page" | "slideshow";
}): SemanticSnapshotBuilder {
  const records = new Map<EmbeddedNodeId, ItemRecord>();
  const diagnostics: SemanticProjectionDiagnostic[] = [];
  let finalized = false;

  return {
    addItem(record) {
      assertOpen(finalized);
      if (!EmbeddedNodeIdSchema.safeParse(record.item.id).success) {
        throw new SemanticSnapshotBuildError("invalid-item-id", null);
      }
      if (records.has(record.item.id)) {
        throw new SemanticSnapshotBuildError("duplicate-item-id", record.item.id);
      }
      records.set(record.item.id, record);
    },
    addDiagnostic(diagnostic) {
      assertOpen(finalized);
      diagnostics.push(diagnostic);
    },
    build() {
      assertOpen(finalized);
      finalized = true;
      validateRevision(input.revision);
      validateRecords(records);

      const childIdsByParent = new Map<EmbeddedNodeId, EmbeddedNodeId[]>();
      const rootIds: EmbeddedNodeId[] = [];
      for (const [id, record] of records) {
        if (record.parentId === null) {
          rootIds.push(id);
        } else {
          const siblings = childIdsByParent.get(record.parentId) ?? [];
          siblings.push(id);
          childIdsByParent.set(record.parentId, siblings);
        }
      }

      const itemById = new Map<EmbeddedNodeId, SemanticItem>();
      const freezeItem = (id: EmbeddedNodeId): SemanticItem => {
        const existing = itemById.get(id);
        if (existing) return existing;
        const record = records.get(id)!;
        const children = Object.freeze(
          (childIdsByParent.get(id) ?? []).map((childId) => freezeItem(childId)),
        );
        const item = Object.freeze({
          ...record.item,
          presentation: freezePresentation(record.item.presentation),
          children,
        });
        itemById.set(id, item);
        return item;
      };

      const roots = Object.freeze(rootIds.map((id) => freezeItem(id)));
      const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
      const locationById = new Map<EmbeddedNodeId, SemanticLocation>();
      for (const [id, record] of records) {
        parentById.set(id, record.parentId);
        locationById.set(id, freezeLocation(record.location));
      }

      return Object.freeze({
        revision: input.revision,
        mode: input.mode,
        roots,
        itemById: freezeReadonlyMap(itemById),
        parentById: freezeReadonlyMap(parentById),
        locationById: freezeReadonlyMap(locationById),
        diagnostics: Object.freeze(
          diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })),
        ),
      });
    },
  };
}

function assertOpen(finalized: boolean): void {
  if (finalized) throw new SemanticSnapshotBuildError("builder-finalized", null);
}

function validateRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new SemanticSnapshotBuildError("invalid-location", null);
  }
}

function validateRecords(records: ReadonlyMap<EmbeddedNodeId, ItemRecord>): void {
  for (const [id, record] of records) {
    if (record.parentId !== null && !records.has(record.parentId)) {
      throw new SemanticSnapshotBuildError("missing-parent", id);
    }
    validateLocation(record.item, record.location, records);
  }

  const complete = new Set<EmbeddedNodeId>();
  for (const id of records.keys()) {
    const path = new Set<EmbeddedNodeId>();
    let current: EmbeddedNodeId | null = id;
    while (current !== null && !complete.has(current)) {
      if (path.has(current)) {
        throw new SemanticSnapshotBuildError("cyclic-parent-edge", current);
      }
      path.add(current);
      current = records.get(current)?.parentId ?? null;
    }
    for (const pathId of path) complete.add(pathId);
  }
}

function validateLocation(
  item: SemanticSnapshotItemInput,
  location: SemanticLocation,
  records: ReadonlyMap<EmbeddedNodeId, ItemRecord>,
): void {
  if (
    location.id !== item.id ||
    location.nodeType !== item.nodeType ||
    !validPosition(location.from) ||
    !validPosition(location.to) ||
    location.from >= location.to
  ) {
    throw new SemanticSnapshotBuildError("invalid-location", item.id);
  }

  const { selectionTarget } = location;
  const validTarget =
    selectionTarget.kind === "text"
      ? validPosition(selectionTarget.from) &&
        validPosition(selectionTarget.to) &&
        selectionTarget.from <= selectionTarget.to &&
        selectionTarget.from >= location.from &&
        selectionTarget.to <= location.to
      : validPosition(selectionTarget.pos) &&
        selectionTarget.pos >= location.from &&
        selectionTarget.pos <= location.to;
  if (!validTarget) {
    throw new SemanticSnapshotBuildError("invalid-selection-target", item.id);
  }

  if (location.surfaceId !== null) {
    const surface = records.get(location.surfaceId)?.item;
    if (!surface || surface.kind !== "surface") {
      throw new SemanticSnapshotBuildError("invalid-surface-reference", item.id);
    }
  }
}

function validPosition(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function freezePresentation(
  presentation: SemanticPresentationCapability,
): SemanticPresentationCapability {
  return Object.freeze({
    actionIds: Object.freeze([...presentation.actionIds]),
    disabledReason: presentation.disabledReason,
  });
}

function freezeLocation(location: SemanticLocation): SemanticLocation {
  return Object.freeze({
    ...location,
    selectionTarget: Object.freeze({ ...location.selectionTarget }),
    activationPath: Object.freeze(
      location.activationPath.map((relationship) => Object.freeze({ ...relationship })),
    ),
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
