// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import type {
  SemanticDocumentSnapshot,
  SemanticLocation,
} from "@/document/model/semantic-document";
import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_AUTHORING_STATE,
  createCompleteSemanticLifecycleDocument,
  createSemanticLifecycleDocument,
} from "@/document/model/semantic-document/testing/semantic-publication-lifecycle-fixtures";
import type {
  SemanticActivationOutcome,
  SemanticActivationRequest,
} from "@/document/semantic-target-interaction";

import { getSemanticDocumentControllerForEditor } from "./semantic-document-storage";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("semantic presentation address book navigation", () => {
  it("reaches every approved member by its shared ID through its current owner anchor", async () => {
    const session = createEditorSession();
    const semantics = session.controller.getSnapshot().semantics;
    const authoredDocument = session.editor.getJSON();
    const surfaceId = semantics.roots[0]?.id;
    if (!surfaceId) throw new Error("Expected complete address-book Surface.");
    const activatingFamilies = APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.filter(({ ownerNodeType }) =>
      ACTIVATING_BLOCK_MEMBER_OWNER_TYPES.has(ownerNodeType),
    );
    const activationsByOwner = new Map<EmbeddedNodeId, ReturnType<typeof vi.fn>>();
    for (const family of activatingFamilies) {
      const activate = vi.fn(async (request: SemanticActivationRequest) =>
        activationOutcome("revealed", family.ownerId, request.relationship.childId),
      );
      activationsByOwner.set(family.ownerId, activate);
      session.controller.semanticActivations.register({ ownerId: family.ownerId, activate });
    }

    const families = [
      ...APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.filter(
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
        session.controller.select(memberId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: memberId });

      expect(session.controller.getSnapshot()).toMatchObject({
        selectedId: memberId,
        selectionOrigin: "document-outline",
      });
      expect(session.controller.getSnapshot().semantics).toBe(semantics);
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
    const baseline = session.controller.getSnapshot().semantics;
    const baselineOwnerLocation = requireLocation(baseline, timeline.ownerId);
    const started = deferred<void>();
    const waiting = deferred<SemanticActivationOutcome>();
    const activationOrder: EmbeddedNodeId[] = [];
    session.controller.semanticActivations.register({
      ownerId: timeline.ownerId,
      activate: ({ relationship }) => {
        activationOrder.push(relationship.childId);
        started.resolve(undefined);
        return waiting.promise;
      },
    });

    const request = session.controller.select(targetId, { origin: "presentation-timeline" });
    await started.promise;
    dispatchReplacement(session.editor, documentWithTimelineFirst());
    const current = session.controller.getSnapshot().semantics;
    const currentOwnerLocation = requireLocation(current, timeline.ownerId);
    const replacementDocument = session.editor.getJSON();
    expect(current).not.toBe(baseline);
    expect(currentOwnerLocation.from).not.toBe(baselineOwnerLocation.from);
    waiting.resolve(activationOutcome("revealed", timeline.ownerId, targetId));

    await expect(request).resolves.toEqual({ kind: "reached", id: targetId });
    expect(activationOrder).toEqual([targetId]);
    expect(session.bringIntoView).toHaveBeenCalledWith(currentOwnerLocation, "smooth");
    expect(session.bringIntoView).not.toHaveBeenCalledWith(baselineOwnerLocation, "smooth");
    expect(session.controller.getSnapshot()).toMatchObject({
      selectedId: targetId,
      selectionOrigin: "presentation-timeline",
    });
    expectSelectionWithinNode(session.editor, timeline.ownerId);
    expect(session.editor.getJSON()).toEqual(replacementDocument);
    expect(session.focus).not.toHaveBeenCalled();
  });

  it("preserves typed missing and activation-unavailable outcomes for matrix IDs", async () => {
    const timeline = requireFamily("timeline-entries");
    const privateId = timeline.privateDescendantIds[0];
    if (!privateId) throw new Error("Expected a persisted private Timeline descendant.");
    const missingSession = createEditorSession();

    await expect(
      missingSession.controller.select(privateId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "missing", id: privateId });
    expect(missingSession.presentSurface).not.toHaveBeenCalled();
    expect(missingSession.bringIntoView).not.toHaveBeenCalled();

    for (const bindingKind of ["missing", "unavailable"] as const) {
      const session = createEditorSession();
      const authoredDocument = session.editor.getJSON();
      if (bindingKind === "unavailable") {
        session.controller.semanticActivations.register({
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
        session.controller.select(timeline.memberIds.first, { origin: "document-outline" }),
      ).resolves.toEqual({
        kind: "reached-owner",
        requestedId: timeline.memberIds.first,
        ownerId: timeline.ownerId,
        reason: bindingKind === "missing" ? "owner-unmounted" : "child-missing",
      });
      expect(session.controller.getSnapshot().selectedId).toBe(timeline.memberIds.first);
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
    session.controller.semanticActivations.register({
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
    session.controller.semanticActivations.register({
      ownerId: currentFamily.ownerId,
      activate: async ({ relationship }) =>
        activationOutcome("already-visible", currentFamily.ownerId, relationship.childId),
    });

    const staleRequest = session.controller.select(staleTargetId, {
      origin: "document-outline",
    });
    await started.promise;
    await expect(
      session.controller.select(currentTargetId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "reached", id: currentTargetId });

    await expect(staleRequest).resolves.toEqual({ kind: "interrupted", id: staleTargetId });
    expect(session.controller.getSnapshot().selectedId).toBe(currentTargetId);
    expectSelectionWithinNode(session.editor, currentFamily.ownerId);
    expect(session.bringIntoView).toHaveBeenCalledOnce();
    expect(session.editor.getJSON()).toEqual(authoredDocument);
    expect(session.focus).not.toHaveBeenCalled();
  });
});

const ACTIVATING_BLOCK_MEMBER_OWNER_TYPES = new Set([
  "flashcard",
  "gallery",
  "process_flow",
  "roadmap",
  "timeline",
]);

function activationOutcome(
  kind: "revealed" | "already-visible" | "interrupted",
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): SemanticActivationOutcome {
  return { kind, ownerId, childId };
}

function createEditorSession() {
  const editor = createEditor();
  const controller = getSemanticDocumentControllerForEditor(editor);
  const focus = vi.fn();
  controller.setNavigationEditor({
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus,
  });
  const presentSurface = vi.fn(async () => undefined);
  const bringIntoView = vi.fn(async () => undefined);
  const createActivationTransaction = vi.fn((location: SemanticLocation) =>
    transactionForLocation(editor, location),
  );
  controller.setNavigationEnvironment({
    presentSurface,
    bringIntoView,
    createActivationTransaction,
  });
  return {
    editor,
    controller,
    focus,
    presentSurface,
    bringIntoView,
    createActivationTransaction,
  };
}

function createEditor(): Editor {
  const editor = new Editor({
    editable: true,
    extensions: SEMANTIC_LIFECYCLE_AUTHORING_STATE.extensions,
    content: createCompleteSemanticLifecycleDocument().toJSON(),
  });
  editors.push(editor);
  return editor;
}

function transactionForLocation(editor: Editor, location: SemanticLocation): Transaction {
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

function requireLocation(snapshot: SemanticDocumentSnapshot, id: EmbeddedNodeId): SemanticLocation {
  const location = snapshot.locationById.get(id);
  if (!location) throw new Error(`Missing semantic location ${id}.`);
  return location;
}

function requireFamily(key: string) {
  const family = APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.find((candidate) => candidate.key === key);
  if (!family) throw new Error(`Missing approved semantic family ${key}.`);
  return family;
}

function documentWithTimelineFirst(): ProseMirrorNode {
  const timeline = requireFamily("timeline-entries");
  return createSemanticLifecycleDocument([
    timeline.createOwner(),
    ...APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.filter((family) => family !== timeline).map((family) =>
      family.createOwner(),
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
