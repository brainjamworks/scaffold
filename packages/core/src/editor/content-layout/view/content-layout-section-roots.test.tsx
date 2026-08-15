// @vitest-environment happy-dom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type LayoutCapability,
} from "@/composition/application/create-scaffold-application";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createGridAuthoringNodes } from "@/editor/arrangements/grid/authoring/grid-nodes";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { createLayoutAuthoringNodes } from "@/editor/arrangements/layout/authoring/layout-nodes";
import type {
  LayoutComponentProps,
  SectionComponentProps,
} from "@/editor/arrangements/layout/authoring/layout-view-definition";
import { createLayoutRuntimeNodes } from "@/editor/arrangements/layout/runtime/layout-nodes";
import type {
  LayoutRuntimeViewProps,
  SectionRuntimeViewProps,
} from "@/editor/arrangements/layout/runtime/layout-view-definition";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";

import { CONTENT_LAYOUT_CONTENT_ROOT_ATTR } from "./ContentLayoutNodeViewContent";

const contentRootSelector = `[${CONTENT_LAYOUT_CONTENT_ROOT_ATTR}]`;
const mountedEditors: Editor[] = [];

const coreApplication = createScaffoldApplication();

const hostLayoutDefinition = {
  id: "host-defined",
  title: "Host-defined layout",
  description: "Layout used to prove the Section content-root port.",
  icon: CircleIcon,
  createContent: () => ({
    type: "layout",
    attrs: { variant: "host-defined" },
    content: [
      {
        type: "section",
        attrs: { id: "host-section" },
        content: [{ type: "paragraph" }],
      },
    ],
  }),
  section: {
    label: "Panel",
    addLabel: "Add panel",
    create: () => ({ type: "section" }),
  },
} satisfies LayoutCapability["definition"];

const hostLayoutCapability = {
  definition: hostLayoutDefinition,
  authoringView: {
    id: hostLayoutDefinition.id,
    layout: HostLayoutAuthoringView,
    section: HostSectionAuthoringView,
  },
  runtimeView: {
    id: hostLayoutDefinition.id,
    component: HostLayoutRuntimeView,
    sectionComponent: HostSectionRuntimeView,
  },
} satisfies LayoutCapability;

const hostApplication = createScaffoldApplication({
  packs: [
    defineScaffoldExtensionPack({
      id: "content-root-host",
      layouts: [hostLayoutCapability],
    }),
  ],
});

afterEach(() => {
  cleanup();
  for (const editor of mountedEditors.splice(0)) editor.destroy();
});

describe("content-layout Layout Section roots", () => {
  it("marks exactly one root for default, Tabs, Accordion and Paginated authoring Sections", async () => {
    mountEditor({
      application: coreApplication,
      editable: true,
      content: builtInLayoutContent(),
    });

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="section"]')).not.toBeNull();
    });

    expectSectionRoots("authoring");
  });

  it("marks exactly one root for default, Tabs, Accordion and Paginated runtime Sections", async () => {
    mountEditor({
      application: coreApplication,
      editable: false,
      content: builtInLayoutContent(),
    });

    await waitFor(() => {
      expect(document.body.querySelector('[data-runtime-frame="section"]')).not.toBeNull();
    });

    expectSectionRoots("runtime");
  });

  it("lets a host-defined Layout place the factory-supplied root in authoring and runtime panels", async () => {
    mountEditor({
      application: hostApplication,
      editable: true,
      content: hostLayoutContent(),
    });

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-authoring-frame="section"][data-id="host-section"]'),
      ).not.toBeNull();
    });

    expectHostSectionRoot("authoring");

    cleanup();
    for (const editor of mountedEditors.splice(0)) editor.destroy();

    mountEditor({
      application: hostApplication,
      editable: false,
      content: hostLayoutContent(),
    });

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-runtime-frame="section"][data-id="host-section"]'),
      ).not.toBeNull();
    });

    expectHostSectionRoot("runtime");
  });
});

