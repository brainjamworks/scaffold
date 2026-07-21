import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  FixedSurfaceChild,
  SurfaceStructureAttributeValue,
} from "../surface-variant-definition";

const SURFACE_HEADER_NODE_TYPE = "surface_header";
const SURFACE_FOOTER_NODE_TYPE = "surface_footer";

export interface SurfaceStructureChild {
  type: string;
  attrs?: Readonly<Record<string, unknown>>;
}

export type FixedSurfaceChildrenMismatch =
  | {
      kind: "count";
      index: number;
      expectedCount: number;
      actualCount: number;
    }
  | {
      kind: "type";
      index: number;
      expectedType: string;
      actualType: string;
    }
  | {
      kind: "attribute";
      index: number;
      attribute: string;
      expectedValue: SurfaceStructureAttributeValue;
      actualValue: unknown;
    };

export type FixedSurfaceChildrenMatchResult =
  | { exact: true }
  | { exact: false; mismatch: FixedSurfaceChildrenMismatch };

type FixedSurfaceChildValueMismatch = Exclude<FixedSurfaceChildrenMismatch, { kind: "count" }>;

export function matchFixedSurfaceChildren(
  children: readonly SurfaceStructureChild[],
  expected: readonly FixedSurfaceChild[],
): FixedSurfaceChildrenMatchResult {
  if (children.length !== expected.length) {
    const comparableCount = Math.min(children.length, expected.length);
    let index = 0;
    while (
      index < comparableCount &&
      fixedSurfaceChildValueMismatch(children[index]!, expected[index]!, index) === null
    ) {
      index += 1;
    }

    return {
      exact: false,
      mismatch: {
        kind: "count",
        index,
        expectedCount: expected.length,
        actualCount: children.length,
      },
    };
  }

  for (let index = 0; index < expected.length; index += 1) {
    const expectedChild = expected[index]!;
    const actualChild = children[index]!;
    const mismatch = fixedSurfaceChildValueMismatch(actualChild, expectedChild, index);
    if (mismatch) return { exact: false, mismatch };
  }

  return { exact: true };
}

function fixedSurfaceChildValueMismatch(
  actualChild: SurfaceStructureChild,
  expectedChild: FixedSurfaceChild,
  index: number,
): FixedSurfaceChildValueMismatch | null {
  if (actualChild.type !== expectedChild.type) {
    return {
      kind: "type",
      index,
      expectedType: expectedChild.type,
      actualType: actualChild.type,
    };
  }

  for (const [attribute, expectedValue] of Object.entries(expectedChild.attrs ?? {})) {
    const actualValue = actualChild.attrs?.[attribute];
    if (actualValue !== expectedValue) {
      return {
        kind: "attribute",
        index,
        attribute,
        expectedValue,
        actualValue,
      };
    }
  }

  return null;
}

export function snapshotSurfaceStructureChildrenFromJSON(
  surface: JSONContent,
): readonly SurfaceStructureChild[] {
  const children = (surface.content ?? []).map((child) =>
    snapshotSurfaceStructureChild(child.type ?? "", child.attrs),
  );
  return excludeOptionalHeaderFooterBoundaries(children);
}

export function snapshotSurfaceStructureChildrenFromProseMirror(
  surface: ProseMirrorNode,
): readonly SurfaceStructureChild[] {
  const children: SurfaceStructureChild[] = [];
  surface.forEach((child) => {
    children.push(snapshotSurfaceStructureChild(child.type.name, child.attrs));
  });
  return excludeOptionalHeaderFooterBoundaries(children);
}

function snapshotSurfaceStructureChild(
  type: string,
  attrs: Readonly<Record<string, unknown>> | null | undefined,
): SurfaceStructureChild {
  const structuralAttrs = Object.fromEntries(
    Object.entries(attrs ?? {}).filter(([attribute]) => attribute !== "id"),
  );

  return {
    type,
    ...(Object.keys(structuralAttrs).length > 0 ? { attrs: structuralAttrs } : {}),
  };
}

function excludeOptionalHeaderFooterBoundaries(
  children: readonly SurfaceStructureChild[],
): readonly SurfaceStructureChild[] {
  const start = children[0]?.type === SURFACE_HEADER_NODE_TYPE ? 1 : 0;
  const end = children.at(-1)?.type === SURFACE_FOOTER_NODE_TYPE ? -1 : children.length;
  return children.slice(start, end);
}
