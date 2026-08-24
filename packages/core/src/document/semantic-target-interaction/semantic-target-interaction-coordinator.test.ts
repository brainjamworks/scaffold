import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  SemanticActivationRelationship,
  SemanticDocumentSnapshot,
} from "@/document/model/semantic-document";
import { createRepresentativeSemanticDocumentFixture } from "@/document/model/semantic-document/testing/semantic-document-fixtures";
import { projectSemanticDocument } from "@/document/model/semantic-document";

import { createSemanticActivationRegistry } from "./semantic-activation-registry";
import { createSemanticTargetInteractionCoordinator } from "./semantic-target-interaction-coordinator";

describe("SemanticTargetInteractionCoordinator", () => {
  it("presents the current Surface before activating current owners outer-to-inner with one request context", async () => {
    const fixture = createRepresentativeSemanticDocumentFixture({ kind: "page" });
    const projected = projectSemanticDocument({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 1,
    });
    const targetId = fixture.surfaces[0]!.publishedParagraph;
    const ids = fixture.surfaces[0]!;
    const projectedLocation = projected.locationById.get(targetId);
    if (!projectedLocation) throw new Error("expected published target location");
    const locationById = new Map(projected.locationById);
    locationById.set(targetId, {
      ...projectedLocation,
      activationPath: [
        { ownerId: ids.layout, childId: ids.layoutSection, ownerKind: "layout" },
        { ownerId: ids.ownerBlock, childId: ids.publishedContainer, ownerKind: "block" },
      ],
    });
    const semantics = { ...projected, locationById };
    const location = semantics.locationById.get(targetId);
    if (!location) throw new Error("expected published target location");
    expect(location.activationPath).toHaveLength(2);

    const order: string[] = [];
    const requests: Array<{
      readonly causationId: string;
      readonly origin: string;
      readonly signal: AbortSignal;
    }> = [];
    const registry = createSemanticActivationRegistry();
    for (const relationship of location.activationPath) {
      registry.register({
        ownerId: relationship.ownerId,
        async activate(request) {
          order.push(`${relationship.ownerKind}:${relationship.ownerId}`);
          requests.push(request);
          return {
            kind: "revealed",
            ownerId: relationship.ownerId,
            childId: relationship.childId,
          };
        },
      });
    }
    const presentSurface = vi.fn(async (_surfaceId: EmbeddedNodeId, _signal: AbortSignal) => {
      order.push("surface");
    });
    const coordinator = createSemanticTargetInteractionCoordinator({
      registry,
      getSemantics: () => semantics,
      getCourseStructure: () => fixture.courseStructure,
      surfacePresentation: { presentSurface },
    });

    await expect(
      coordinator.activate(targetId, { origin: "configured-presentation" }),
    ).resolves.toEqual({ kind: "reached", requestedId: targetId });

    expect(order).toEqual([
      "surface",
      ...location.activationPath.map(({ ownerId, ownerKind }) => `${ownerKind}:${ownerId}`),
    ]);
    expect(presentSurface).toHaveBeenCalledWith(location.surfaceId, requests[0]!.signal);
    expect(requests.map(({ origin }) => origin)).toEqual([
      "configured-presentation",
      "configured-presentation",
    ]);
    expect(new Set(requests.map(({ causationId }) => causationId)).size).toBe(1);
    expect(
      new Set(requests.map(({ signal }) => signal).concat([presentSurface.mock.calls[0]![1]])),
    ).toHaveLength(1);
  });

  it("returns reached for an anchor-only target without resolving a binding", async () => {
    const harness = createHarness();
    const resolve = vi.spyOn(harness.registry, "resolve");

    await expect(
      harness.coordinator.activate(harness.surfaceId, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "reached", requestedId: harness.surfaceId });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns missing-target from the latest snapshot", async () => {
    const harness = createHarness();
    const missingId = EmbeddedNodeIdSchema.parse("missing00001");

    await expect(
      harness.coordinator.activate(missingId, { origin: "author-preview" }),
    ).resolves.toEqual({ kind: "missing-target", requestedId: missingId });
    expect(harness.presentSurface).not.toHaveBeenCalled();
  });

  it.each([
    ["owner-unmounted", "registry"],
    ["child-missing", "binding"],
    ["temporarily-unavailable", "binding"],
  ] as const)("preserves unavailable reason %s from the %s", async (reason, source) => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    if (source === "binding") {
      harness.registry.register({
        ownerId: relationship.ownerId,
        activate: async () => ({
          kind: "unavailable",
          ownerId: relationship.ownerId,
          childId: relationship.childId,
          reason,
        }),
      });
    }

    await expect(
      harness.coordinator.activate(harness.targetId, { origin: "presentation-timeline" }),
    ).resolves.toEqual({
      kind: "unavailable",
      requestedId: harness.targetId,
      ownerId: relationship.ownerId,
      childId: relationship.childId,
      reason,
    });
  });

  it.each([
    "authority-boundary",
    "origin-not-supported",
    "learner-interaction-precedence",
  ] as const)("preserves refused reason %s", async (reason) => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    harness.registry.register({
      ownerId: relationship.ownerId,
      activate: async () => ({
        kind: "refused",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
        reason,
      }),
    });

    await expect(
      harness.coordinator.activate(harness.targetId, { origin: "configured-presentation" }),
    ).resolves.toEqual({
      kind: "refused",
      requestedId: harness.targetId,
      ownerId: relationship.ownerId,
      childId: relationship.childId,
      reason,
    });
  });

  it("returns interrupted when the binding reports interruption", async () => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    harness.registry.register({
      ownerId: relationship.ownerId,
      activate: async () => ({
        kind: "interrupted",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
      }),
    });

    await expect(
      harness.coordinator.activate(harness.targetId, { origin: "author-preview" }),
    ).resolves.toEqual({ kind: "interrupted", requestedId: harness.targetId });
  });

  it("uses a replacement path from the latest snapshot after an awaited refusal", async () => {
    const firstPath = [relationship("oldowner0001", "oldchild0001", "layout")] as const;
    const replacementPath = [relationship("newowner0001", "newchild0001", "block")] as const;
    const harness = createHarness(firstPath);
    const firstStarted = deferred<void>();
    const firstOutcome = deferred<{
      readonly kind: "refused";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
      readonly reason: "authority-boundary";
    }>();
    harness.registry.register({
      ownerId: firstPath[0].ownerId,
      activate: () => {
        firstStarted.resolve(undefined);
        return firstOutcome.promise;
      },
    });
    const replacementActivation = vi.fn(async () => ({
      kind: "revealed" as const,
      ownerId: replacementPath[0].ownerId,
      childId: replacementPath[0].childId,
    }));
    harness.registry.register({
      ownerId: replacementPath[0].ownerId,
      activate: replacementActivation,
    });

    const activation = harness.coordinator.activate(harness.targetId, {
      origin: "configured-presentation",
    });
    await firstStarted.promise;
    harness.setPath(replacementPath);
    firstOutcome.resolve({
      kind: "refused",
      ownerId: firstPath[0].ownerId,
      childId: firstPath[0].childId,
      reason: "authority-boundary",
    });

    await expect(activation).resolves.toEqual({
      kind: "reached",
      requestedId: harness.targetId,
    });
    expect(replacementActivation).toHaveBeenCalledOnce();
  });

  it("re-resolves a replaced owner binding after an awaited activation", async () => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    const firstStarted = deferred<void>();
    const firstOutcome = deferred<{
      readonly kind: "revealed";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }>();
    const unregister = harness.registry.register({
      ownerId: relationship.ownerId,
      activate: () => {
        firstStarted.resolve(undefined);
        return firstOutcome.promise;
      },
    });
    const replacementActivation = vi.fn(async () => ({
      kind: "already-visible" as const,
      ownerId: relationship.ownerId,
      childId: relationship.childId,
    }));

    const activation = harness.coordinator.activate(harness.targetId, {
      origin: "document-outline",
    });
    await firstStarted.promise;
    unregister();
    harness.registry.register({
      ownerId: relationship.ownerId,
      activate: replacementActivation,
    });
    firstOutcome.resolve({
      kind: "revealed",
      ownerId: relationship.ownerId,
      childId: relationship.childId,
    });

    await expect(activation).resolves.toEqual({
      kind: "reached",
      requestedId: harness.targetId,
    });
    expect(replacementActivation).toHaveBeenCalledOnce();
  });

  it("does not repeat a committed activation when a new outer relationship appears", async () => {
    const originalRelationship = relationship("oldowner0001", "oldchild0001", "block");
    const outerRelationship = relationship("newowner0001", "newchild0001", "layout");
    const harness = createHarness([originalRelationship]);
    const started = deferred<void>();
    const outcome = deferred<{
      readonly kind: "revealed";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }>();
    const originalActivation = vi.fn(() => {
      started.resolve(undefined);
      return outcome.promise;
    });
    const outerActivation = vi.fn(async () => ({
      kind: "revealed" as const,
      ownerId: outerRelationship.ownerId,
      childId: outerRelationship.childId,
    }));
    harness.registry.register({
      ownerId: originalRelationship.ownerId,
      activate: originalActivation,
    });
    harness.registry.register({
      ownerId: outerRelationship.ownerId,
      activate: outerActivation,
    });

    const activation = harness.coordinator.activate(harness.targetId, {
      origin: "configured-presentation",
    });
    await started.promise;
    harness.setPath([outerRelationship, originalRelationship]);
    outcome.resolve({
      kind: "revealed",
      ownerId: originalRelationship.ownerId,
      childId: originalRelationship.childId,
    });

    await expect(activation).resolves.toEqual({
      kind: "reached",
      requestedId: harness.targetId,
    });
    expect(outerActivation).toHaveBeenCalledOnce();
    expect(originalActivation).toHaveBeenCalledOnce();
  });

  it("reports owner-unmounted when a completed owner unmounts before re-resolution", async () => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    const started = deferred<void>();
    const outcome = deferred<{
      readonly kind: "revealed";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }>();
    const unregister = harness.registry.register({
      ownerId: relationship.ownerId,
      activate: () => {
        started.resolve(undefined);
        return outcome.promise;
      },
    });

    const activation = harness.coordinator.activate(harness.targetId, {
      origin: "author-preview",
    });
    await started.promise;
    unregister();
    outcome.resolve({
      kind: "revealed",
      ownerId: relationship.ownerId,
      childId: relationship.childId,
    });

    await expect(activation).resolves.toEqual({
      kind: "unavailable",
      requestedId: harness.targetId,
      ownerId: relationship.ownerId,
      childId: relationship.childId,
      reason: "owner-unmounted",
    });
  });

  it("re-resolves deletion after an awaited Surface presentation", async () => {
    const surfacePresentation = deferred<void>();
    const harness = createHarness([], () => surfacePresentation.promise);

    const activation = harness.coordinator.activate(harness.targetId, {
      origin: "configured-presentation",
    });
    harness.deleteTarget();
    surfacePresentation.resolve(undefined);

    await expect(activation).resolves.toEqual({
      kind: "missing-target",
      requestedId: harness.targetId,
    });
  });

  it("presents a replacement Surface resolved after the first presentation await", async () => {
    const firstPresentation = deferred<void>();
    const firstPresentationStarted = deferred<void>();
    const harness = createHarness([], async () => {
      if (harness.presentSurface.mock.calls.length === 1) {
        firstPresentationStarted.resolve(undefined);
        await firstPresentation.promise;
      }
    });
    const replacementSurfaceId = EmbeddedNodeIdSchema.parse("othersurf001");

    const activation = harness.coordinator.activate(harness.targetId, {
      origin: "configured-presentation",
    });
    await firstPresentationStarted.promise;
    harness.setSurfaceId(replacementSurfaceId);
    firstPresentation.resolve(undefined);

    await expect(activation).resolves.toEqual({
      kind: "reached",
      requestedId: harness.targetId,
    });
    expect(harness.presentSurface.mock.calls.map(([surfaceId]) => surfaceId)).toEqual([
      harness.surfaceId,
      replacementSurfaceId,
    ]);
  });

  it("interrupts an already-aborted request before any side effect", async () => {
    const harness = createHarness();
    const cancellation = new AbortController();
    cancellation.abort();

    await expect(
      harness.coordinator.activate(harness.targetId, {
        origin: "author-preview",
        signal: cancellation.signal,
      }),
    ).resolves.toEqual({ kind: "interrupted", requestedId: harness.targetId });
    expect(harness.presentSurface).not.toHaveBeenCalled();
  });

  it("supersedes an in-flight activation without stale completion", async () => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    const started = deferred<void>();
    harness.registry.register({
      ownerId: relationship.ownerId,
      activate: ({ signal }) =>
        new Promise((resolve) => {
          started.resolve(undefined);
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                kind: "interrupted",
                ownerId: relationship.ownerId,
                childId: relationship.childId,
              }),
            { once: true },
          );
        }),
    });

    const stale = harness.coordinator.activate(harness.targetId, {
      origin: "presentation-timeline",
    });
    await started.promise;
    await expect(
      harness.coordinator.activate(harness.surfaceId, {
        origin: "presentation-timeline",
      }),
    ).resolves.toEqual({ kind: "reached", requestedId: harness.surfaceId });
    await expect(stale).resolves.toEqual({
      kind: "interrupted",
      requestedId: harness.targetId,
    });
  });

  it("keeps binding defects and impossible result identity observable", async () => {
    const harness = createHarness();
    const [relationship] = harness.path;
    if (!relationship) throw new Error("expected activation relationship");
    harness.registry.register({
      ownerId: relationship.ownerId,
      activate: async () => {
        throw new Error("binding defect");
      },
    });

    await expect(
      harness.coordinator.activate(harness.targetId, { origin: "document-outline" }),
    ).rejects.toThrow("binding defect");

    const identityHarness = createHarness();
    const [identityRelationship] = identityHarness.path;
    if (!identityRelationship) throw new Error("expected activation relationship");
    identityHarness.registry.register({
      ownerId: identityRelationship.ownerId,
      activate: async () => ({
        kind: "revealed",
        ownerId: identityRelationship.ownerId,
        childId: EmbeddedNodeIdSchema.parse("wrongchild01"),
      }),
    });
    await expect(
      identityHarness.coordinator.activate(identityHarness.targetId, {
        origin: "document-outline",
      }),
    ).rejects.toThrow("Semantic activation outcome identity does not match");

    const disappearingTargetHarness = createHarness();
    const [disappearingRelationship] = disappearingTargetHarness.path;
    if (!disappearingRelationship) throw new Error("expected activation relationship");
    const activationStarted = deferred<void>();
    const activation = deferred<void>();
    disappearingTargetHarness.registry.register({
      ownerId: disappearingRelationship.ownerId,
      activate: async () => {
        activationStarted.resolve();
        await activation.promise;
        return {
          kind: "revealed",
          ownerId: disappearingRelationship.ownerId,
          childId: EmbeddedNodeIdSchema.parse("wrongchild02"),
        };
      },
    });
    const interaction = disappearingTargetHarness.coordinator.activate(
      disappearingTargetHarness.targetId,
      { origin: "document-outline" },
    );
    await activationStarted.promise;
    disappearingTargetHarness.deleteTarget();
    activation.resolve();

    await expect(interaction).rejects.toThrow(
      "Semantic activation outcome identity does not match",
    );
  });
});