function expectSectionRoots(mode: "authoring" | "runtime"): void {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  const cases = [
    {
      layoutId: "layout-default",
      sectionIds: ["section-default"],
      layoutLane:
        mode === "authoring" ? ".sc-layout-authoring__content" : ".sc-layout-runtime__content",
      rootClass:
        mode === "authoring"
          ? "sc-layout-section-authoring__content"
          : "sc-layout-section-runtime__content",
    },
    {
      layoutId: "layout-tabs",
      sectionIds: ["tab-one", "tab-two"],
      layoutLane: ".sc-course-tabs__content",
      rootClass: "sc-course-tabs__panel-content",
    },
    {
      layoutId: "layout-accordion",
      sectionIds: ["accordion-one", "accordion-two"],
      layoutLane: ".sc-course-accordion__content",
      rootClass: "sc-course-accordion__panel-content",
    },
    {
      layoutId: "layout-paginated",
      sectionIds: ["page-one", "page-two"],
      layoutLane: ".sc-course-paginated__content",
      rootClass: "sc-course-paginated__page-content",
    },
  ] as const;

  for (const testCase of cases) {
    const layout = requiredElement<HTMLElement>(
      document.body,
      `[${frameAttr}="layout"][data-id="${testCase.layoutId}"]`,
    );
    const layoutLane = requiredElement<HTMLElement>(layout, testCase.layoutLane);
    expect(layoutLane.hasAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe(false);

    const sections = testCase.sectionIds.map((sectionId) =>
      requiredElement<HTMLElement>(
        document.body,
        `[${frameAttr}="section"][data-id="${sectionId}"]`,
      ),
    );

    for (const section of sections) {
      const roots = Array.from(section.querySelectorAll<HTMLElement>(contentRootSelector));
      expect(roots).toHaveLength(1);
      expect(roots[0]?.getAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe("");
      expect(roots[0]?.classList.contains(testCase.rootClass)).toBe(true);

      const nodeViewContents = Array.from(
        section.querySelectorAll<HTMLElement>("[data-node-view-content]"),
      );
      expect(nodeViewContents.filter((element) => element.matches(contentRootSelector))).toEqual(
        roots,
      );
    }

    const markedNodeViewContents = Array.from(
      layout.querySelectorAll<HTMLElement>("[data-node-view-content]"),
    ).filter((element) => element.matches(contentRootSelector));
    expect(markedNodeViewContents).toHaveLength(sections.length);

    const arrangementChrome = Array.from(
      layout.querySelectorAll<HTMLElement>(
        '[role="tablist"], [role="tab"], [data-scaffold-accordion-trigger], [data-slot="accordion-section-title"], [data-slot="accordion-section-panel"], .sc-course-accordion__title-content, .sc-course-accordion__section-content, [data-course-paginated-nav], [data-course-paginated-page], [data-layout-section-menu-trigger], [data-authoring-move-handle]',
      ),
    );
    for (const element of arrangementChrome) {
      expect(element.hasAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR)).toBe(false);
    }

    if (testCase.layoutId === "layout-tabs") {
      expectVisiblePanelState(layout, '[role="tabpanel"]', sections.length);
      expect(
        requiredElement<HTMLElement>(layout, '[role="tabpanel"] [data-bounded-scroll]'),
      ).toHaveAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR, "");
    }

    if (testCase.layoutId === "layout-accordion") {
      expectVisiblePanelState(layout, "[data-scaffold-accordion-panel]", sections.length);
      const boundedPanelContent = Array.from(
        layout.querySelectorAll<HTMLElement>(".sc-course-accordion__panel-content"),
      );
      expect(boundedPanelContent).toHaveLength(sections.length);
      for (const [index, element] of boundedPanelContent.entries()) {
        expect(element).toHaveAttribute("data-bounded-scroll", "");
        expect(element).toHaveAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR, "");
        expect(element.children).toHaveLength(1);
        expect(element.firstElementChild?.textContent).toBe(
          ["Before class content", "After class content"][index],
        );
      }

      for (const section of sections) {
        const sectionLane = requiredElement<HTMLElement>(
          section,
          ".sc-course-accordion__section-content",
        );
        const panelShell = requiredElement<HTMLElement>(
          section,
          '[data-slot="accordion-section-panel"]',
        );
        expect(sectionLane).not.toHaveAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR);
        expect(panelShell).not.toHaveAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR);
      }
    }

    if (testCase.layoutId === "layout-paginated") {
      expectVisiblePanelState(layout, '[role="region"]', sections.length);
      expect(
        requiredElement<HTMLElement>(layout, '[role="region"] [data-bounded-scroll]'),
      ).toHaveAttribute(CONTENT_LAYOUT_CONTENT_ROOT_ATTR, "");
    }
  }
}

function expectHostSectionRoot(mode: "authoring" | "runtime"): void {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  const layout = requiredElement<HTMLElement>(
    document.body,
    `[${frameAttr}="layout"][data-id="host-layout"]`,
  );
  const section = requiredElement<HTMLElement>(
    document.body,
    `[${frameAttr}="section"][data-id="host-section"]`,
  );
  const panel = requiredElement<HTMLElement>(section, "[data-host-section-panel]");
  const root = requiredElement<HTMLElement>(panel, contentRootSelector);

  expect(section.querySelectorAll(contentRootSelector)).toHaveLength(1);
  expect(root.classList.contains("host-section-content")).toBe(true);
  expect(root.parentElement).toBe(panel);
  expect(requiredElement<HTMLElement>(layout, ".host-layout-content")).not.toHaveAttribute(
    CONTENT_LAYOUT_CONTENT_ROOT_ATTR,
  );
}

