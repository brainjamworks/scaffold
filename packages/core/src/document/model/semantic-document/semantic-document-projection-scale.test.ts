import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vite-plus/test";

import { projectSemanticDocument } from "../index";
import {
  countProseMirrorNodes,
  createNestedOwnerSemanticDocumentFixture,
  createScaleSemanticDocumentFixture,
} from "./testing/semantic-document-fixtures";

describe("semantic document projection scale baseline", () => {
  it("projects 100 Surfaces and 2,000 Blocks once and reuses indexed results", () => {
    const fixture = createScaleSemanticDocumentFixture({
      surfaceCount: 100,
      blocksPerSurface: 20,
    });

    const startedAt = performance.now();
    const snapshot = projectSemanticDocument({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 100,
    });
    const durationMs = performance.now() - startedAt;
    const callbacksAfterProjection = fixture.callbackCounts.layoutSection;

    for (const id of fixture.blockIds) {
      expect(snapshot.itemById.get(id)?.kind).toBe("block");
      expect(snapshot.parentById.has(id)).toBe(true);
      expect(snapshot.locationById.has(id)).toBe(true);
    }

    const metadata = Object.freeze({
      surfaceCount: fixture.surfaceIds.length,
      blockCount: fixture.blockIds.length,
      proseMirrorNodeCount: countProseMirrorNodes(fixture.doc),
      semanticItemCount: snapshot.itemById.size,
      projectorCallbackCount: callbacksAfterProjection,
      durationMs: Number(durationMs.toFixed(3)),
    });
    console.info("semantic-projection-scale", metadata);

    expect(metadata).toMatchObject({
      surfaceCount: 100,
      blockCount: 2_000,
      semanticItemCount: 3_000,
      projectorCallbackCount: 100,
    });
    expect(metadata.proseMirrorNodeCount).toBeGreaterThan(metadata.semanticItemCount);
    expect(metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(fixture.callbackCounts.layoutSection).toBe(callbacksAfterProjection);
  });

  it("keeps structural indexing near-linear as semantic owner depth doubles", () => {
    const shallowDepth = 32;
    const deepDepth = shallowDepth * 2;
    const shallow = measureNestedOwnerProjection(shallowDepth);
    const deep = measureNestedOwnerProjection(deepDepth);

    expect(shallow.semanticItemCount).toBe(shallowDepth + 1);
    expect(deep.semanticItemCount).toBe(deepDepth + 1);
    expect(shallow.structuralWork).toBeLessThanOrEqual(shallowDepth * 3);
    expect(deep.structuralWork).toBeLessThanOrEqual(deepDepth * 3);
    expect(deep.structuralWork).toBeLessThanOrEqual(shallow.structuralWork * 2.25);
  });
});

function measureNestedOwnerProjection(depth: number): {
  readonly semanticItemCount: number;
  readonly structuralWork: number;
} {
  const fixture = createNestedOwnerSemanticDocumentFixture({ depth });
  const forEach = vi.spyOn(ProseMirrorNode.prototype, "forEach");

  try {
    const snapshot = projectSemanticDocument({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: depth,
    });
    for (const id of fixture.ownerIds) expect(snapshot.itemById.has(id)).toBe(true);
    return {
      semanticItemCount: snapshot.itemById.size,
      structuralWork: forEach.mock.calls.length,
    };
  } finally {
    forEach.mockRestore();
  }
}
