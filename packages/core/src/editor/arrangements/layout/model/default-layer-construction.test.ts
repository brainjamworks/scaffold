import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { getSchema, type JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import {
  validateLayerContext,
  validateLayerIdentities,
} from "@/document/model/layers/layer-validation";
import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { createGridCell, createGridTemplate } from "@/editor/arrangements/grid/model/grid-model";
import { accordionLayoutDefinition } from "@/editor/arrangements/layout/accordion/accordion-definition";
import { paginatedLayoutDefinition } from "@/editor/arrangements/layout/paginated/paginated-definition";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";

const composition = createCoreScaffoldAuthoringComposition();
const schema = getSchema(createCourseDocumentAuthoringExtensions({ editable: true, composition }));

const constructionCases = [
  {
    label: "Grid JSON insertion",
    create: () => gridInsertAction.content(),
    slotType: "cell",
    slotCount: 2,
  },
  {
    label: "Grid ProseMirror template",
    create: () => requireNode(createGridTemplate(schema, { columns: 2 }), "grid").toJSON(),
    slotType: "cell",
    slotCount: 2,
  },
  {
    label: "Tabs",
    create: () =>
      tabsLayoutDefinition.createContent({
        options: { tabs: 2, labels: ["Overview", "Practice"] },
      }),
    slotType: "section",
    slotCount: 2,
  },
  {
    label: "Paginated",
    create: () => paginatedLayoutDefinition.createContent({ options: { pages: 2 } }),
    slotType: "section",
    slotCount: 2,
  },
  {
    label: "Accordion",
    create: () =>
      accordionLayoutDefinition.createContent({
        options: { sections: 2, labels: ["Before class", "After class"] },
      }),
    slotType: "accordion_section_panel",
    slotCount: 2,
  },
] as const;

describe("Grid and Layout default Layer construction", () => {
  it.each(constructionCases)(
    "$label creates fresh owner slots with one valid blank Layer",
    ({ create, label, slotCount, slotType }) => {
      const first = create();
      const second = create();
      const firstDocument = candidateDocument(first);

      expect(() => firstDocument.check(), label).not.toThrow();
      expect(validateLayerIdentities(firstDocument), label).toEqual([]);
      expect(
        validateLayerContext({
          document: firstDocument,
          blockDefinitions: composition.capabilities.blocks.registry,
          layoutDefinitions: composition.capabilities.layouts.registry,
        }),
        label,
      ).toEqual([]);

      const firstSlots = findNodes(first, slotType);
      const secondSlots = findNodes(second, slotType);
      expect(firstSlots, label).toHaveLength(slotCount);
      expect(secondSlots, label).toHaveLength(slotCount);

      for (const slot of [...firstSlots, ...secondSlots]) {
        EmbeddedNodeIdSchema.parse(slot.attrs?.["id"]);
        expect(slot.content, label).toHaveLength(1);
        expectBlankLayer(slot.content?.[0], label);
      }

      const firstIds = collectIds(first);
      const secondIds = collectIds(second);
      expect(new Set(firstIds).size, label).toBe(firstIds.length);
      expect(new Set(secondIds).size, label).toBe(secondIds.length);
      expect(
        firstIds.some((id) => secondIds.includes(id)),
        label,
      ).toBe(false);
    },
  );

  it("keeps feature-owned labels, roles, options, and Accordion structure outside Layers", () => {
    const tabs = tabsLayoutDefinition.createContent({
      options: { variant: "pills", label: "Lesson sections", tabs: 2, labels: ["A", "B"] },
    });
    const paginated = paginatedLayoutDefinition.createContent({ options: { pages: 2 } });
    const accordion = accordionLayoutDefinition.createContent({
      options: {
        variant: "borderless",
        allowMultiple: true,
        label: "Topics",
        sections: 2,
        labels: ["Before", "After"],
      },
    });

    expect(findNodes(tabs, "section").map((section) => section.attrs)).toEqual([
      expect.objectContaining({ role: "tab-panel", label: "A", options: { label: "A" } }),
      expect.objectContaining({ role: "tab-panel", label: "B", options: { label: "B" } }),
    ]);
    expect(findNodes(paginated, "section").map((section) => section.attrs)).toEqual([
      expect.objectContaining({ role: "page", label: "Page 1" }),
      expect.objectContaining({ role: "page", label: "Page 2" }),
    ]);
    expect(accordion.attrs?.["options"]).toEqual({
      variant: "borderless",
      allowMultiple: true,
      label: "Topics",
    });
    expect(findNodes(accordion, "section").map((section) => section.attrs?.["options"])).toEqual([
      { defaultOpen: true },
      { defaultOpen: false },
    ]);
    expect(
      findNodes(accordion, "accordion_section_title").map((title) => textContent(title)),
    ).toEqual(["Before", "After"]);
    expect(
      findNodes(accordion, "section").map((section) => section.content?.map((child) => child.type)),
    ).toEqual([
      ["accordion_section_title", "accordion_section_panel"],
      ["accordion_section_title", "accordion_section_panel"],
    ]);
  });

  it("preserves supplied Cell content and descendant identity while rejecting direct nested Grids", () => {
    const paragraphId = createEmbeddedNodeId();
    const paragraph = schema.nodeFromJSON({
      type: "paragraph",
      attrs: { id: paragraphId },
      content: [{ type: "text", text: "Authored content" }],
    });
    const cell = requireNode(createGridCell(schema, Fragment.from(paragraph)), "cell");
    const grid = requireNode(createGridTemplate(schema, { columns: 2 }), "grid");

    expect(cell.firstChild?.type.name).toBe(LAYER_NODE_TYPE);
    expect(cell.firstChild?.childCount).toBe(1);
    expect(cell.firstChild?.firstChild?.attrs["id"]).toBe(paragraphId);
    expect(cell.firstChild?.firstChild?.textContent).toBe("Authored content");
    expect(createGridCell(schema, grid)).toBeNull();
    expect(createGridCell(schema, Fragment.fromArray([paragraph, grid]))).toBeNull();
  });
});

function candidateDocument(content: JSONContent): ProseMirrorNode {
  const regionId = createEmbeddedNodeId();
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          {
            type: "surface",
            attrs: { id: createEmbeddedNodeId(), variant: "slide-content" },
            content: [
              {
                type: "region",
                attrs: { id: regionId, role: "main" },
                content: [createLayerWithContent([content])],
              },
            ],
          },
        ],
      },
    ],
  });
}