function expectVisiblePanelState(
  layout: HTMLElement,
  selector: string,
  expectedCount: number,
): void {
  const panels = Array.from(layout.querySelectorAll<HTMLElement>(selector));
  expect(panels).toHaveLength(expectedCount);
  expect(panels.filter((panel) => !panel.hidden)).toHaveLength(1);
  expect(panels.filter((panel) => panel.hidden)).toHaveLength(expectedCount - 1);
}

function mountEditor({
  application,
  content,
  editable,
}: {
  application: ReturnType<typeof createScaffoldApplication>;
  content: JSONContent;
  editable: boolean;
}): Editor {
  const extensions: AnyExtension[] = [
    createTestNodeIdentityExtension(),
    createScaffoldCapabilitiesStorageExtension(application.capabilities),
    DocumentNode,
    StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
    ExtendedParagraph,
    CourseDocumentNode,
    createCourseSectionNode(),
    RegionNode,
    SurfaceNode,
    AccordionSectionTitleNode,
    AccordionSectionPanelNode,
  ];

  if (editable) {
    const gridNodes = createGridAuthoringNodes(application.capabilities.blocks.registry);
    const nodes = createLayoutAuthoringNodes({
      registry: application.capabilities.layouts.registry,
      authoringViews: application.authoring.layouts.views,
      blockDefinitions: application.capabilities.blocks.registry,
    });
    extensions.push(
      createScaffoldInteractionOwnerExtension(application.capabilities.blocks.registry),
      gridNodes.GridAuthoringNode,
      gridNodes.CellAuthoringNode,
      nodes.layoutNode,
      nodes.sectionNode,
    );
  } else {
    const nodes = createLayoutRuntimeNodes({
      registry: application.capabilities.layouts.registry,
      runtimeViews: application.runtime.layouts.views,
    });
    extensions.push(GridRuntimeNode, CellRuntimeNode, nodes.layoutNode, nodes.sectionNode);
  }

  const editor = new Editor({
    editable,
    extensions,
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "page" },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-root", variant: "page-default" },
              content: content.content ?? [],
            },
          ],
        },
      ],
    },
  });
  mountedEditors.push(editor);
  render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
  return editor;
}

function builtInLayoutContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "layout",
        attrs: { id: "layout-default" },
        content: [
          {
            type: "section",
            attrs: { id: "section-default" },
            content: [paragraph("Default content")],
          },
        ],
      },
      {
        type: "layout",
        attrs: {
          id: "layout-tabs",
          variant: "tabs",
          options: { variant: "default", label: "Lesson sections" },
        },
        content: [tabSection("tab-one", "Overview"), tabSection("tab-two", "Practice")],
      },
      {
        type: "layout",
        attrs: {
          id: "layout-accordion",
          variant: "accordion",
          options: { variant: "default", label: "Topics", allowMultiple: false },
        },
        content: [
          accordionSection("accordion-one", "Before class", true),
          accordionSection("accordion-two", "After class", false),
        ],
      },
      {
        type: "layout",
        attrs: { id: "layout-paginated", variant: "paginated" },
        content: [
          paginatedSection("page-one", "Overview"),
          paginatedSection("page-two", "Practice"),
        ],
      },
    ],
  };
}

function hostLayoutContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "layout",
        attrs: { id: "host-layout", variant: "host-defined" },
        content: [
          {
            type: "section",
            attrs: { id: "host-section" },
            content: [paragraph("Host content")],
          },
        ],
      },
    ],
  };
}

function tabSection(id: string, label: string): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "tab-panel", options: { label } },
    content: [paragraph(`${label} content`)],
  };
}

function accordionSection(id: string, label: string, defaultOpen: boolean): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "accordion-panel", options: { defaultOpen } },
    content: [
      {
        type: "accordion_section_title",
        content: [paragraph(label)],
      },
      {
        type: "accordion_section_panel",
        content: [paragraph(`${label} content`)],
      },
    ],
  };
}

function paginatedSection(id: string, label: string): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "page", options: { label } },
    content: [paragraph(`${label} content`)],
  };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function HostLayoutAuthoringView(_props: LayoutComponentProps) {
  return <NodeViewContent className="host-layout-content" />;
}

function HostSectionAuthoringView(props: SectionComponentProps) {
  return (
    <div data-host-section-panel="">
      <props.ContentRoot className="host-section-content" />
    </div>
  );
}

function HostLayoutRuntimeView(_props: LayoutRuntimeViewProps) {
  return <NodeViewContent className="host-layout-content" />;
}

function HostSectionRuntimeView(props: SectionRuntimeViewProps) {
  return (
    <div data-host-section-panel="">
      <props.ContentRoot className="host-section-content" />
    </div>
  );
}
