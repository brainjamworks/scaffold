import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  DocumentTreeChildrenInput,
  DocumentTreeDefinitionLookup,
} from "@/document/model/document-tree";
import { createRepresentativeDocumentTreeFixture } from "@/document/model/document-tree/testing/document-tree-fixtures";
import type {
  SemanticActivationOutcome,
  SemanticActivationRequest,
} from "@/document/semantic-target-interaction";

import {
  createDocumentAuthoringLifecycle,
  type DocumentAuthoringLifecycle,
} from "../document-authoring-lifecycle";
import {
  EditorNavigationCoordinator,
  type EditorNavigationEditor,
  type EditorNavigationEnvironment,
  type EditorNavigationResult,
} from "./editor-navigation";

describe("editor navigation", () => {
  it("delegates reachability exactly once before applying authoring effects", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.surface;
    const order: string[] = [];
    const activate = vi.fn(async () => {
      order.push("activation");
      return { kind: "reached" as const, requestedId: targetId };
    });
    const coordinator = new EditorNavigationCoordinator({
      targetInteractions: { activate },
      getDocumentTree: () => session.documentTree.getSnapshot(),
      getCourseStructure: () => session.fixture.courseStructure,
      editor: {
        dispatch: () => order.push("dispatch"),
        focus: () => order.push("focus"),
      },
      environment: {
        presentSurface: async () => {
          order.push("unexpected-surface");
        },
        createActivationTransaction: (location) => {
          order.push("transaction");
          return session.createActivationTransaction(location);
        },
        bringIntoView: async () => {
          order.push("scroll");
        },
      },
    });

    const result: EditorNavigationResult = await coordinator.showTarget(targetId, {
      origin: "document-outline",
      focusEditor: true,
    });

    expect(result).toEqual({ kind: "reached", id: targetId });
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(targetId, {
      origin: "document-outline",
      signal: expect.any(AbortSignal),
    });
    expect(order).toEqual([
      "activation",
      "transaction",
      "scroll",
      "transaction",
      "dispatch",
      "focus",
    ]);
  });

  it("reaches a current target through outer-to-inner bindings without focusing the editor", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const activationPath = requireLocation(session.documentTree, targetId).activationPath;
    const activationOrder: string[] = [];
    const activationRequests: SemanticActivationRequest[] = [];
    for (const relationship of activationPath) {
      session.targetInteractions.registry.register({
        ownerId: relationship.ownerId,
        activate: async (request) => {
          activationRequests.push(request);
          activationOrder.push(`${relationship.ownerId}:${request.relationship.childId}`);
          return revealedOutcome(relationship.ownerId, request.relationship.childId);
        },
      });
    }

    const result = await session.controller.showTarget(targetId, { origin: "document-outline" });

    expect(result).toEqual({ kind: "reached", id: targetId });
    expect(activationOrder).toEqual(
      activationPath.map(({ ownerId, childId }) => `${ownerId}:${childId}`),
    );
    expect(new Set(activationRequests.map(({ causationId }) => causationId)).size).toBe(1);
    expect(activationRequests[0]?.causationId).toMatch(/^semantic-target-interaction:/);
    expect(session.presentSurface).toHaveBeenCalledWith(session.fixture.surfaces[0]!.surface);
    expect(session.createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(session.bringIntoView).toHaveBeenCalledOnce();
    expect(session.focusEditor).not.toHaveBeenCalled();
    expect(session.controller.getSelectionSnapshot()).toMatchObject({
      selectedId: targetId,
      selectionOrigin: "document-outline",
    });
  });

  it("returns missing without using stale locations", async () => {
    const session = makeSession();
    const missingId = session.fixture.surfaces[0]!.privateAssessmentParagraph;

    await expect(
      session.controller.showTarget(missingId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "missing", id: missingId });
    expect(session.presentSurface).not.toHaveBeenCalled();
    expect(session.bringIntoView).not.toHaveBeenCalled();
  });

  it("keeps Surface presentation defects observable without authoring effects", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.surface;
    const beforeSelection = session.state().selection.toJSON();
    const beforeSnapshot = session.controller.getSelectionSnapshot();
    session.presentSurface.mockRejectedValueOnce(new Error("presentation failed"));

    await expect(
      session.controller.showTarget(targetId, {
        origin: "document-outline",
        focusEditor: true,
      }),
    ).rejects.toThrow("presentation failed");
    expect(session.state().selection.toJSON()).toEqual(beforeSelection);
    expect(session.controller.getSelectionSnapshot()).toMatchObject({
      selectedId: beforeSnapshot.selectedId,
      selectionOrigin: beforeSnapshot.selectionOrigin,
    });
    expect(session.bringIntoView).not.toHaveBeenCalled();
    expect(session.focusEditor).not.toHaveBeenCalled();
  });

  it("leaves editor, semantic and focus state unchanged when scrolling throws", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.surface;
    const beforeSelection = session.state().selection.toJSON();
    const beforeSnapshot = session.controller.getSelectionSnapshot();
    session.bringIntoView.mockRejectedValueOnce(new Error("scroll failed"));

    await expect(
      session.controller.showTarget(targetId, {
        origin: "document-outline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "interrupted", id: targetId });
    expect(session.state().selection.toJSON()).toEqual(beforeSelection);
    expect(session.controller.getSelectionSnapshot()).toMatchObject({
      selectedId: beforeSnapshot.selectedId,
      selectionOrigin: beforeSnapshot.selectionOrigin,
    });
    expect(session.focusEditor).not.toHaveBeenCalled();
  });

  it("degrades to the nearest reachable owner for unavailable and refused activation", async () => {
    const targetKinds = ["missing", "unavailable", "refused"] as const;

    for (const targetKind of targetKinds) {
      const session = makeSession();
      const targetId = session.fixture.surfaces[0]!.publishedParagraph;
      const [firstRelationship] = requireLocation(session.documentTree, targetId).activationPath;
      if (!firstRelationship) throw new Error("expected an activation relationship");

      if (targetKind === "unavailable") {
        session.targetInteractions.registry.register(
          binding(firstRelationship.ownerId, (childId) => ({
            kind: "unavailable",
            ownerId: firstRelationship.ownerId,
            childId,
            reason: "child-missing",
          })),
        );
      } else if (targetKind === "refused") {
        session.targetInteractions.registry.register(
          binding(firstRelationship.ownerId, (childId) => ({
            kind: "refused",
            ownerId: firstRelationship.ownerId,
            childId,
            reason: "authority-boundary",
          })),
        );
      }

      await expect(
        session.controller.showTarget(targetId, { origin: "document-outline" }),
      ).resolves.toEqual({
        kind: "reached-owner",
        requestedId: targetId,
        ownerId: firstRelationship.ownerId,
        reason:
          targetKind === "missing"
            ? "owner-unmounted"
            : targetKind === "unavailable"
              ? "child-missing"
              : "authority-boundary",
      });
      expect(session.controller.getSelectionSnapshot().selectedId).toBe(targetId);
    }
  });

  it("keeps activation binding defects observable", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const [firstRelationship] = requireLocation(session.documentTree, targetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    session.targetInteractions.registry.register({
      ownerId: firstRelationship.ownerId,
      activate: () => {
        throw new Error("binding failed");
      },
    });

    await expect(
      session.controller.showTarget(targetId, { origin: "document-outline" }),
    ).rejects.toThrow("binding failed");
  });

  it("interrupts stale requests before they can apply selection or scroll effects", async () => {
    const session = makeSession();
    const staleTargetId = session.fixture.surfaces[0]!.publishedParagraph;
    const currentTargetId = session.fixture.surfaces[0]!.surface;
    const [firstRelationship] = requireLocation(session.documentTree, staleTargetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    const started = deferred<void>();
    session.targetInteractions.registry.register({
      ownerId: firstRelationship.ownerId,
      activate: ({ relationship, signal }) =>
        new Promise((resolve) => {
          started.resolve(undefined);
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                kind: "interrupted",
                ownerId: firstRelationship.ownerId,
                childId: relationship.childId,
              }),
            { once: true },
          );
        }),
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
    expect(session.bringIntoView).toHaveBeenCalledOnce();
  });

  it("lets component selection interrupt shared activation before authoring effects", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const componentTargetId = session.fixture.surfaces[0]!.surface;
    const [firstRelationship] = requireLocation(session.documentTree, targetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    const started = deferred<void>();
    session.targetInteractions.registry.register({
      ownerId: firstRelationship.ownerId,
      activate: ({ relationship, signal }) =>
        new Promise((resolve) => {
          started.resolve(undefined);
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                kind: "interrupted",
                ownerId: firstRelationship.ownerId,
                childId: relationship.childId,
              }),
            { once: true },
          );
        }),
    });

    const request = session.controller.showTarget(targetId, { origin: "document-outline" });
    await started.promise;
    session.controller.reportComponentSelection(componentTargetId);

    await expect(request).resolves.toEqual({ kind: "interrupted", id: targetId });
    expect(session.controller.getSelectionSnapshot()).toMatchObject({
      selectedId: componentTargetId,
      selectionOrigin: "component",
    });
    expect(session.createActivationTransaction).not.toHaveBeenCalled();
    expect(session.bringIntoView).not.toHaveBeenCalled();
    expect(session.focusEditor).not.toHaveBeenCalled();
  });

  it("interrupts shared activation on controller destruction without authoring effects", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const [firstRelationship] = requireLocation(session.documentTree, targetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    const started = deferred<void>();
    session.targetInteractions.registry.register({
      ownerId: firstRelationship.ownerId,
      activate: ({ relationship, signal }) =>
        new Promise((resolve) => {
          started.resolve(undefined);
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                kind: "interrupted",
                ownerId: firstRelationship.ownerId,
                childId: relationship.childId,
              }),
            { once: true },
          );
        }),
    });

    const request = session.controller.showTarget(targetId, { origin: "document-outline" });
    await started.promise;
    session.controller.dispose();

    await expect(request).resolves.toEqual({ kind: "interrupted", id: targetId });
    expect(session.createActivationTransaction).not.toHaveBeenCalled();
    expect(session.bringIntoView).not.toHaveBeenCalled();
    expect(session.focusEditor).not.toHaveBeenCalled();
  });

  it("suppresses stale dispatch and focus after awaited viewport movement", async () => {
    const session = makeSession();
    const staleTargetId = session.fixture.surfaces[0]!.surface;
    const currentTargetId = session.fixture.surfaces[0]!.publishedParagraph;
    for (const relationship of requireLocation(session.documentTree, currentTargetId)
      .activationPath) {
      session.targetInteractions.registry.register(
        binding(relationship.ownerId, (childId) => revealedOutcome(relationship.ownerId, childId)),
      );
    }
    const viewportStarted = deferred<void>();
    const viewportWaiting = deferred<void>();
    session.bringIntoView.mockImplementationOnce(async () => {
      viewportStarted.resolve(undefined);
      await viewportWaiting.promise;
    });

    const staleRequest = session.controller.showTarget(staleTargetId, {
      origin: "document-outline",
      focusEditor: true,
    });
    await viewportStarted.promise;
    await expect(
      session.controller.showTarget(currentTargetId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "reached", id: currentTargetId });
    viewportWaiting.resolve(undefined);

    await expect(staleRequest).resolves.toEqual({ kind: "interrupted", id: staleTargetId });
    expect(session.controller.getSelectionSnapshot().selectedId).toBe(currentTargetId);
    expect(session.focusEditor).not.toHaveBeenCalled();
  });

  it("suppresses authoring effects when external cancellation occurs during viewport movement", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.surface;
    const cancellation = new AbortController();
    const viewportStarted = deferred<void>();
    const viewportWaiting = deferred<void>();
    session.bringIntoView.mockImplementationOnce(async () => {
      viewportStarted.resolve(undefined);
      await viewportWaiting.promise;
    });
    const options = {
      origin: "document-outline" as const,
      focusEditor: true,
      signal: cancellation.signal,
    };

    const request = session.controller.showTarget(targetId, options);
    await viewportStarted.promise;
    cancellation.abort();
    viewportWaiting.resolve(undefined);

    await expect(request).resolves.toEqual({ kind: "interrupted", id: targetId });
    expect(session.controller.getSelectionSnapshot().selectedId).not.toBe(targetId);
    expect(session.focusEditor).not.toHaveBeenCalled();
  });

  it("re-resolves the target after an awaited activation when the document changes", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const [firstRelationship] = requireLocation(session.documentTree, targetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    const started = deferred<void>();
    const waiting = deferred<ReturnType<typeof revealedOutcome>>();
    session.targetInteractions.registry.register(
      binding(firstRelationship.ownerId, () => {
        started.resolve(undefined);
        return waiting.promise;
      }),
    );

    const request = session.controller.showTarget(targetId, { origin: "document-outline" });
    await started.promise;
    session.dispatch(deleteNodeTransaction(session.state(), targetId));
    waiting.resolve(revealedOutcome(firstRelationship.ownerId, firstRelationship.childId));

    await expect(request).resolves.toEqual({ kind: "missing", id: targetId });
    expect(session.bringIntoView).not.toHaveBeenCalled();
  });

  it("presents a Course Section through its current first Surface mapping", async () => {
    const session = makeSession("slideshow");
    const sectionId = session.fixture.courseSectionId;
    if (!sectionId) throw new Error("expected Course Section");

    await expect(
      session.controller.showTarget(sectionId, {
        origin: "presentation-timeline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "reached", id: sectionId });
    expect(session.presentSurface).toHaveBeenCalledWith(session.fixture.surfaces[0]!.surface);
    expect(session.bringIntoView).toHaveBeenCalledWith(
      requireLocation(session.documentTree, session.fixture.surfaces[0]!.surface),
      "smooth",
    );
    expect(session.focusEditor).toHaveBeenCalledOnce();
  });
});

function makeSession(kind: "page" | "slideshow" = "page"): ReturnType<typeof createSession> {
  const fixture = createRepresentativeDocumentTreeFixture({ kind });
  return createSession(fixture);
}

function createSession(fixture: ReturnType<typeof createRepresentativeDocumentTreeFixture>) {
  let state = EditorState.create({ doc: fixture.doc });
  let lifecycle: DocumentAuthoringLifecycle;
  const focusEditor = vi.fn();
  const navigationEditor: EditorNavigationEditor = {
    dispatch: (transaction) => {
      state = state.apply(transaction);
      lifecycle.applyTransaction(transaction, state);
    },
    focus: focusEditor,
  };
  const presentSurface = vi.fn(async () => undefined);
  const bringIntoView = vi.fn(async () => undefined);
  const createActivationTransaction = vi.fn((location) => {
    const tr = state.tr;
    switch (location.selectionTarget.kind) {
      case "node":
        tr.setSelection(NodeSelection.create(tr.doc, location.selectionTarget.pos));
        break;
      case "text":
        tr.setSelection(
          TextSelection.create(tr.doc, location.selectionTarget.from, location.selectionTarget.to),
        );
        break;
      case "near":
        tr.setSelection(TextSelection.near(tr.doc.resolve(location.selectionTarget.pos)));
        break;
    }
    return tr;
  });
  const environment: EditorNavigationEnvironment = {
    presentSurface,
    bringIntoView,
    createActivationTransaction,
  };
  lifecycle = createDocumentAuthoringLifecycle(state, navigationDefinitions(fixture));
  const controller = lifecycle.editorNavigation;
  controller.setEditor(navigationEditor);
  controller.setEnvironment(environment);

  return {
    fixture,
    controller,
    documentTree: lifecycle.documentTree,
    targetInteractions: lifecycle.targetInteractions,
    environment,
    presentSurface,
    bringIntoView,
    createActivationTransaction,
    focusEditor,
    state: () => state,
    dispatch: (transaction: Transaction) => navigationEditor.dispatch(transaction),
  };
}

function navigationDefinitions(
  fixture: ReturnType<typeof createRepresentativeDocumentTreeFixture>,
): DocumentTreeDefinitionLookup {
  const base = fixture.definitions;
  return {
    blocks: {
      get: (nodeType) => {
        const definition = base.blocks.get(nodeType);
        const projectChildren = definition?.documentTree?.projectChildren;
        if (nodeType !== "owner_block" || !definition || !projectChildren) return definition;
        return {
          ...definition,
          documentTree: {
            ...definition.documentTree,
            projectChildren: (input: DocumentTreeChildrenInput) => {
              const ids = fixture.surfaces.find(({ ownerBlock }) => ownerBlock === input.ownerId);
              return projectChildren(input).map((candidate) =>
                ids &&
                input.owner.nodeAt(candidate.relativePos)?.attrs["id"] === ids.publishedParagraph
                  ? {
                      ...candidate,
                      activation: [
                        {
                          ownerId: ids.ownerBlock,
                          childId: ids.publishedContainer,
                          ownerKind: "block" as const,
                        },
                      ],
                    }
                  : candidate,
              );
            },
          },
        };
      },
    },
    layouts: {
      get: (variant) => {
        const definition = base.layouts.get(variant);
        if (variant !== "fixture-layout" || !definition) return definition;
        return {
          ...definition,
          documentTree: {
            ...definition.documentTree,
            projectChildren: (input: DocumentTreeChildrenInput) => {
              const ids = fixture.surfaces.find(({ layout }) => layout === input.ownerId);
              return input.helpers.projectStructuralChildren().map((candidate) =>
                ids && input.owner.nodeAt(candidate.relativePos)?.attrs["id"] === ids.layoutSection
                  ? {
                      ...candidate,
                      activation: [
                        {
                          ownerId: ids.layout,
                          childId: ids.layoutSection,
                          ownerKind: "layout" as const,
                        },
                      ],
                    }
                  : candidate,
              );
            },
          },
        };
      },
    },
    surfaces: base.surfaces,
  };
}

function binding(
  ownerId: EmbeddedNodeId,
  activate: (
    childId: EmbeddedNodeId,
  ) => SemanticActivationOutcome | Promise<SemanticActivationOutcome>,
) {
  return {
    ownerId,
    activate: async ({ relationship }: { relationship: { childId: EmbeddedNodeId } }) =>
      await activate(relationship.childId),
  };
}

function revealedOutcome(ownerId: EmbeddedNodeId, childId: EmbeddedNodeId) {
  return { kind: "revealed" as const, ownerId, childId };
}

function requireLocation(
  documentTree: DocumentAuthoringLifecycle["documentTree"],
  id: EmbeddedNodeId,
) {
  const location = documentTree.getSnapshot().locationById.get(id);
  if (!location) throw new Error(`expected semantic location "${id}"`);
  return location;
}

function deleteNodeTransaction(state: EditorState, id: EmbeddedNodeId): Transaction {
  const position = findPosition(state.doc, id);
  const node = state.doc.nodeAt(position);
  if (!node) throw new Error(`expected node "${id}"`);
  return state.tr.delete(position, position + node.nodeSize);
}

function findPosition(doc: ProseMirrorNode, id: EmbeddedNodeId): number {
  let found: number | null = null;
  doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`expected node "${id}"`);
  return found;
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
