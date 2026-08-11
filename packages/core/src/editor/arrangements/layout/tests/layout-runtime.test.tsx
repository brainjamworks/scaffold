// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { TabsIcon as Tabs } from "@phosphor-icons/react";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";

import { builtInLayoutDefinitions } from "../model/built-in-layout-definitions";
import { builtInLayoutRuntimeViews } from "../runtime/built-in-layout-views";
import type { LayoutDefinition } from "../model/layout-definition";
import { createLayoutRegistry } from "../model/layout-registry";
import { createLayoutRuntimeViewRegistry } from "../runtime/layout-view-registry";
import { createLayoutNode, createSectionNode } from "../model/layout-nodes";
import {
  createLayoutRuntimeNodeView,
  createSectionRuntimeNodeView,
} from "../runtime/layout-node-views";
import { LayoutRuntimeNode, SectionRuntimeNode } from "../runtime/layout-nodes";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "../accordion/accordion-section-nodes";
import { accordionLayoutDefinition } from "../accordion/accordion-definition";
import { paginatedLayoutDefinition } from "../paginated/paginated-definition";
import { createTestNodeIdentityExtension } from "@/editor/testing";

const boundedRuntimeLayoutDefinition = {
  id: "test-bounded-runtime-layout",
  title: "Bounded runtime layout",
  description: "Runtime layout fixture that opts into bounded fill placement",
  icon: Tabs,
  boundedPlacement: "fill",
  createContent: () => ({
    type: "layout",
    attrs: { variant: "test-bounded-runtime-layout" },
    content: [{ type: "section" }],
  }),
} satisfies LayoutDefinition;

const testLayoutRegistry = createLayoutRegistry([
  ...builtInLayoutDefinitions,
  boundedRuntimeLayoutDefinition,
]);
const testLayoutRuntimeViewRegistry = createLayoutRuntimeViewRegistry(testLayoutRegistry, [
  ...builtInLayoutRuntimeViews,
  { id: boundedRuntimeLayoutDefinition.id },
]);
const TestLayoutRuntimeNode = createLayoutNode({
  addNodeView: () => createLayoutRuntimeNodeView(testLayoutRegistry, testLayoutRuntimeViewRegistry),
});
const TestSectionRuntimeNode = createSectionNode({
  addNodeView: () =>
    createSectionRuntimeNodeView(testLayoutRegistry, testLayoutRuntimeViewRegistry),
});

describe("layout runtime nodes", () => {
  it("renders built-in layouts without authoring chrome", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        createTestNodeIdentityExtension(),
        DocumentNode,
        StarterKit.configure({
          document: false,
          undoRedo: false,
          paragraph: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        createCourseSectionNode(),
        SurfaceNode,
        RegionNode,
        GridRuntimeNode,
        CellRuntimeNode,
        TestLayoutRuntimeNode,
        TestSectionRuntimeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surfaceRun01",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layoutRun001",
                      variant: "tabs",
                      options: { variant: "default", label: "Runtime tabs" },
                    },
                    content: [
                      runtimeTabSection("sectionRun01", "First tab"),
                      runtimeTabSection("sectionRun02", "Second tab"),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector('[data-node="layout"][data-definition="tabs"]'),
        ).not.toBeNull();
      });

      const layoutElement = document.body.querySelector(
        '[data-node="layout"][data-definition="tabs"]',
      );
      const sectionElement = document.body.querySelector(
        '[data-node="section"][data-definition="tabs"]',
      );
      const panelElement = sectionElement?.querySelector(".sc-course-tabs__panel");

      expect(layoutElement?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(layoutElement?.getAttribute("data-runtime-frame")).toBe("layout");
      expect(layoutElement?.getAttribute("data-state")).toBeNull();
      expect(sectionElement?.getAttribute("data-runtime-frame")).toBe("section");
      expect(sectionElement?.getAttribute("data-state")).toBeNull();
      expect(panelElement?.getAttribute("data-state")).toBe("active");
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
      expect(document.body.querySelector("[data-authoring-frame]")).toBeNull();
      expect(document.body.querySelector("[data-layout-menu-trigger]")).toBeNull();
      expect(document.body.querySelector("[data-layout-add-ghost]")).toBeNull();
      expect(document.body.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
      expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("emits bounded placement on layout runtime frames when the definition opts in", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        createTestNodeIdentityExtension(),
        DocumentNode,
        StarterKit.configure({
          document: false,
          undoRedo: false,
          paragraph: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        createCourseSectionNode(),
        SurfaceNode,
        RegionNode,
        GridRuntimeNode,
        CellRuntimeNode,
        TestLayoutRuntimeNode,
        TestSectionRuntimeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surfaceRun02",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layoutRun002",
                      variant: "test-bounded-runtime-layout",
                    },
                    content: [runtimeTabSection("sectionRun03", "Bounded")],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-node="layout"][data-definition="test-bounded-runtime-layout"]',
          ),
        ).not.toBeNull();
      });

      const layoutElement = document.body.querySelector(
        '[data-node="layout"][data-definition="test-bounded-runtime-layout"]',
      );

      expect(layoutElement?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(layoutElement?.getAttribute("data-runtime-frame")).toBe("layout");
    } finally {
      editor.destroy();
    }
  });

  it("dispatches accordion and paginated variants to their runtime views", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        createTestNodeIdentityExtension(),
        DocumentNode,
        StarterKit.configure({
          document: false,
          undoRedo: false,
          paragraph: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        createCourseSectionNode(),
        SurfaceNode,
        RegionNode,
        GridRuntimeNode,
        CellRuntimeNode,
        LayoutRuntimeNode,
        SectionRuntimeNode,
        AccordionSectionTitleNode,
        AccordionSectionPanelNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: { id: "surfaceRun04", variant: "page-default" },
                content: [
                  accordionLayoutDefinition.createContent({ options: { sections: 1 } }),
                  paginatedLayoutDefinition.createContent({ options: { pages: 1 } }),
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(document.body.querySelector(".sc-course-accordion")).not.toBeNull();
        expect(document.body.querySelector(".sc-course-paginated")).not.toBeNull();
      });

      expect(document.body.querySelector(".sc-course-accordion__section")).not.toBeNull();
      expect(document.body.querySelector(".sc-course-paginated__section")).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("uses the generic runtime fallback for an unknown persisted variant", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        createTestNodeIdentityExtension(),
        DocumentNode,
        StarterKit.configure({
          document: false,
          undoRedo: false,
          paragraph: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        createCourseSectionNode(),
        SurfaceNode,
        RegionNode,
        GridRuntimeNode,
        CellRuntimeNode,
        LayoutRuntimeNode,
        SectionRuntimeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: { id: "surfaceRun05", variant: "page-default" },
                content: [
                  {
                    type: "layout",
                    attrs: { id: "layoutRun004", variant: "persisted-unknown" },
                    content: [
                      {
                        type: "section",
                        attrs: { id: "sectionRun04" },
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Unknown layout content" }],
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

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-node="layout"][data-definition="persisted-unknown"].sc-layout-runtime',
          ),
        ).not.toBeNull();
      });

      expect(document.body.textContent).toContain("Unknown layout content");
      expect(document.body.querySelector(".sc-course-tabs, .sc-course-accordion")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

function runtimeTabSection(id: string, label: string) {
  return {
    type: "section",
    attrs: {
      id,
      role: "tab-panel",
      label,
      options: { label },
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: `${label} content` }],
      },
    ],
  };
}
