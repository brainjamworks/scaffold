// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { PresentationContentLayout } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { allowsBoundedContainerRootInsertionAtPosition } from "@/editor/bounded-containers/model/bounded-container-placement";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CONTENT_LAYOUT_ATTR } from "./content-layout-attribute";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { resolveBoundedContainerOccupancyPolicy } from "./content-layout-bounded-placement";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;
type EligibleContainerType = "region" | "cell" | "section";

describe("Content Layout bounded placement adapter", () => {
  it("maps a schema-defaulted Region to immutable exclusive fill occupancy", () => {
    const editor = makeEditor();

    try {
      const region = findNode(editor, "region");

      const policy = resolveBoundedContainerOccupancyPolicy(region);

      expect(policy).toEqual({ kind: "exclusive-fill" });
      expect(Object.isFrozen(policy)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    ["region", FLOW, "exclusive-fill"],
    ["region", SEQUENCE, "shared-fill"],
    ["cell", FLOW, "exclusive-fill"],
    ["cell", SEQUENCE, "shared-fill"],
    ["section", FLOW, "exclusive-fill"],
    ["section", SEQUENCE, "shared-fill"],
  ] as const)("maps explicit %s %s to %s occupancy", (nodeType, contentLayout, kind) => {
    const editor = makeEditor({ [nodeType]: contentLayout });

    try {
      const policy = resolveBoundedContainerOccupancyPolicy(findNode(editor, nodeType));

      expect(policy).toEqual({ kind });
      expect(Object.isFrozen(policy)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    [FLOW, "region", false],
    [SEQUENCE, "region", true],
    [FLOW, "cell", false],
    [SEQUENCE, "cell", true],
    [FLOW, "section", false],
    [SEQUENCE, "section", true],
  ] as const)(
    "uses %s for an active bounded %s with an existing fill occupant",
    (contentLayout, nodeType, allowsRootInsertion) => {
      const editor = makeEditor({ [nodeType]: contentLayout });

      try {
        const container = findNode(editor, nodeType);
        expect(resolveBoundedContainerOccupancyPolicy(container)).toEqual({
          kind: contentLayout === FLOW ? "exclusive-fill" : "shared-fill",
        });
        expect(
          allowsBoundedContainerRootInsertionAtPosition({
            blockDefinitions: builtInBlockRegistry,
            doc: editor.state.doc,
            layoutDefinitions: builtInLayoutRegistry,
            pos: findNodePosition(editor, nodeType),
            resolveBoundedContainerOccupancyPolicy,
          }),
        ).toBe(allowsRootInsertion);
      } finally {
        editor.destroy();
      }
    },
  );

  it("throws when an established container has an invalid contentLayout attr", () => {
    const editor = makeEditor();

    try {
      const region = findNode(editor, "region");
      const invalidRegion = region.type.create(
        {
          ...region.attrs,
          [CONTENT_LAYOUT_ATTR]: "unsupported",
        },
        region.content,
        region.marks,
      );

      expect(() => resolveBoundedContainerOccupancyPolicy(invalidRegion)).toThrow();
    } finally {
      editor.destroy();
    }
  });
});

function makeEditor(
  contentLayouts: Partial<Record<EligibleContainerType, typeof FLOW | typeof SEQUENCE>> = {},
): Editor {
  const attrs = (nodeType: EligibleContainerType) => ({
    id: `${nodeType}-a`,
    ...(contentLayouts[nodeType] === undefined
      ? {}
      : { [CONTENT_LAYOUT_ATTR]: contentLayouts[nodeType] }),
  });

  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "region",
                  attrs: attrs("region"),
                  content: [
                    {
                      type: "grid",
                      attrs: { id: "grid-region" },
                      content: [
                        {
                          type: "cell",
                          attrs: attrs("cell"),
                          content: [
                            {
                              type: "layout",
                              attrs: { id: "layout-tabs", variant: "tabs" },
                              content: [
                                {
                                  type: "section",
                                  attrs: attrs("section"),
                                  content: [
                                    {
                                      type: "grid",
                                      attrs: { id: "grid-section" },
                                      content: [
                                        {
                                          type: "cell",
                                          attrs: { id: "cell-section" },
                                          content: [{ type: "paragraph" }],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function findNode(editor: Editor, nodeType: EligibleContainerType): ProseMirrorNode {
  let found: ProseMirrorNode | undefined;

  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) {
      found = node;
      return false;
    }
    return true;
  });

  if (!found) throw new Error(`Expected ${nodeType} node`);
  return found;
}

function findNodePosition(editor: Editor, nodeType: EligibleContainerType): number {
  let found: number | undefined;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === nodeType) {
      found = pos;
      return false;
    }
    return true;
  });

  if (found === undefined) throw new Error(`Expected ${nodeType} position`);
  return found;
}
