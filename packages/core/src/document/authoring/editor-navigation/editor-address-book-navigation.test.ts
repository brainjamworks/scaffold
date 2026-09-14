// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import type { DocumentTreeSnapshot, DocumentItemLocation } from "@/document/model/document-tree";
import {
  APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES,
  DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE,
  DOCUMENT_TREE_LIFECYCLE_COURSE_DOCUMENT_ID,
  createCompleteDocumentTreeLifecycleDocument,
  createDocumentTreeLifecycleDocument,
} from "@/composition/application/testing/document-tree-lifecycle-fixtures";
import { authorizeExplicitLayerStructuralSteps } from "@/document/model/layers/layer-editing-policy";
import type {
  SemanticActivationOutcome,
  SemanticActivationRequest,
} from "@/document/semantic-target-interaction";

import { getDocumentTreeForEditor } from "../document-tree";
import { getEditorNavigationForEditor } from "./editor-navigation-storage";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { ACTIVATING_BLOCK_MEMBER_OWNER_TYPES } from "@/document/authoring/testing/activating-member-owners";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("editor address book navigation", () => {
  it("reaches every approved member by its shared ID through its current owner anchor", async () => {
    const session = createEditorSession();
    const semantics = session.tree.getSnapshot();
    const authoredDocument = session.editor.getJSON();
    const surfaceId = semantics.roots[0]?.id;
    if (!surfaceId) throw new Error("Expected complete address-book Surface.");
    const activatingFamilies = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.filter(
      ({ ownerNodeType }) => ACTIVATING_BLOCK_MEMBER_OWNER_TYPES.has(ownerNodeType),
    );
    const activationsByOwner = new Map<EmbeddedNodeId, ReturnType<typeof vi.fn>>();
    for (const family of activatingFamilies) {
      const activate = vi.fn(async (request: SemanticActivationRequest) =>
        activationOutcome("revealed", family.ownerId, request.relationship.childId),
      );
      activationsByOwner.set(family.ownerId, activate);
      session.targetInteractions.registry.register({
        ownerId: family.ownerId,
        activate,
      });
    }

    const families = [
      ...APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.filter(
        ({ ownerNodeType }) => ownerNodeType !== "table",
      ),
      requireFamily("table-rows"),
    ];
    for (const family of families) {
      const memberId = family.memberIds.first;
      const ownerLocation = requireLocation(semantics, family.ownerId);
      session.presentSurface.mockClear();
      session.bringIntoView.mockClear();
      session.createActivationTransaction.mockClear();
      session.focus.mockClear();
      for (const activate of activationsByOwner.values()) activate.mockClear();

      await expect(
        session.controller.showTarget(memberId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: memberId });

      expect(session.controller.getSelectionSnapshot()).toMatchObject({
        selectedId: memberId,
        selectionOrigin: "document-outline",
      });
      expect(session.tree.getSnapshot()).toBe(semantics);
      expect(session.presentSurface).toHaveBeenCalledWith(surfaceId);
      expect(session.bringIntoView).toHaveBeenCalledWith(ownerLocation, "smooth");
      expect(session.createActivationTransaction).toHaveBeenNthCalledWith(1, ownerLocation);
      expect(session.createActivationTransaction).toHaveBeenNthCalledWith(2, ownerLocation);
      expectSelectionWithinNode(session.editor, family.ownerId);
      expect(session.editor.getJSON()).toEqual(authoredDocument);
      expect(session.focus).not.toHaveBeenCalled();

      const activate = activationsByOwner.get(family.ownerId);
      if (activate) {
        expect(activate).toHaveBeenCalledOnce();
        expect(activate).toHaveBeenCalledWith(
          expect.objectContaining({
            requestedId: memberId,
            relationship: expect.objectContaining({ childId: memberId }),
            origin: "document-outline",
            signal: expect.any(AbortSignal),
          }),
        );
      } else {
        expect(
          [...activationsByOwner.values()].every((candidate) => candidate.mock.calls.length === 0),
        ).toBe(true);
      }
    }
  });

  it("re-resolves Timeline member and anchor locations after awaited Block activation", async () => {
    const session = createEditorSession();
    const timeline = requireFamily("timeline-entries");
    const targetId = timeline.memberIds.second;
    const baseline = session.tree.getSnapshot();
    const baselineOwnerLocation = requireLocation(baseline, timeline.ownerId);
    const started = deferred<void>();
    const waiting = deferred<SemanticActivationOutcome>();
    const activationOrder: EmbeddedNodeId[] = [];
    session.targetInteractions.registry.register({
      ownerId: timeline.ownerId,
      activate: ({ relationship }) => {
        activationOrder.push(relationship.childId);
        started.resolve(undefined);
        return waiting.promise;
      },
    });

    const request = session.controller.showTarget(targetId, { origin: "presentation-timeline" });
    await started.promise;
    dispatchReplacement(session.editor, documentWithTimelineFirst());
    const current = session.tree.getSnapshot();
    const currentOwnerLocation = requireLocation(current, timeline.ownerId);
    const replacementDocument = session.editor.getJSON();
    expect(current).not.toBe(baseline);
    expect(currentOwnerLocation.from).not.toBe(baselineOwnerLocation.from);
    waiting.resolve(activationOutcome("revealed", timeline.ownerId, targetId));

    await expect(request).resolves.toEqual({ kind: "reached", id: targetId });
    expect(activationOrder).toEqual([targetId]);
    expect(session.bringIntoView).toHaveBeenCalledWith(currentOwnerLocation, "smooth");
    expect(session.bringIntoView).not.toHaveBeenCalledWith(baselineOwnerLocation, "smooth");
    expect(session.controller.getSelectionSnapshot()).toMatchObject({
      selectedId: targetId,
      selectionOrigin: "presentation-timeline",
    });
    expectSelectionWithinNode(session.editor, timeline.ownerId);
    expect(session.editor.getJSON()).toEqual(replacementDocument);
    expect(session.focus).not.toHaveBeenCalled();
  });

  it("re-resolves the current authoring anchor after awaited viewport movement", async () => {
    const session = createEditorSession();
    const timeline = requireFamily("timeline-entries");
    const targetId = timeline.memberIds.second;
    const baseline = session.tree.getSnapshot();
    const baselineOwnerLocation = requireLocation(baseline, timeline.ownerId);
    const viewportStarted = deferred<void>();
    const viewportWaiting = deferred<void>();
    session.targetInteractions.registry.register({
      ownerId: timeline.ownerId,
      activate: async ({ relationship }) =>
        activationOutcome("already-visible", timeline.ownerId, relationship.childId),
    });
    session.bringIntoView.mockImplementationOnce(async () => {
      viewportStarted.resolve(undefined);
      await viewportWaiting.promise;
    });

    const request = session.controller.showTarget(targetId, { origin: "document-outline" });
    await viewportStarted.promise;
    dispatchReplacement(session.editor, documentWithTimelineFirst());
    const currentOwnerLocation = requireLocation(session.tree.getSnapshot(), timeline.ownerId);
    expect(currentOwnerLocation.from).not.toBe(baselineOwnerLocation.from);
    viewportWaiting.resolve(undefined);

    await expect(request).resolves.toEqual({ kind: "reached", id: targetId });
    expect(session.createActivationTransaction).toHaveBeenNthCalledWith(1, baselineOwnerLocation);
    expect(session.createActivationTransaction).toHaveBeenNthCalledWith(2, currentOwnerLocation);
    expect(session.controller.getSelectionSnapshot()).toMatchObject({
      selectedId: targetId,
      selectionOrigin: "document-outline",
    });
    expectSelectionWithinNode(session.editor, timeline.ownerId);
    expect(session.focus).not.toHaveBeenCalled();
  });

  it("preserves typed missing and activation-unavailable outcomes for matrix IDs", async () => {
    const timeline = requireFamily("timeline-entries");
    const privateId = timeline.privateDescendantIds[0];
    if (!privateId) throw new Error("Expected a persisted private Timeline descendant.");
    const missingSession = createEditorSession();

    await expect(
      missingSession.controller.showTarget(privateId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "missing", id: privateId });
    expect(missingSession.presentSurface).not.toHaveBeenCalled();
    expect(missingSession.bringIntoView).not.toHaveBeenCalled();

    for (const bindingKind of ["missing", "unavailable"] as const) {
      const session = createEditorSession();
      const authoredDocument = session.editor.getJSON();
      if (bindingKind === "unavailable") {
        session.targetInteractions.registry.register({
          ownerId: timeline.ownerId,
          activate: async ({ relationship }) => ({
            kind: "unavailable",
            ownerId: timeline.ownerId,
            childId: relationship.childId,
            reason: "child-missing",
          }),
        });
      }

      await expect(
        session.controller.showTarget(timeline.memberIds.first, { origin: "document-outline" }),
      ).resolves.toEqual({
        kind: "reached-owner",
        requestedId: timeline.memberIds.first,
        ownerId: timeline.ownerId,
        reason: bindingKind === "missing" ? "owner-unmounted" : "child-missing",
      });
      expect(session.controller.getSelectionSnapshot().selectedId).toBe(timeline.memberIds.first);
      expectSelectionWithinNode(session.editor, timeline.ownerId);
      expect(session.editor.getJSON()).toEqual(authoredDocument);
      expect(session.focus).not.toHaveBeenCalled();
    }
  });

  it("interrupts a superseded Timeline request before selection or scroll effects", async () => {
    const session = createEditorSession();
    const timeline = requireFamily("timeline-entries");
    const currentFamily = requireFamily("flashcard-cards");
    const staleTargetId = timeline.memberIds.first;
    const currentTargetId = currentFamily.memberIds.first;
    const authoredDocument = session.editor.getJSON();
    const started = deferred<void>();
    session.targetInteractions.registry.register({
      ownerId: timeline.ownerId,
      activate: ({ relationship, signal }) =>
        new Promise((resolve) => {
          started.resolve(undefined);
          signal.addEventListener(
            "abort",
            () => resolve(activationOutcome("interrupted", timeline.ownerId, relationship.childId)),
            { once: true },
          );
        }),
    });
    session.targetInteractions.registry.register({
      ownerId: currentFamily.ownerId,
      activate: async ({ relationship }) =>
        activationOutcome("already-visible", currentFamily.ownerId, relationship.childId),
    });

    const staleRequest = session.controller.showTarget(staleTargetId, {
      origin: "document-outline",
    });
    await started.promise;
    await expect(
      session.controller.showTarget(currentTargetId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "reached", id: currentTargetId });

    await expect(staleRequest).resolves.toEqual({ kind: "interrupted", id: staleTargetId });
    expect(session.controller.getSelectionSnapshot().selectedId).toBe(currentTargetId);
    expectSelectionWithinNode(session.editor, currentFamily.ownerId);
    expect(session.bringIntoView).toHaveBeenCalledOnce();
    expect(session.editor.getJSON()).toEqual(authoredDocument);
    expect(session.focus).not.toHaveBeenCalled();
  });
});

