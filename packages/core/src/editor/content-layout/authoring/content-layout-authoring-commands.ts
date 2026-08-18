import type { Editor } from "@tiptap/core";
import { PresentationContentLayout, type EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Result, type Result as ResultType } from "better-result";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import { setSemanticSelectionTransactionMeta } from "@/document/authoring/semantic-document/semantic-selection-origin";
import type { SemanticLocation } from "@/document/model/semantic-document";
import { resolveSemanticPresentationContainer } from "@/document/model/semantic-document/presentation-container-resolution";
import {
  createAuthoringInteractionNavigationTransaction,
  resolveAuthoringInteractionNavigationTarget,
} from "@/editor/interactions/targets/prosemirror/activation/interaction-navigation";
import {
  setNodeSelectionInTransaction,
  setTextSelectionInTransaction,
  setTextSelectionNearInTransaction,
} from "@/editor/selection/selection-transactions";

import {
  setContainerContentLayoutChecked,
  type ContentLayoutCommandError,
} from "../model/content-layout-command";
import { readContentLayoutAuthoringState } from "../prosemirror/content-layout-authoring-extension";

export type ContentLayoutAuthoringIssue =
  | { readonly kind: "container-unavailable"; readonly containerId: EmbeddedNodeId }
  | {
      readonly kind: "child-unavailable";
      readonly containerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }
  | {
      readonly kind: "child-not-direct";
      readonly containerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }
  | { readonly kind: "navigation-unavailable"; readonly childId: EmbeddedNodeId }
  | {
      readonly kind: "layout-change-rejected";
      readonly issue: ContentLayoutCommandError;
    };

export type ContentLayoutAuthoringResult = ResultType<void, ContentLayoutAuthoringIssue>;

type AvailableContentLayoutDirection = {
  readonly kind: "available";
  readonly childId: EmbeddedNodeId;
};

type DisabledContentLayoutDirection<Reason extends "empty" | "end" | "start"> = {
  readonly kind: "disabled";
  readonly reason: Reason;
};

export type ContentLayoutAuthoringPreviousDirection =
  | AvailableContentLayoutDirection
  | DisabledContentLayoutDirection<"start">;

export type ContentLayoutAuthoringNextDirection =
  | AvailableContentLayoutDirection
  | DisabledContentLayoutDirection<"end">;

export type ContentLayoutAuthoringNavigation =
  | { readonly kind: "unavailable"; readonly containerId: EmbeddedNodeId }
  | {
      readonly kind: "empty";
      readonly containerId: EmbeddedNodeId;
      readonly activeChildId: null;
      readonly ordinal: null;
      readonly count: 0;
      readonly previous: DisabledContentLayoutDirection<"empty">;
      readonly next: DisabledContentLayoutDirection<"empty">;
    }
  | {
      readonly kind: "ready";
      readonly containerId: EmbeddedNodeId;
      readonly activeChildId: EmbeddedNodeId;
      readonly ordinal: number;
      readonly count: number;
      readonly previous: ContentLayoutAuthoringPreviousDirection;
      readonly next: ContentLayoutAuthoringNextDirection;
    };

export function readContentLayoutAuthoringNavigation(
  state: EditorState,
  containerId: EmbeddedNodeId,
): ContentLayoutAuthoringNavigation {
  const container = readContentLayoutAuthoringState(state).containers.get(containerId);
  if (!container) return Object.freeze({ kind: "unavailable", containerId });
  if (container.resolution === "flow") {
    return Object.freeze({ kind: "unavailable", containerId });
  }
  if (container.directChildIds.length === 0) {
    return Object.freeze({
      kind: "empty",
      containerId,
      activeChildId: null,
      ordinal: null,
      count: 0,
      previous: disabledDirection("empty"),
      next: disabledDirection("empty"),
    });
  }

  const activeIndex = container.activeChildId
    ? container.directChildIds.indexOf(container.activeChildId)
    : -1;
  if (activeIndex < 0 || container.activeChildId === null) {
    throw new Error(`Content Layout container "${containerId}" has no valid active child`);
  }

  return Object.freeze({
    kind: "ready",
    containerId,
    activeChildId: container.activeChildId,
    ordinal: activeIndex + 1,
    count: container.directChildIds.length,
    previous:
      activeIndex === 0
        ? disabledDirection("start")
        : availableDirection(container.directChildIds[activeIndex - 1]!),
    next:
      activeIndex === container.directChildIds.length - 1
        ? disabledDirection("end")
        : availableDirection(container.directChildIds[activeIndex + 1]!),
  });
}

export function navigateAuthoringContentLayoutChild({
  editor,
  containerId,
  childId,
}: {
  readonly editor: Editor;
  readonly containerId: EmbeddedNodeId;
  readonly childId: EmbeddedNodeId;
}): ContentLayoutAuthoringResult {
  if (editor.isDestroyed) return navigationUnavailable(childId);

  const prepared = prepareNavigationTransaction({ editor, containerId, childId });
  if (prepared.isErr()) return Result.err(prepared.error);

  editor.view.dispatch(prepared.value.scrollIntoView());
  editor.view.focus();
  return Result.ok();
}

