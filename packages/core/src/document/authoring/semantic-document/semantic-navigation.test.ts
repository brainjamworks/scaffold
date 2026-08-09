import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  SemanticChildProjectionInput,
  SemanticDefinitionLookup,
} from "@/document/model/semantic-document";
import { createRepresentativeSemanticDocumentFixture } from "@/document/model/semantic-document/testing/semantic-document-fixtures";

import { SemanticContainerAdapterRegistry } from "./semantic-container-adapter-registry";
import { SemanticDocumentController } from "./semantic-document-controller";
import type {
  SemanticNavigationEditor,
  SemanticNavigationEnvironment,
} from "./semantic-navigation";

describe("SemanticContainerAdapterRegistry", () => {
  it("replaces deterministically and only unregisters the matching mounted adapter", () => {
    const registry = new SemanticContainerAdapterRegistry();
    const ownerId = makeSession().fixture.surfaces[0]!.ownerBlock;
    const first = adapter(ownerId, () => "revealed");
    const second = adapter(ownerId, () => "already-visible");

    const unregisterFirst = registry.register(first);
    const unregisterSecond = registry.register(second);

    expect(registry.get(ownerId)).toBe(second);
    unregisterFirst();
    expect(registry.get(ownerId)).toBe(second);
    unregisterSecond();
    expect(registry.get(ownerId)).toBeUndefined();
  });
});