function activationOutcome(
  kind: "revealed" | "already-visible" | "interrupted",
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): SemanticActivationOutcome {
  return { kind, ownerId, childId };
}

function createEditorSession() {
  const editor = createEditor();
  const controller = getEditorNavigationForEditor(editor);
  const focus = vi.fn();
  controller.setEditor({
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus,
  });
  const presentSurface = vi.fn(async () => undefined);
  const bringIntoView = vi.fn(async () => undefined);
  const createActivationTransaction = vi.fn((location: DocumentItemLocation) =>
    transactionForLocation(editor, location),
  );
  controller.setEnvironment({
    presentSurface,
    bringIntoView,
    createActivationTransaction,
  });
  return {
    editor,
    controller,
    tree: getDocumentTreeForEditor(editor),
    targetInteractions: getSemanticTargetInteractionEnvironmentForEditor(editor),
    focus,
    presentSurface,
    bringIntoView,
    createActivationTransaction,
  };
}

function createEditor(): Editor {
  const editor = new Editor({
    editable: true,
    extensions: DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE.extensions,
    content: createCompleteDocumentTreeLifecycleDocument().toJSON(),
  });
  editors.push(editor);
  return editor;
}

function transactionForLocation(editor: Editor, location: DocumentItemLocation): Transaction {
  const transaction = editor.state.tr;
  switch (location.selectionTarget.kind) {
    case "node":
      return transaction.setSelection(
        NodeSelection.create(transaction.doc, location.selectionTarget.pos),
      );
    case "text":
      return transaction.setSelection(
        TextSelection.create(
          transaction.doc,
          location.selectionTarget.from,
          location.selectionTarget.to,
        ),
      );
    case "near":
      return transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(location.selectionTarget.pos)),
      );
  }
}

