// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { TabsIcon as Tabs } from "@phosphor-icons/react";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
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
                  id: "surface-runtime-layout",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layout-runtime-tabs",
                      variant: "tabs",
                      options: { variant: "default", label: "Runtime tabs" },
                    },
                    content: [
                      runtimeTabSection("section-runtime-a", "First tab"),
                      runtimeTabSection("section-runtime-b", "Second tab"),
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
      const panelElement = sectionElement?.querySelector(".sc-tabs__panel");

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
                  id: "surface-runtime-bounded-layout",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layout-runtime-bounded",
                      variant: "test-bounded-runtime-layout",
                    },
                    content: [runtimeTabSection("section-runtime-bounded", "Bounded")],
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

  it("keeps process-flow runtime configuration on variant-owned elements", async () => {
    const editor = new Editor({
      editable: false,
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
                attrs: {
                  id: "surface-runtime-process-flow",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layout-runtime-process-flow",
                      variant: "process-flow",
                      options: {
                        orientation: "vertical",
                        showConnectors: true,
                        showNumbers: true,
                      },
                    },
                    content: [
                      runtimeProcessFlowSection("process-flow-a", "Step one"),
                      runtimeProcessFlowSection("process-flow-b", "Step two"),
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
          document.body.querySelector('[data-node="layout"][data-definition="process-flow"]'),
        ).not.toBeNull();
      });

      const layoutElement = document.body.querySelector(
        '[data-node="layout"][data-definition="process-flow"]',
      );
      const surfaceElement = layoutElement?.querySelector(":scope > .sc-process-flow");
      const sectionElements = Array.from(
        document.body.querySelectorAll('[data-node="section"][data-definition="process-flow"]'),
      );
      const trackElement = layoutElement?.querySelector(".sc-process-flow__track");
      const contentElements = Array.from(
        layoutElement?.querySelectorAll(".sc-process-flow__content") ?? [],
      );

      expect(layoutElement?.getAttribute("data-runtime-frame")).toBe("layout");
      expect(layoutElement?.classList.contains("sc-process-flow")).toBe(false);
      expect(surfaceElement).not.toBeNull();
      expect(layoutElement?.getAttribute("data-orientation")).toBeNull();
      expect(layoutElement?.getAttribute("data-show-connectors")).toBeNull();
      expect(layoutElement?.getAttribute("data-show-numbers")).toBeNull();
      expect(trackElement?.getAttribute("data-orientation")).toBe("vertical");
      expect(trackElement?.getAttribute("data-show-connectors")).toBe("true");
      expect(trackElement?.getAttribute("data-show-numbers")).toBe("true");
      expect(sectionElements[0]?.getAttribute("data-is-last")).toBeNull();
      expect(sectionElements[1]?.getAttribute("data-is-last")).toBeNull();
      expect(contentElements[0]?.getAttribute("data-is-last")).toBeNull();
      expect(contentElements[1]?.getAttribute("data-is-last")).toBe("true");
    } finally {
      editor.destroy();
    }
  });

  it("dispatches accordion and paginated variants to their runtime views", async () => {
    const editor = new Editor({
      editable: false,
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
                attrs: { id: "surface-runtime-variants", variant: "page-default" },
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
        expect(document.body.querySelector(".sc-accordion-layout")).not.toBeNull();
        expect(document.body.querySelector(".sc-paginated-layout")).not.toBeNull();
      });

      expect(document.body.querySelector(".sc-accordion-section")).not.toBeNull();
      expect(document.body.querySelector(".sc-paginated-layout__section")).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("uses the generic runtime fallback for an unknown persisted variant", async () => {
    const editor = new Editor({
      editable: false,
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
                attrs: { id: "surface-runtime-unknown", variant: "page-default" },
                content: [
                  {
                    type: "layout",
                    attrs: { id: "layout-runtime-unknown", variant: "persisted-unknown" },
                    content: [
                      {
                        type: "section",
                        attrs: { id: "section-runtime-unknown" },
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
      expect(document.body.querySelector(".sc-tabs, .sc-accordion-layout")).toBeNull();
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

function runtimeProcessFlowSection(id: string, text: string) {
  return {
    type: "section",
    attrs: {
      id,
      role: "flow-step",
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}
