import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import {
  createLayoutAuthoringNodeView,
  createSectionAuthoringNodeView,
} from "@/editor/arrangements/layout/authoring/layout-node-views";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { LayoutAuthoringViewRegistry } from "@/editor/arrangements/layout/authoring/layout-view-registry";
import {
  createLayoutNode,
  createSectionNode,
} from "@/editor/arrangements/layout/model/layout-nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

export interface DescribeLayoutContractInput {
  blockDefinitions: BlockDefinitionLookup;
  layoutDefinitions: LayoutRegistry;
  layoutAuthoringViews: LayoutAuthoringViewRegistry;
  layoutId: string;
  expectsLayoutConfiguration?: boolean;
  expectsSectionConfiguration?: boolean;
  editorExtensions?: readonly AnyExtension[];
  contentOverride?: JSONContent;
  expectedSurfaceClass?: string;
  expectedDescendantClasses?: readonly string[];
}

export function describeLayoutContract(input: DescribeLayoutContractInput): void {
  describe(`layout contract: ${input.layoutId}`, () => {
    it("creates valid catalog content for the registered layout", () => {
      assertLayoutContract(input);
    });

    it("renders the shared layout chrome contract in editor mode", async () => {
      const editor = createLayoutContractEditor(
        input.blockDefinitions,
        input.layoutDefinitions,
        input.layoutAuthoringViews,
        input.editorExtensions,
      );
      try {
        const nodeResult = createLayoutContractNodeChecked(editor, input);
        expect(nodeResult.ok).toBe(true);
        if (!nodeResult.ok) return;

        editor.commands.setContent({
          type: "doc",
          content: [
            {
              type: "courseDocument",
              attrs: { mode: "page" },
              content: [
                {
                  type: "surface",
                  attrs: { id: "surface-contract", variant: "page-default" },
                  content: [nodeResult.node.toJSON()],
                },
              ],
            },
          ],
        });
        render(createElement(EditorContent, { editor }));

        await waitFor(() => {
          const root = document.body.querySelector(
            `[data-authoring-frame="layout"][data-layout-kind="${input.layoutId}"]`,
          );
          expect(root).not.toBeNull();
          if (input.expectedSurfaceClass) {
            expect(root?.classList.contains(input.expectedSurfaceClass)).toBe(false);
            expect(root?.querySelector(`:scope > .${input.expectedSurfaceClass}`)).not.toBeNull();
          }
          for (const className of input.expectedDescendantClasses ?? []) {
            expect(root?.querySelector(`.${className}`)).not.toBeNull();
          }
          expect(root?.querySelector("[data-layout-outline]")).not.toBeNull();
          expect(root?.querySelector("[data-layout-menu-trigger]")).toBeNull();
          expect(root?.querySelector("[data-layout-add-ghost]")).not.toBeNull();
        });
      } finally {
        cleanup();
        editor.destroy();
      }
    });
  });
}

export function assertLayoutContract(input: DescribeLayoutContractInput): void {
  const definition = input.layoutDefinitions.getById(input.layoutId);
  expect(definition).toBeDefined();
  expect(definition?.nodeType).toBe("layout");

  expect(input.blockDefinitions.getByNodeType("layout")).toBeUndefined();
  expect(input.blockDefinitions.getByNodeType("section")).toBeUndefined();

  if (input.expectsLayoutConfiguration) {
    expect(definition?.configuration).toBeDefined();
  }

  if (input.expectsSectionConfiguration) {
    expect(definition?.section?.configuration).toBeDefined();
  }

  const editor = createLayoutContractEditor(
    input.blockDefinitions,
    input.layoutDefinitions,
    input.layoutAuthoringViews,
    input.editorExtensions,
  );
  try {
    const nodeResult = createLayoutContractNodeChecked(editor, input);

    expect(nodeResult.ok).toBe(true);
    if (!nodeResult.ok) return;

    const node = nodeResult.node;
    node.check();
    expect(node.type.name).toBe("layout");
    expect(node.attrs["variant"]).toBe(input.layoutId);
    expect(typeof node.attrs["id"]).toBe("string");
    expect(
      node.attrs["id"],
      `Expected layout "${input.layoutId}" to have an opaque stable id.`,
    ).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(node.childCount).toBeGreaterThan(0);

    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      expect(child.type.name).toBe("section");
      expect(typeof child.attrs["id"]).toBe("string");
      expect(
        child.attrs["id"],
        `Expected section ${index} in layout "${input.layoutId}" to have an opaque stable id.`,
      ).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    }
  } finally {
    editor.destroy();
  }
}

function createLayoutContractNodeChecked(editor: Editor, input: DescribeLayoutContractInput) {
  const definition = input.layoutDefinitions.getById(input.layoutId);
  if (!definition) {
    return { ok: false as const, issue: new Error(`Unknown layout "${input.layoutId}".`) };
  }

  try {
    const action = createLayoutInsertAction(definition);
    const node = editor.schema.nodeFromJSON(input.contentOverride ?? action.content());
    node.check();
    const issue = action.validateNode?.(node);
    return issue ? { ok: false as const, issue } : { ok: true as const, node };
  } catch (issue) {
    return { ok: false as const, issue };
  }
}

function createLayoutContractEditor(
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  layoutAuthoringViews: LayoutAuthoringViewRegistry,
  editorExtensions: readonly AnyExtension[] = [],
): Editor {
  const LayoutContractNode = createLayoutNode({
    addNodeView: () =>
      createLayoutAuthoringNodeView(layoutDefinitions, layoutAuthoringViews, blockDefinitions),
  });
  const SectionContractNode = createSectionNode({
    addNodeView: () =>
      createSectionAuthoringNodeView(layoutDefinitions, layoutAuthoringViews, blockDefinitions),
  });

  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      createScaffoldInteractionOwnerExtension(blockDefinitions),
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutContractNode,
      SectionContractNode,
      ...editorExtensions,
    ],
  });
}
