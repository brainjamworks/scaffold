// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vite-plus/test";

import { createClientRectSnapshot } from "@/editor/interactions/drag/model/coordinate-space";

import type { MovementNodeContext } from "../model/movement-policy";
import { ContainedMovementTarget, GridMovementTarget } from "../model/movement-target";
import {
  createMovementTargetIndexSnapshot,
  measureMovementTargetEntries,
  type MovementTargetDescriptor,
  type MovementTargetEntry,
} from "./movement-target-index";

function context(
  pos: number,
  nodeType: string,
  options: Readonly<{ depth?: number; index?: number; parentPos?: number }> = {},
): MovementNodeContext {
  const parent = {} as MovementNodeContext["parent"];
  return {
    ancestors: Array.from({ length: options.depth ?? 0 }, (_, index) => ({
      index,
      node: {} as MovementNodeContext["node"],
      nodeType: { name: `ancestor-${index}` } as MovementNodeContext["nodeType"],
      parent: {} as NonNullable<MovementNodeContext["parent"]>,
      pos: index,
    })),
    index: options.index ?? 0,
    node: { attrs: {}, nodeSize: 1 } as unknown as MovementNodeContext["node"],
    nodeType: { name: nodeType } as MovementNodeContext["nodeType"],
    parent,
    parentPos: options.parentPos ?? 1,
    parentType: { name: "parent" } as MovementNodeContext["parentType"],
    pos,
  };
}

function entry(
  key: string,
  targetContext: MovementNodeContext,
  rect: Readonly<{ height: number; left: number; top: number; width: number }>,
  kind: MovementTargetDescriptor["kind"] = "structure",
  scroll?: Readonly<{ element: Element | Document; measuredX: number; measuredY: number }>,
  axis: MovementTargetDescriptor["axis"] = "vertical",
): MovementTargetEntry {
  return {
    descriptor: {
      axis,
      context: targetContext,
      documentPosition: targetContext.pos,
      element: document.createElement("div"),
      key,
      kind,
    },
    rect: {
      measuredRect: createClientRectSnapshot(rect.left, rect.top, rect.width, rect.height)!,
      scrollAncestors: scroll ? [scroll] : [],
    },
  };
}