function expectBlankLayer(layer: JSONContent | undefined, label: string): void {
  expect(layer?.type, label).toBe(LAYER_NODE_TYPE);
  expect(layer?.content, label).toHaveLength(1);
  expect(layer?.content?.[0], label).toMatchObject({ type: "paragraph" });
  expect(layer?.content?.[0]?.content, label).toBeUndefined();
  const layerId = EmbeddedNodeIdSchema.parse(layer?.attrs?.["id"]);
  const paragraphId = EmbeddedNodeIdSchema.parse(layer?.content?.[0]?.attrs?.["id"]);
  expect(layerId, label).not.toBe(paragraphId);
}

function findNodes(root: JSONContent, type: string): JSONContent[] {
  return walk(root).filter((node) => node.type === type);
}

function walk(root: JSONContent): JSONContent[] {
  return [root, ...(root.content?.flatMap(walk) ?? [])];
}

function collectIds(root: JSONContent): string[] {
  return walk(root)
    .map((node) => node.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
}

function textContent(root: JSONContent): string {
  return walk(root)
    .map((node) => node.text ?? "")
    .join("");
}

function requireNode(node: ProseMirrorNode | null, label: string): ProseMirrorNode {
  if (!node) throw new Error(`Expected ${label} node.`);
  return node;
}
