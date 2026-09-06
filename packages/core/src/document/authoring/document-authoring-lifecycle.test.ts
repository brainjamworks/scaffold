// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DocumentItemLocation } from "@/document/model/document-tree";
import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import { getControlCapabilityCatalogueForEditor } from "@/document/control-binding";
import {
  APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES,
  DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE,
  createCompleteDocumentTreeLifecycleDocument,
  createDocumentTreeLifecycleDocument,
  requireDocumentTreeLifecycleNodeById,
} from "@/composition/application/testing/document-tree-lifecycle-fixtures";

import { getDocumentTreeForEditor } from "./document-tree";
import { getEditorNavigationForEditor } from "./editor-navigation";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { ACTIVATING_BLOCK_MEMBER_OWNER_TYPES } from "@/document/authoring/testing/activating-member-owners";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("document authoring lifecycle", () => {
  it("interrupts pending mounted activation on editor teardown without stale authoring follow-up", async () => {
    const editor = createLifecycleEditor(createCompleteDocumentTreeLifecycleDocument());
    const controller = getEditorNavigationForEditor(editor);
    const family = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.find(
      (candidate) => candidate.ownerNodeType === "flashcard",
    );
    if (!family) throw new Error("Expected activating Flashcard lifecycle family");
    const started = deferred<void>();
    const completion = deferred<void>();
    const dispatch = vi.fn();
    const focus = vi.fn();
    const createActivationTransaction = vi.fn((location: DocumentItemLocation) =>
      transactionForLocation(editor, location),
    );
    const bringIntoView = vi.fn(async () => undefined);
    controller.setEditor({ dispatch, focus });
    controller.setEnvironment({
      presentSurface: async () => undefined,
      createActivationTransaction,
      bringIntoView,
    });
    expect(
      getSemanticTargetInteractionEnvironmentForEditor(editor).registry.resolve(family.ownerId)
        .kind,
    ).toBe("unavailable");
    getSemanticTargetInteractionEnvironmentForEditor(editor).registry.register({
      ownerId: family.ownerId,
      async activate({ relationship }) {
        started.resolve(undefined);
        await completion.promise;
        return {
          kind: "revealed" as const,
          ownerId: family.ownerId,
          childId: relationship.childId,
        };
      },
    });

    const activation = controller.showTarget(family.memberIds.second, {
      origin: "document-outline",
      focusEditor: true,
    });
    await started.promise;
    editor.destroy();
    completion.resolve(undefined);

    await expect(activation).resolves.toEqual({
      kind: "interrupted",
      id: family.memberIds.second,
    });
    expect(createActivationTransaction).not.toHaveBeenCalled();
    expect(bringIntoView).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("atomically replaces the complete family matrix with current locations and selection", async () => {
    const editor = createLifecycleEditor(createCompleteDocumentTreeLifecycleDocument());
    const controller = getEditorNavigationForEditor(editor);
    const baseline = getDocumentTreeForEditor(editor).getSnapshot();
    const baselineNodes = new Map(
      APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.map((family) => [
        family.memberIds.first,
        requireDocumentTreeLifecycleNodeById(editor.state.doc, family.memberIds.first).node,
      ]),
    );
    const baselineLocations = new Map(
      APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.map((family) => [
        family.memberIds.first,
        baseline.locationById.get(family.memberIds.first),
      ]),
    );
    const movedFamily = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[0]!;
    const survivingId = movedFamily.memberIds.first;
    const deletedFamily = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[2]!;
    const deletedId = deletedFamily.memberIds.second;
    controller.reportComponentSelection(survivingId);
    const semanticsBeforeReplacement = getDocumentTreeForEditor(editor).getSnapshot();
    let publications = 0;
    const unsubscribe = getDocumentTreeForEditor(editor).subscribe(() => {
      publications += 1;
    });

    dispatchReplacement(editor, createReplacementDocument());

    const current = getDocumentTreeForEditor(editor).getSnapshot();
    expect(publications).toBe(1);
    expect(current).not.toBe(semanticsBeforeReplacement);
    expect(current.revision).toBe(1);
    expect(Object.isFrozen(current)).toBe(true);
    expect(controller.getSelectionSnapshot()).toMatchObject({
      selectedId: survivingId,
      selectionOrigin: "component",
    });
    expect(current.itemById.has(deletedId)).toBe(false);
    expect(current.parentById.has(deletedId)).toBe(false);
    expect(current.locationById.has(deletedId)).toBe(false);

    for (const family of APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES) {
      const memberId = family.memberIds.first;
      const currentNode = requireDocumentTreeLifecycleNodeById(editor.state.doc, memberId);
      const currentLocation = current.locationById.get(memberId);
      expect(current.itemById.get(memberId)).toMatchObject({
        id: memberId,
        nodeType: family.memberNodeType,
      });
      expect(current.parentById.get(memberId)).toBe(family.ownerId);
      expect(currentLocation).toMatchObject({
        id: memberId,
        from: currentNode.pos,
        to: currentNode.pos + currentNode.node.nodeSize,
        authoringAnchorId: family.ownerId,
      });
      expect(currentLocation?.from).not.toBe(baselineLocations.get(memberId)?.from);
      expect(currentLocation).not.toBe(baselineLocations.get(memberId));
      expect(currentNode.node).not.toBe(baselineNodes.get(memberId));
      expect(currentLocation?.activationPath).not.toBe(
        baselineLocations.get(memberId)?.activationPath,
      );
      if (ACTIVATING_BLOCK_MEMBER_OWNER_TYPES.has(family.ownerNodeType)) {
        expect(currentLocation?.activationPath).toEqual([
          { ownerId: family.ownerId, childId: memberId, ownerKind: "block" },
        ]);
      } else {
        expect(currentLocation?.activationPath).toEqual([]);
      }
    }
    const reorderedFamily = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[1]!;
    expect(current.itemById.get(reorderedFamily.ownerId)?.children.map(({ id }) => id)).toEqual([
      reorderedFamily.memberIds.second,
      reorderedFamily.memberIds.first,
    ]);

    const currentMovedOwnerLocation = current.locationById.get(movedFamily.ownerId);
    const bringIntoView = vi.fn(async () => undefined);
    const createActivationTransaction = vi.fn((location: DocumentItemLocation) =>
      transactionForLocation(editor, location),
    );
    const focus = vi.fn();
    controller.setEditor({
      dispatch: (transaction) => editor.view.dispatch(transaction),
      focus,
    });
    controller.setEnvironment({
      presentSurface: async () => undefined,
      bringIntoView,
      createActivationTransaction,
    });

    // Contract update: 062fb1ab gave the Annotated Figure — the family at index 0,
    // and so this test's moved family — an interactive control binding, making its
    // annotations reachable only through a mounted owner. With no activation
    // binding registered here, navigation resolves to the owner, which is exactly
    // what the bringIntoView assertions below already expect.
    await expect(
      controller.showTarget(survivingId, { origin: "document-outline" }),
    ).resolves.toEqual({
      kind: "reached-owner",
      requestedId: survivingId,
      ownerId: movedFamily.ownerId,
      reason: "owner-unmounted",
    });
    expect(bringIntoView).toHaveBeenCalledWith(currentMovedOwnerLocation, "smooth");
    expect(bringIntoView).not.toHaveBeenCalledWith(
      baseline.locationById.get(movedFamily.ownerId),
      "smooth",
    );
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(controller.getSelectionSnapshot()).toMatchObject({
      selectedId: survivingId,
      selectionOrigin: "document-outline",
    });
    expect(getDocumentTreeForEditor(editor).getSnapshot()).toBe(current);
    expect(focus).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("falls back on deletion and reconstructs fresh addressability through undo and redo", () => {
    const editor = createLifecycleEditor(createCompleteDocumentTreeLifecycleDocument());
    const controller = getEditorNavigationForEditor(editor);
    const deletedFamily = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[2]!;
    const deletedId = deletedFamily.memberIds.second;
    const baseline = getDocumentTreeForEditor(editor).getSnapshot();
    const baselineLocation = baseline.locationById.get(deletedId);
    controller.reportComponentSelection(deletedId);
    let publications = 0;
    const unsubscribe = getDocumentTreeForEditor(editor).subscribe(() => {
      publications += 1;
    });

    dispatchReplacement(editor, createReplacementDocument());
    const replaced = getDocumentTreeForEditor(editor).getSnapshot();
    expect(publications).toBe(1);
    expect(replaced.revision).toBe(1);
    expect(controller.getSelectionSnapshot().selectedId).toBe(deletedFamily.ownerId);
    expect(replaced.itemById.has(deletedId)).toBe(false);

    expect(editor.commands.undo()).toBe(true);
    const undone = getDocumentTreeForEditor(editor).getSnapshot();
    const restoredNode = requireDocumentTreeLifecycleNodeById(editor.state.doc, deletedId);
    expect(publications).toBe(2);
    expect(undone.revision).toBe(2);
    expect(undone).not.toBe(baseline);
    expect(undone).not.toBe(replaced);
    expect(undone.itemById.has(deletedId)).toBe(true);
    expect(undone.parentById.get(deletedId)).toBe(deletedFamily.ownerId);
    expect(undone.locationById.get(deletedId)).toMatchObject({
      from: restoredNode.pos,
      to: restoredNode.pos + restoredNode.node.nodeSize,
    });
    expect(undone.locationById.get(deletedId)).not.toBe(baselineLocation);
    const undoneSelection = controller.getSelectionSnapshot().selectedId;
    expect(undoneSelection).not.toBeNull();
    expect(undone.itemById.has(undoneSelection!)).toBe(true);

    expect(editor.commands.redo()).toBe(true);
    const redone = getDocumentTreeForEditor(editor).getSnapshot();
    expect(publications).toBe(3);
    expect(redone.revision).toBe(3);
    expect(redone).not.toBe(replaced);
    expect(redone).not.toBe(undone);
    expect(redone.itemById.has(deletedId)).toBe(false);
    expect(redone.parentById.has(deletedId)).toBe(false);
    expect(redone.locationById.has(deletedId)).toBe(false);
    const redoneSelection = controller.getSelectionSnapshot().selectedId;
    expect(redoneSelection).not.toBeNull();
    expect(redone.itemById.has(redoneSelection!)).toBe(true);
    unsubscribe();
  });

  it("reuses the document tree snapshot for selection and presentation/activity-only work", () => {
    const editor = createLifecycleEditor(createCompleteDocumentTreeLifecycleDocument());
    const semantics = getDocumentTreeForEditor(editor).getSnapshot();
    const catalogue = getControlCapabilityCatalogueForEditor(editor);
    let replacements = 0;
    let previousSemantics = semantics;
    const unsubscribe = getDocumentTreeForEditor(editor).subscribe(() => {
      const current = getDocumentTreeForEditor(editor).getSnapshot();
      if (current === previousSemantics) return;
      previousSemantics = current;
      replacements += 1;
    });
    const targetId = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[1]!.memberIds.first;
    const targetLocation = semantics.locationById.get(targetId);
    if (!targetLocation) throw new Error(`Expected lifecycle target ${targetId}.`);

    editor.view.dispatch(transactionForLocation(editor, targetLocation));
    expect(getDocumentTreeForEditor(editor).getSnapshot()).toBe(semantics);
    expect(getControlCapabilityCatalogueForEditor(editor)).toBe(catalogue);
    expect(replacements).toBe(0);

    editor.view.dispatch(editor.state.tr.setMeta("presentation-activity", { active: true }));
    expect(getDocumentTreeForEditor(editor).getSnapshot()).toBe(semantics);
    expect(getControlCapabilityCatalogueForEditor(editor)).toBe(catalogue);
    expect(replacements).toBe(0);
    unsubscribe();
  });

  it("replaces the current catalogue with a document tree revision and drops deleted targets", () => {
    const editor = createLifecycleEditor(createCompleteDocumentTreeLifecycleDocument());
    const deletedTarget = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[2]!.memberIds.second;
    const initial = getControlCapabilityCatalogueForEditor(editor);
    const initialResolution = initial.resolve(deletedTarget);
    // Contract update: 062fb1ab gave interactive Blocks control bindings, so a
    // Gallery item is no longer a passive target with no declared capabilities —
    // it resolves against its owning Gallery. The point of this test is that the
    // target is live *before* the replacement and dropped after it.
    expect(initialResolution.isOk()).toBe(true);
    if (initialResolution.isErr()) throw new Error("Expected a resolvable target.");
    expect(initialResolution.value).toMatchObject({
      targetId: deletedTarget,
      ownerId: APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[2]!.ownerId,
    });

    dispatchReplacement(editor, createReplacementDocument());

    const replaced = getControlCapabilityCatalogueForEditor(editor);
    const replacedResolution = replaced.resolve(deletedTarget);
    expect(replaced).not.toBe(initial);
    expect(replacedResolution.isErr()).toBe(true);
    if (replacedResolution.isOk()) throw new Error("Expected a deleted target resolution.");
    expect(replacedResolution.error).toEqual({
      reason: "target-not-public",
      targetId: deletedTarget,
    });
    expect(getControlCapabilityCatalogueForEditor(editor)).toBe(replaced);
  });
});

function createLifecycleEditor(doc: ProseMirrorNode): Editor {
  const editor = new Editor({
    editable: true,
    extensions: DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE.extensions,
    content: doc.toJSON(),
  });
  editors.push(editor);
  return editor;
}

function createReplacementDocument(): ProseMirrorNode {
  const [moved, ...remaining] = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES;
  if (!moved) throw new Error("Expected the approved lifecycle family matrix.");
  return createDocumentTreeLifecycleDocument([
    ...remaining.map((family) => {
      if (family.key === "flashcard-cards") return family.createOwner(["second", "first"]);
      if (family.key === "gallery-items") return family.createOwner(["first"]);
      return family.createOwner();
    }),
    moved.createOwner(),
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
    throw new Error(`Invalid replacement transaction: ${JSON.stringify(transaction.doc.toJSON())}`);
  }
  editor.view.dispatch(transaction);
}

function transactionForLocation(editor: Editor, location: DocumentItemLocation) {
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