function createHarness(
  initialPath: readonly SemanticActivationRelationship[] = [
    relationship("owner0000001", "child0000001", "layout"),
  ],
  present: () => Promise<void> = async () => undefined,
) {
  const fixture = createRepresentativeSemanticDocumentFixture({ kind: "page" });
  const projected = projectSemanticDocument({
    doc: fixture.doc,
    courseStructure: fixture.courseStructure,
    definitions: fixture.definitions,
    revision: 1,
  });
  const targetId = fixture.surfaces[0]!.publishedParagraph;
  const surfaceId = fixture.surfaces[0]!.surface;
  let semantics = snapshotWithPath(projected, targetId, initialPath);
  let path = initialPath;
  const registry = createSemanticActivationRegistry();
  const presentSurface = vi.fn(
    async (_surfaceId: EmbeddedNodeId, _signal: AbortSignal) => await present(),
  );
  const coordinator = createSemanticTargetInteractionCoordinator({
    registry,
    getSemantics: () => semantics,
    getCourseStructure: () => fixture.courseStructure,
    surfacePresentation: { presentSurface },
  });

  return {
    coordinator,
    registry,
    presentSurface,
    targetId,
    surfaceId,
    get path() {
      return path;
    },
    setPath(nextPath: readonly SemanticActivationRelationship[]) {
      path = nextPath;
      semantics = snapshotWithPath(semantics, targetId, nextPath);
    },
    setSurfaceId(surfaceId: EmbeddedNodeId) {
      const location = semantics.locationById.get(targetId);
      if (!location) throw new Error("expected target location");
      const locationById = new Map(semantics.locationById);
      locationById.set(targetId, { ...location, surfaceId });
      semantics = { ...semantics, locationById };
    },
    deleteTarget() {
      const itemById = new Map(semantics.itemById);
      const locationById = new Map(semantics.locationById);
      itemById.delete(targetId);
      locationById.delete(targetId);
      semantics = { ...semantics, itemById, locationById };
    },
  };
}

function snapshotWithPath(
  snapshot: SemanticDocumentSnapshot,
  targetId: EmbeddedNodeId,
  activationPath: readonly SemanticActivationRelationship[],
): SemanticDocumentSnapshot {
  const location = snapshot.locationById.get(targetId);
  if (!location) throw new Error("expected target location");
  const locationById = new Map(snapshot.locationById);
  locationById.set(targetId, { ...location, activationPath });
  return { ...snapshot, locationById };
}

function relationship(
  ownerId: string,
  childId: string,
  ownerKind: SemanticActivationRelationship["ownerKind"],
): SemanticActivationRelationship {
  return {
    ownerId: EmbeddedNodeIdSchema.parse(ownerId),
    childId: EmbeddedNodeIdSchema.parse(childId),
    ownerKind,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
