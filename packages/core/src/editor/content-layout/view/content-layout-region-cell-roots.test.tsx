// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { CELL_ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createGridAuthoringNodes } from "@/editor/arrangements/grid/authoring/grid-nodes";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";

import {
  CONTENT_LAYOUT_CONTENT_ROOT_ATTR,
  contentLayoutContentRootAttributes,
} from "./ContentLayoutNodeViewContent";

const application = createScaffoldApplication();
const { CellAuthoringNode, GridAuthoringNode } = createGridAuthoringNodes(
  application.capabilities.blocks.registry,
);

const TestDocumentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "(region | grid)+",
});

const TestCellArrangementNode = Node.create({
  name: "testCellArrangement",
  group: CELL_ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

const contentRootSelector = `[${CONTENT_LAYOUT_CONTENT_ROOT_ATTR}]`;

const mountedEditors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of mountedEditors.splice(0)) editor.destroy();
});

describe("content-layout Region and Cell content roots", () => {
  it("owns one marked bounded root per authoring Region and Cell while Grid stays unmarked", async () => {
    mountAuthoringEditor();

    await waitFor(() => {
      expect(document.body.querySelector(".sc-app-region-authoring")).not.toBeNull();
      expect(document.body.querySelector(".sc-app-grid-cell-authoring")).not.toBeNull();
    });

    const region = requiredElement<HTMLElement>(document.body, ".sc-app-region-authoring");
    const cell = requiredElement<HTMLElement>(document.body, ".sc-app-grid-cell-authoring");
    const gridContent = requiredElement<HTMLElement>(document.body, "[data-grid-column-content]");

    expect(contentLayoutContentRootAttributes()).toEqual({
      [CONTENT_LAYOUT_CONTENT_ROOT_ATTR]: "",
    });
    expectMarkedBoundedRoot(region, "sc-region__content");
    expectMarkedBoundedRoot(cell, "sc-grid-cell__content");
    expect(gridContent.hasAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe(false);
  });

  it("marks the static Region viewport and preserves its contentElement DOM relationship", async () => {
    mountRuntimeEditor();

    await waitFor(() => {
      expect(document.body.querySelector('[data-node="region"]')).not.toBeNull();
      expect(document.body.querySelector('[data-node="cell"]')).not.toBeNull();
    });

    const region = requiredElement<HTMLElement>(document.body, '[data-node="region"]');
    const cell = requiredElement<HTMLElement>(document.body, '[data-node="cell"]');
    const gridContent = requiredElement<HTMLElement>(document.body, "[data-grid-column-content]");

    expectMarkedBoundedRoot(region, "sc-region__content");
    expectMarkedBoundedRoot(cell, "sc-grid-cell__content");
    expect(gridContent.hasAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe(false);

    const regionViewport = requiredElement<HTMLElement>(
      region,
      ":scope > [data-bounded-scroll-frame] > [data-bounded-scroll]",
    );
    expect(regionViewport.hasAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe(true);
    expect(regionViewport.querySelector("p")).not.toBeNull();
  });
});

function expectMarkedBoundedRoot(owner: HTMLElement, className: string): void {
  const roots = Array.from(owner.querySelectorAll<HTMLElement>(contentRootSelector));
  expect(roots).toHaveLength(1);
  expect(owner.hasAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe(false);

  const root = roots[0];
  expect(root?.getAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe("");
  expect(root?.getAttribute("data-bounded-scroll")).toBe("");
  expect(root?.classList.contains(className)).toBe(true);

  const boundedRoots = Array.from(owner.querySelectorAll<HTMLElement>("[data-bounded-scroll]"));
  expect(boundedRoots).toHaveLength(1);
  expect(boundedRoots[0]).toBe(root);

  const frame = root?.parentElement;
  expect(frame?.getAttribute("data-bounded-scroll-frame")).toBe("");
  expect(frame?.children[0]).toBe(root);
  expect(frame?.children[1]?.getAttribute("data-bounded-scroll-hint")).toBe("");
  expect(frame?.children[1]?.textContent).toBe("Scroll for more ↓");
  expect(frame?.children).toHaveLength(2);
}

function mountAuthoringEditor(): Editor {
  const editor = new Editor({
    extensions: [
      TestDocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      createScaffoldCapabilitiesStorageExtension(application.capabilities),
      ExtendedParagraph,
      TestCellArrangementNode,
      RegionAuthoringNode,
      GridAuthoringNode,
      CellAuthoringNode,
    ],
    content: testDocumentContent(),
  });
  mountedEditors.push(editor);
  render(createElement(EditorContent, { editor }));
  return editor;
}

function mountRuntimeEditor(): Editor {
  const editor = new Editor({
    editable: false,
    extensions: [
      TestDocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      TestCellArrangementNode,
      RegionNode,
      GridRuntimeNode,
      CellRuntimeNode,
    ],
    content: testDocumentContent(),
  });
  mountedEditors.push(editor);
  render(createElement(EditorContent, { editor }));
  return editor;
}

function testDocumentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "region",
        attrs: { id: "region-root" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Region content" }] }],
      },
      {
        type: "grid",
        attrs: { id: "grid-root", columnWidths: [1] },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-root" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Cell content" }] }],
          },
        ],
      },
    ],
  };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}
