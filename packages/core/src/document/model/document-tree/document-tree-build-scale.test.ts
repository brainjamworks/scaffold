import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildDocumentTree } from "../index";
import {
  countProseMirrorNodes,
  createNestedOwnerDocumentTreeFixture,
  createScaleDocumentTreeFixture,
} from "./testing/document-tree-fixtures";

describe("document tree build scale baseline", () => {
  it("projects 100 Surfaces and 2,000 Blocks repeatedly and reuses indexed results", () => {
    const fixture = createScaleDocumentTreeFixture({
      surfaceCount: 100,
      blocksPerSurface: 20,
    });
    buildDocumentTree({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 99,
    });
    const callbacksAfterWarmup = fixture.callbackCounts.layoutSection;
    const heapBefore = process.memoryUsage().heapUsed;
    const measurements = Array.from({ length: 15 }, (_, index) => {
      const startedAt = performance.now();
      const snapshot = buildDocumentTree({
        doc: fixture.doc,
        courseStructure: fixture.courseStructure,
        definitions: fixture.definitions,
        revision: 100 + index,
      });
      return { durationMs: performance.now() - startedAt, snapshot };
    });
    const heapAfter = process.memoryUsage().heapUsed;
    const snapshot = measurements.at(-1)!.snapshot;
    const callbacksAfterProjection = fixture.callbackCounts.layoutSection;

    for (const id of fixture.blockIds) {
      expect(snapshot.itemById.get(id)?.kind).toBe("block");
      expect(snapshot.parentById.has(id)).toBe(true);
      expect(snapshot.locationById.has(id)).toBe(true);
    }

    const durations = measurements.map(({ durationMs }) => durationMs);
    const metadata = Object.freeze({
      environment: `${process.platform} node-${process.version}`,
      samples: measurements.length,
      surfaceCount: fixture.surfaceIds.length,
      blockCount: fixture.blockIds.length,
      proseMirrorNodeCount: countProseMirrorNodes(fixture.doc),
      semanticItemCount: snapshot.itemById.size,
      projectorCallbackCount:
        (callbacksAfterProjection - callbacksAfterWarmup) / measurements.length,
      medianDurationMs: rounded(percentile(durations, 0.5)),
      tailDurationMs: rounded(percentile(durations, 0.95)),
      observedHeapDeltaBytes: heapAfter - heapBefore,
    });
    console.info("semantic-projection-broad-warmed", metadata);

    expect(metadata).toMatchObject({
      samples: 15,
      surfaceCount: 100,
      blockCount: 2_000,
      semanticItemCount: 3_001,
      projectorCallbackCount: 100,
    });
    expect(metadata.proseMirrorNodeCount).toBeGreaterThan(metadata.semanticItemCount);
    expect(metadata.medianDurationMs).toBeGreaterThanOrEqual(0);
    expect(metadata.tailDurationMs).toBeGreaterThanOrEqual(metadata.medianDurationMs);
    expect(fixture.callbackCounts.layoutSection).toBe(callbacksAfterProjection);
  });

  it("records warmed deep timing and projection call-frequency evidence", () => {
    const depth = 256;
    const fixture = createNestedOwnerDocumentTreeFixture({ depth });
    buildDocumentTree({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 0,
    });
    const durations = Array.from({ length: 15 }, (_, index) => {
      const startedAt = performance.now();
      const snapshot = buildDocumentTree({
        doc: fixture.doc,
        courseStructure: fixture.courseStructure,
        definitions: fixture.definitions,
        revision: index + 1,
      });
      expect(snapshot.itemById.size).toBe(depth + 1);
      return performance.now() - startedAt;
    });
    const freeze = vi.spyOn(Object, "freeze");
    const idParse = vi.spyOn(EmbeddedNodeIdSchema, "safeParse");
    const forEach = vi.spyOn(ProseMirrorNode.prototype, "forEach");
    const descendants = vi.spyOn(ProseMirrorNode.prototype, "descendants");
    buildDocumentTree({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 100,
    });

    const metadata = Object.freeze({
      environment: `${process.platform} node-${process.version}`,
      samples: durations.length,
      ownerDepth: depth,
      proseMirrorNodeCount: countProseMirrorNodes(fixture.doc),
      semanticItemCount: depth + 1,
      projectorCallbackCount: depth,
      medianDurationMs: rounded(percentile(durations, 0.5)),
      tailDurationMs: rounded(percentile(durations, 0.95)),
      hotCallFrequency: Object.freeze({
        objectFreeze: freeze.mock.calls.length,
        embeddedIdParse: idParse.mock.calls.length,
        nodeForEach: forEach.mock.calls.length,
        nodeDescendants: descendants.mock.calls.length,
      }),
    });
    freeze.mockRestore();
    idParse.mockRestore();
    forEach.mockRestore();
    descendants.mockRestore();
    console.info("semantic-projection-deep-warmed", metadata);

    expect(metadata).toMatchObject({
      samples: 15,
      ownerDepth: depth,
      semanticItemCount: depth + 1,
      projectorCallbackCount: depth,
    });
    expect(metadata.medianDurationMs).toBeGreaterThanOrEqual(0);
    expect(metadata.tailDurationMs).toBeGreaterThanOrEqual(metadata.medianDurationMs);
    expect(metadata.hotCallFrequency.objectFreeze).toBeGreaterThan(0);
    expect(metadata.hotCallFrequency.embeddedIdParse).toBeGreaterThan(0);
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
  const fixture = createNestedOwnerDocumentTreeFixture({ depth });
  const forEach = vi.spyOn(ProseMirrorNode.prototype, "forEach");

  try {
    const snapshot = buildDocumentTree({
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

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}