function expectSelectionWithinNode(editor: Editor, nodeId: EmbeddedNodeId): void {
  let position: number | null = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] !== nodeId) return true;
    position = nodePosition;
    return false;
  });
  if (position === null) throw new Error(`Missing physical selection owner ${nodeId}.`);
  const node = editor.state.doc.nodeAt(position);
  if (!node) throw new Error(`Missing node for physical selection owner ${nodeId}.`);

  expect(editor.state.selection.from).toBeGreaterThanOrEqual(position);
  expect(editor.state.selection.to).toBeLessThanOrEqual(position + node.nodeSize);
}

function requireLocation(snapshot: DocumentTreeSnapshot, id: EmbeddedNodeId): DocumentItemLocation {
  const location = snapshot.locationById.get(id);
  if (!location) throw new Error(`Missing semantic location ${id}.`);
  return location;
}

function requireFamily(key: string) {
  const family = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.find(
    (candidate) => candidate.key === key,
  );
  if (!family) throw new Error(`Missing approved semantic family ${key}.`);
  return family;
}

function documentWithTimelineFirst(): ProseMirrorNode {
  const timeline = requireFamily("timeline-entries");
  return createDocumentTreeLifecycleDocument([
    timeline.createOwner(),
    ...APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.filter((family) => family !== timeline).map(
      (family) => family.createOwner(),
    ),
  ]);
}

function dispatchReplacement(editor: Editor, replacement: ProseMirrorNode): void {
  const compatibleReplacement = editor.schema.nodeFromJSON(replacement.toJSON());
  const transaction = editor.state.tr.replaceWith(
    0,
    editor.state.doc.content.size,
    compatibleReplacement.content,
  );
  authorizeExplicitLayerStructuralSteps(transaction, {
    fromStep: 0,
    rootIds: [DOCUMENT_TREE_LIFECYCLE_COURSE_DOCUMENT_ID],
  });
  if (!projectAuthoringCourseStructure(transaction.doc)) {
    throw new Error("Invalid complete address-book replacement.");
  }
  editor.view.dispatch(transaction);
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