describe("semantic navigation", () => {
  it("reaches a current target through outer-to-inner adapters without focusing the editor", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const activationPath = requireLocation(session.controller, targetId).activationPath;
    const revealOrder: string[] = [];
    for (const relationship of activationPath) {
      session.controller.containerAdapters.register(
        adapter(relationship.ownerId, (childId) => {
          revealOrder.push(`${relationship.ownerId}:${childId}`);
          return "revealed";
        }),
      );
    }

    const result = await session.controller.select(targetId, { origin: "document-outline" });

    expect(result).toEqual({ kind: "reached", id: targetId });
    expect(revealOrder).toEqual(
      activationPath.map(({ ownerId, childId }) => `${ownerId}:${childId}`),
    );
    expect(session.presentSurface).toHaveBeenCalledWith(session.fixture.surfaces[0]!.surface);
    expect(session.bringIntoView).toHaveBeenCalledOnce();
    expect(session.focusEditor).not.toHaveBeenCalled();
    expect(session.controller.getSnapshot()).toMatchObject({
      selectedId: targetId,
      selectionOrigin: "document-outline",
    });
  });

  it("returns missing without using stale locations", async () => {
    const session = makeSession();
    const missingId = session.fixture.surfaces[0]!.privateAssessmentParagraph;

    await expect(
      session.controller.select(missingId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "missing", id: missingId });
    expect(session.presentSurface).not.toHaveBeenCalled();
    expect(session.bringIntoView).not.toHaveBeenCalled();
  });

  it("degrades to the nearest reachable owner for missing, unavailable and throwing adapters", async () => {
    const targetKinds = ["missing", "unavailable", "throwing"] as const;

    for (const targetKind of targetKinds) {
      const session = makeSession();
      const targetId = session.fixture.surfaces[0]!.publishedParagraph;
      const [firstRelationship] = requireLocation(session.controller, targetId).activationPath;
      if (!firstRelationship) throw new Error("expected an activation relationship");

      if (targetKind === "unavailable") {
        session.controller.containerAdapters.register(
          adapter(firstRelationship.ownerId, () => "child-unavailable"),
        );
      } else if (targetKind === "throwing") {
        session.controller.containerAdapters.register(
          adapter(firstRelationship.ownerId, () => {
            throw new Error("adapter failed");
          }),
        );
      }

      await expect(
        session.controller.select(targetId, { origin: "document-outline" }),
      ).resolves.toEqual({
        kind: "reached-owner",
        requestedId: targetId,
        ownerId: firstRelationship.ownerId,
        reason: targetKind === "missing" ? "missing-container-adapter" : "child-unavailable",
      });
      expect(session.controller.getSnapshot().selectedId).toBe(firstRelationship.ownerId);
    }
  });

  it("interrupts stale requests before they can apply selection or scroll effects", async () => {
    const session = makeSession();
    const staleTargetId = session.fixture.surfaces[0]!.publishedParagraph;
    const currentTargetId = session.fixture.surfaces[0]!.surface;
    const [firstRelationship] = requireLocation(session.controller, staleTargetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    const started = deferred<void>();
    const waiting = deferred<"revealed">();
    session.controller.containerAdapters.register(
      adapter(firstRelationship.ownerId, () => {
        started.resolve(undefined);
        return waiting.promise;
      }),
    );

    const staleRequest = session.controller.select(staleTargetId, {
      origin: "document-outline",
    });
    await started.promise;
    await expect(
      session.controller.select(currentTargetId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "reached", id: currentTargetId });
    waiting.resolve("revealed");

    await expect(staleRequest).resolves.toEqual({ kind: "interrupted", id: staleTargetId });
    expect(session.controller.getSnapshot().selectedId).toBe(currentTargetId);
    expect(session.bringIntoView).toHaveBeenCalledOnce();
  });

  it("re-resolves the target after an awaited activation when the document changes", async () => {
    const session = makeSession();
    const targetId = session.fixture.surfaces[0]!.publishedParagraph;
    const [firstRelationship] = requireLocation(session.controller, targetId).activationPath;
    if (!firstRelationship) throw new Error("expected an activation relationship");
    const started = deferred<void>();
    const waiting = deferred<"revealed">();
    session.controller.containerAdapters.register(
      adapter(firstRelationship.ownerId, () => {
        started.resolve(undefined);
        return waiting.promise;
      }),
    );

    const request = session.controller.select(targetId, { origin: "document-outline" });
    await started.promise;
    session.dispatch(deleteNodeTransaction(session.state(), targetId));
    waiting.resolve("revealed");

    await expect(request).resolves.toEqual({ kind: "missing", id: targetId });
    expect(session.bringIntoView).not.toHaveBeenCalled();
  });

  it("presents a Course Section through its current first Surface mapping", async () => {
    const session = makeSession("sectioned-slideshow");
    const sectionId = session.fixture.courseSectionId;
    if (!sectionId) throw new Error("expected Course Section");

    await expect(
      session.controller.select(sectionId, {
        origin: "presentation-timeline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "reached", id: sectionId });
    expect(session.presentSurface).toHaveBeenCalledWith(session.fixture.surfaces[0]!.surface);
    expect(session.focusEditor).toHaveBeenCalledOnce();
  });
});

function makeSession(
  kind: "page" | "sectioned-slideshow" = "page",
): ReturnType<typeof createSession> {
  const fixture = createRepresentativeSemanticDocumentFixture({ kind });
  return createSession(fixture);
}

function createSession(fixture: ReturnType<typeof createRepresentativeSemanticDocumentFixture>) {
  let state = EditorState.create({ doc: fixture.doc });
  let controller: SemanticDocumentController;
  const focusEditor = vi.fn();
  const navigationEditor: SemanticNavigationEditor = {
    getState: () => state,
    dispatch: (transaction) => {
      state = state.apply(transaction);
      controller.applyTransaction(transaction, state);
    },
    focus: focusEditor,
  };
  const presentSurface = vi.fn(async () => undefined);
  const bringIntoView = vi.fn(async () => undefined);
  const environment: SemanticNavigationEnvironment = { presentSurface, bringIntoView };
  controller = new SemanticDocumentController({
    state,
    definitions: navigationDefinitions(fixture),
    navigationEditor,
  });
  controller.setNavigationEnvironment(environment);

  return {
    fixture,
    controller,
    environment,
    presentSurface,
    bringIntoView,
    focusEditor,
    state: () => state,
    dispatch: (transaction: Transaction) => navigationEditor.dispatch(transaction),
  };
}

function navigationDefinitions(
  fixture: ReturnType<typeof createRepresentativeSemanticDocumentFixture>,
): SemanticDefinitionLookup {
  const base = fixture.definitions;
  return {
    blocks: {
      get: (nodeType) => {
        const definition = base.blocks.get(nodeType);
        const projectChildren = definition?.documentSemantics?.projectChildren;
        if (nodeType !== "owner_block" || !definition || !projectChildren) return definition;
        return {
          ...definition,
          documentSemantics: {
            ...definition.documentSemantics,
            projectChildren: (input: SemanticChildProjectionInput) => {
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
          documentSemantics: {
            ...definition.documentSemantics,
            projectChildren: (input: SemanticChildProjectionInput) => {
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

function adapter(
  ownerId: EmbeddedNodeId,
  reveal: (
    childId: EmbeddedNodeId,
  ) =>
    | "revealed"
    | "already-visible"
    | "suppressed-by-user"
    | "child-unavailable"
    | Promise<"revealed" | "already-visible" | "suppressed-by-user" | "child-unavailable">,
) {
  return { ownerId, reveal: (childId: EmbeddedNodeId) => reveal(childId) };
}

function requireLocation(controller: SemanticDocumentController, id: EmbeddedNodeId) {
  const location = controller.getSnapshot().semantics.locationById.get(id);
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
