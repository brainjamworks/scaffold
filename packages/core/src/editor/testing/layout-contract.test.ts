// @vitest-environment happy-dom

import { CheckSquareIcon } from "@phosphor-icons/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  builtInLayoutDefinitions,
  builtInLayoutRegistry,
} from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  createLayoutInsertAction,
  type LayoutDefinition,
} from "@/editor/arrangements/layout/model/layout-definition";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { createLayoutAuthoringViewRegistry } from "@/editor/arrangements/layout/authoring/layout-view-registry";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { defineConfiguration } from "@/editor/configuration/definition";
import { builtInNonBlockInsertActions } from "@/editor/insertion/built-in-non-block-inserts";
import { describeLayoutContract } from "@/editor/testing";
import { assertLayoutContract } from "@/editor/testing/layout-contract";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { DefaultLayoutContent } from "@/editor/arrangements/layout/authoring/default-layout-content";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";

const TestLayoutOptionsSchema = z.object({
  label: z.string().default(""),
});

const TestSectionOptionsSchema = z.object({
  label: z.string().default(""),
});

const testContractLayoutDefinition = {
  id: "test-contract-layout",
  title: "Contract layout",
  description: "A layout used by contract harness tests",
  icon: CheckSquareIcon,
  configuration: defineConfiguration({
    attr: "options",
    schema: TestLayoutOptionsSchema,
    controls: [],
  }),
  section: {
    label: "section",
    addLabel: "Add section",
    configuration: defineConfiguration({
      attr: "options",
      schema: TestSectionOptionsSchema,
      controls: [],
    }),
    create: ({ index }) => ({
      type: "section",
      attrs: {
        id: index === 0 ? "AbCdEf123_--" : "BcDeFg234_--",
        label: `Section ${index + 1}`,
        options: { label: `Section ${index + 1}` },
      },
      content: [{ type: "paragraph" }],
    }),
  },
  createContent: () => ({
    type: "layout",
    attrs: {
      id: "LmNoPq123_--",
      variant: "test-contract-layout",
      options: { label: "Contract layout" },
    },
    content: [
      {
        type: "section",
        attrs: {
          id: "AbCdEf123_--",
          label: "Section 1",
          options: { label: "Section 1" },
        },
        content: [{ type: "paragraph" }],
      },
    ],
  }),
} satisfies LayoutDefinition;

const testContractLayoutRegistry = createLayoutRegistry([testContractLayoutDefinition]);
const testContractLayoutAuthoringViewRegistry = createLayoutAuthoringViewRegistry(
  testContractLayoutRegistry,
  [{ id: testContractLayoutDefinition.id, layout: DefaultLayoutContent }],
);

describeLayoutContract({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: testContractLayoutRegistry,
  layoutAuthoringViews: testContractLayoutAuthoringViewRegistry,
  layoutId: "test-contract-layout",
  expectsLayoutConfiguration: true,
  expectsSectionConfiguration: true,
});

describe("layout contract assertions", () => {
  it("keeps custom contract definitions isolated from other registries", () => {
    const secondRegistry = createLayoutRegistry(builtInLayoutDefinitions);

    expect(testContractLayoutRegistry.getById(testContractLayoutDefinition.id)).toBeDefined();
    expect(secondRegistry.getById(testContractLayoutDefinition.id)).toBeUndefined();
    expect(builtInLayoutRegistry.getById(testContractLayoutDefinition.id)).toBeUndefined();
  });

  it("reports layout stable id violations", () => {
    expect(() =>
      assertLayoutContract({
        blockDefinitions: builtInBlockRegistry,
        layoutDefinitions: testContractLayoutRegistry,
        layoutAuthoringViews: testContractLayoutAuthoringViewRegistry,
        layoutId: "test-contract-layout",
        contentOverride: {
          type: "layout",
          attrs: {
            id: "not-an-opaque-stable-id",
            variant: "test-contract-layout",
          },
          content: [
            {
              type: "section",
              attrs: { id: "AbCdEf123_--" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      }),
    ).toThrow(/stable id/i);
  });

  it("renders explicit authoring frames for every registered layout", async () => {
    const definitions = builtInLayoutRegistry.definitions;

    for (const definition of definitions) {
      const editor = createUniversalLayoutContractEditor();
      try {
        const action = createLayoutInsertAction(definition);
        const node = editor.schema.nodeFromJSON(action.content());
        node.check();

        const layoutId = node.attrs["id"];
        expect(layoutId, definition.id).toEqual(expect.any(String));

        const sectionIds: string[] = [];
        node.forEach((child) => {
          if (child.type.name !== "section") return;
          if (typeof child.attrs["id"] === "string") {
            sectionIds.push(child.attrs["id"]);
          }
        });
        expect(sectionIds.length, definition.id).toBeGreaterThan(0);

        editor.commands.setContent({
          type: "doc",
          content: [
            {
              type: "courseDocument",
              attrs: { mode: "page" },
              content: [
                {
                  type: "surface",
                  attrs: { id: `surface-${definition.id}` },
                  content: [node.toJSON()],
                },
              ],
            },
          ],
        });
        render(createElement(EditorContent, { editor }));

        await waitFor(() => {
          const layoutSurface = document.body.querySelector<HTMLElement>(
            `[${AUTHORING_FRAME_ATTR}="layout"][data-id="${layoutId}"]`,
          );

          expect(layoutSurface, definition.id).not.toBeNull();
          expect(layoutSurface?.getAttribute("data-node"), definition.id).toBe("layout");

          for (const sectionId of sectionIds) {
            const sectionSurface = document.body.querySelector<HTMLElement>(
              `[${AUTHORING_FRAME_ATTR}="section"][data-id="${sectionId}"]`,
            );

            expect(sectionSurface, `${definition.id}:${sectionId}`).not.toBeNull();
            expect(sectionSurface?.getAttribute("data-node"), `${definition.id}:${sectionId}`).toBe(
              "section",
            );
          }
        });
      } finally {
        cleanup();
        editor.destroy();
      }
    }
  });

  it("derives the built-in layout actions explicitly", () => {
    expect(
      builtInNonBlockInsertActions
        .filter((action) => action.nodeType === "layout")
        .map((action) => action.id),
    ).toEqual(builtInLayoutDefinitions.map((definition) => definition.id));
  });
});

function createUniversalLayoutContractEditor(): Editor {
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
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
    ],
  });
}