describe("movement target index", () => {
  it("selects the smallest and deepest exact target without reading document or layout", () => {
    const layoutRead = vi.fn(() => {
      throw new Error("query must not read layout");
    });
    const wide = entry("structure:block:10:wide", context(10, "test_block", { depth: 2 }), {
      height: 120,
      left: 0,
      top: 0,
      width: 200,
    });
    const shallow = entry("structure:block:20:shallow", context(20, "test_block", { depth: 2 }), {
      height: 60,
      left: 20,
      top: 20,
      width: 100,
    });
    const deep = entry("structure:block:30:deep", context(30, "test_block", { depth: 4 }), {
      height: 60,
      left: 20,
      top: 20,
      width: 100,
    });
    wide.descriptor.element.getBoundingClientRect = layoutRead;
    shallow.descriptor.element.getBoundingClientRect = layoutRead;
    deep.descriptor.element.getBoundingClientRect = layoutRead;
    const snapshot = createMovementTargetIndexSnapshot({
      documentRevision: 3,
      entries: [wide, shallow, deep],
      geometryRevision: 7,
    });

    const result = snapshot.query(
      { x: 50, y: 50 },
      { context: context(1, "test_block"), kind: "structure" },
    );

    expect(result?.key).toBe("structure:block:30:deep");
    expect(result?.target.pos).toBe(30);
    expect(layoutRead).not.toHaveBeenCalled();
  });

  it("preserves structural-row gutter priority over overlapping child gutters", () => {
    const grid = entry("structure:grid:10", context(10, "grid"), {
      height: 120,
      left: 10,
      top: 40,
      width: 400,
    });
    const block = entry("structure:block:20", context(20, "test_block", { depth: 4 }), {
      height: 150,
      left: 20,
      top: 60,
      width: 200,
    });
    const snapshot = createMovementTargetIndexSnapshot({
      documentRevision: 1,
      entries: [block, grid],
      geometryRevision: 1,
    });

    const result = snapshot.query(
      { x: 120, y: 170 },
      { context: context(1, "test_block"), kind: "structure" },
    );

    expect(result?.target).toBeInstanceOf(GridMovementTarget);
    expect(result?.target.pos).toBe(10);
  });

  it("adjusts cached rectangles from immutable tracked scroll offsets", () => {
    const scroller = document.createElement("div");
    const target = entry(
      "structure:block:20",
      context(20, "test_block"),
      { height: 80, left: 40, top: 120, width: 200 },
      "structure",
      { element: scroller, measuredX: 0, measuredY: 10 },
    );
    const snapshot = createMovementTargetIndexSnapshot({
      documentRevision: 1,
      entries: [target],
      geometryRevision: 2,
      scrollOffsets: new Map([[scroller, { x: 0, y: 70 }]]),
    });

    const result = snapshot.query(
      { x: 100, y: 90 },
      { context: context(1, "test_block"), kind: "structure" },
    );

    expect(result?.target.rect).toEqual({
      bottom: 140,
      height: 80,
      left: 40,
      right: 240,
      top: 60,
      width: 200,
    });
  });

  it("preserves contained no-op behavior after choosing the best target", () => {
    const target = entry(
      "contained:selectable_choice:20",
      context(20, "selectable_choice", { index: 1, parentPos: 5 }),
      { height: 80, left: 20, top: 20, width: 200 },
      "contained",
    );
    const snapshot = createMovementTargetIndexSnapshot({
      documentRevision: 1,
      entries: [target],
      geometryRevision: 1,
    });

    expect(
      snapshot.query(
        { x: 100, y: 30 },
        {
          context: context(10, "selectable_choice", { index: 0, parentPos: 5 }),
          kind: "contained",
        },
      ),
    ).toBeNull();

    const move = snapshot.query(
      { x: 100, y: 90 },
      {
        context: context(10, "selectable_choice", { index: 0, parentPos: 5 }),
        kind: "contained",
      },
    );
    expect(move?.target).toBeInstanceOf(ContainedMovementTarget);
    expect(move?.placement).toBe("after");
  });

  it("uses the owner-published axis without interpreting the node type", () => {
    const target = entry(
      "contained:owner_defined_item:20",
      context(20, "owner_defined_item", { index: 2, parentPos: 5 }),
      { height: 200, left: 20, top: 20, width: 200 },
      "contained",
      undefined,
      "horizontal",
    );
    const snapshot = createMovementTargetIndexSnapshot({
      documentRevision: 1,
      entries: [target],
      geometryRevision: 1,
    });
    const source = {
      context: context(10, "owner_defined_item", { index: 0, parentPos: 5 }),
      kind: "contained",
    } as const;

    expect(snapshot.query({ x: 40, y: 190 }, source)?.placement).toBe("before");
    const after = snapshot.query({ x: 190, y: 40 }, source);
    expect(after?.placement).toBe("after");
    expect(after?.target.axis).toBe("horizontal");
  });

  it("keeps semantic keys stable across geometry revisions", () => {
    const target = entry("structure:test_block:20:block-b", context(20, "test_block"), {
      height: 80,
      left: 20,
      top: 20,
      width: 200,
    });
    const first = createMovementTargetIndexSnapshot({
      documentRevision: 4,
      entries: [target],
      geometryRevision: 1,
    });
    const second = createMovementTargetIndexSnapshot({
      documentRevision: 4,
      entries: [target],
      geometryRevision: 2,
    });
    const source = { context: context(1, "test_block"), kind: "structure" } as const;

    expect(first.query({ x: 40, y: 40 }, source)?.key).toBe(
      second.query({ x: 40, y: 40 }, source)?.key,
    );
  });

  it("excludes disconnected descriptors before attempting a rectangle read", () => {
    const disconnected = document.createElement("div");
    const readRect = vi.fn(() => new DOMRect(0, 0, 100, 80));
    disconnected.getBoundingClientRect = readRect;
    const descriptor: MovementTargetDescriptor = {
      axis: "vertical",
      context: context(20, "test_block"),
      documentPosition: 20,
      element: disconnected,
      key: "structure:test_block:20:block-b",
      kind: "structure",
    };

    expect(measureMovementTargetEntries([descriptor])).toEqual([]);
    expect(readRect).not.toHaveBeenCalled();
  });
});