export function setAuthoringContentLayout({
  editor,
  containerId,
  contentLayout,
}: {
  readonly editor: Editor;
  readonly containerId: EmbeddedNodeId;
  readonly contentLayout: PresentationContentLayout;
}): ContentLayoutAuthoringResult {
  if (editor.isDestroyed) return containerUnavailable(containerId);

  const snapshot = getSemanticDocumentControllerForEditor(editor).getSnapshot().semantics;
  const container = snapshot.itemById.get(containerId);
  if (!container || container.presentationContainer === null) {
    return containerUnavailable(containerId);
  }
  if (container.presentationContainer.contentLayout === contentLayout) return Result.ok();

  let transaction = editor.state.tr;
  let shouldFocus = false;
  if (
    container.presentationContainer.contentLayout === PresentationContentLayout.Flow &&
    contentLayout === PresentationContentLayout.Sequence &&
    container.children[0]
  ) {
    const prepared = prepareNavigationTransaction({
      editor,
      containerId,
      childId: container.children[0].id,
    });
    if (prepared.isErr()) return Result.err(prepared.error);
    transaction = prepared.value;
    shouldFocus = true;
  }

  const capabilities = getScaffoldCapabilitiesForEditor(editor);
  const checked = setContainerContentLayoutChecked({
    tr: transaction,
    containerId,
    contentLayout,
    blockDefinitions: capabilities.blocks.registry,
    layoutDefinitions: capabilities.layouts.registry,
  });
  if (!checked.ok) return layoutChangeRejected(checked.issue);

  editor.view.dispatch(checked.tr.scrollIntoView());
  if (shouldFocus) editor.view.focus();
  return Result.ok();
}

function prepareNavigationTransaction({
  editor,
  containerId,
  childId,
}: {
  readonly editor: Editor;
  readonly containerId: EmbeddedNodeId;
  readonly childId: EmbeddedNodeId;
}): ResultType<Transaction, ContentLayoutAuthoringIssue> {
  const snapshot = getSemanticDocumentControllerForEditor(editor).getSnapshot().semantics;
  const container = snapshot.itemById.get(containerId);
  if (!container || container.presentationContainer === null) {
    return Result.err(Object.freeze({ kind: "container-unavailable", containerId }));
  }
  if (!snapshot.itemById.has(childId)) {
    return Result.err(Object.freeze({ kind: "child-unavailable", containerId, childId }));
  }

  const boundary = resolveSemanticPresentationContainer(snapshot, childId);
  if (
    boundary === null ||
    boundary.boundaryId !== containerId ||
    boundary.directChildId !== childId
  ) {
    return Result.err(Object.freeze({ kind: "child-not-direct", containerId, childId }));
  }

  const location = snapshot.locationById.get(childId);
  if (!location || !locationMatchesDocument(editor.state, location)) {
    return Result.err(Object.freeze({ kind: "navigation-unavailable", childId }));
  }

  const child = snapshot.itemById.get(childId)!;
  const transaction =
    child.kind === "rich-text"
      ? createExactSelectionTransaction(editor.state, location)
      : createOwnerActivationTransaction(editor, location);
  if (!transaction) {
    return Result.err(Object.freeze({ kind: "navigation-unavailable", childId }));
  }

  setSemanticSelectionTransactionMeta(transaction, {
    intendedId: childId,
    origin: "content-layout",
  });
  return Result.ok(transaction);
}

function createExactSelectionTransaction(
  state: EditorState,
  location: SemanticLocation,
): Transaction | null {
  const transaction = state.tr;
  const target = location.selectionTarget;
  switch (target.kind) {
    case "node":
      return setNodeSelectionInTransaction(transaction, target.pos) ? transaction : null;
    case "text":
      return setTextSelectionInTransaction(transaction, target.from, target.to)
        ? transaction
        : null;
    case "near":
      return setTextSelectionNearInTransaction(transaction, target.pos) ? transaction : null;
  }
}

function createOwnerActivationTransaction(
  editor: Editor,
  location: SemanticLocation,
): Transaction | null {
  const capabilities = getScaffoldCapabilitiesForEditor(editor);
  const target = resolveAuthoringInteractionNavigationTarget(
    editor.state,
    { id: location.id, nodeType: location.nodeType, pos: location.from },
    capabilities.blocks.registry,
  );
  return target ? createAuthoringInteractionNavigationTransaction(editor.state, target) : null;
}

function locationMatchesDocument(state: EditorState, location: SemanticLocation): boolean {
  const node = state.doc.nodeAt(location.from);
  return node?.attrs["id"] === location.id && node.type.name === location.nodeType;
}

function navigationUnavailable(childId: EmbeddedNodeId): ContentLayoutAuthoringResult {
  return Result.err(Object.freeze({ kind: "navigation-unavailable", childId }));
}

function containerUnavailable(containerId: EmbeddedNodeId): ContentLayoutAuthoringResult {
  return Result.err(Object.freeze({ kind: "container-unavailable", containerId }));
}

function layoutChangeRejected(issue: ContentLayoutCommandError): ContentLayoutAuthoringResult {
  return Result.err(
    Object.freeze({
      kind: "layout-change-rejected",
      issue: freezeContentLayoutCommandError(issue),
    }),
  );
}

function freezeContentLayoutCommandError(
  issue: ContentLayoutCommandError,
): ContentLayoutCommandError {
  if (issue.code === "incompatible_flow_placement") {
    return Object.freeze({
      ...issue,
      blockingChildIds: Object.freeze([...issue.blockingChildIds]),
    });
  }
  return Object.freeze({ ...issue });
}

function availableDirection(childId: EmbeddedNodeId): AvailableContentLayoutDirection {
  return Object.freeze({ kind: "available", childId });
}

function disabledDirection<Reason extends "empty" | "end" | "start">(
  reason: Reason,
): DisabledContentLayoutDirection<Reason> {
  return Object.freeze({ kind: "disabled", reason });
}
