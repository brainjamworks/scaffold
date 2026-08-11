// @vitest-environment jsdom

import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  LayoutRuntimeNode,
  SectionRuntimeNode,
} from "@/editor/arrangements/layout/runtime/layout-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createTestNodeIdentityExtension } from "@/editor/testing";

import { AccordionSectionPanelNode, AccordionSectionTitleNode } from "./accordion-section-nodes";

const editors: Editor[] = [];
const coreCapabilities = Object.freeze({
  blocks: Object.freeze({ registry: builtInBlockRegistry }),
  layouts: Object.freeze({ registry: builtInLayoutRegistry }),
  surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
});
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: builtInLayoutRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

function renderEditorContent(editor: Editor) {
  return render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
}

describe("bounded accordion authoring", () => {
  it("keeps the add affordance visible while open panels remain independent lanes", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({ editable: true, placement: "region" });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Topics" })).toBeInTheDocument();
    });

    const layout = layoutFrame("authoring");
    const accordionRoot = directAccordionRoot(layout);
    const triggers = accordionTriggers();
    const panels = accordionPanels();
    const sections = sectionFrames("authoring");

    expect(layout?.closest('[data-node="region"]')).not.toBeNull();
    expect(layout?.classList.contains("sc-layout-frame")).toBe(true);
    expect(layout?.classList.contains("sc-layout-frame--authoring")).toBe(true);
    expect(layout?.classList.contains("sc-course-accordion")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(accordionRoot).not.toBeNull();
    expect(accordionRoot?.parentElement).toBe(layout);
    expect(accordionRoot?.classList.contains("sc-course-accordion--authoring")).toBe(true);
    expect(accordionRoot?.getAttribute("data-bounded-placement")).toBeNull();
    const outline = layout?.querySelector<HTMLElement>(":scope > [data-layout-outline]");
    expect(outline).not.toBeNull();
    expect(accordionRoot?.nextElementSibling).toBe(outline);
    expect(screen.getByRole("group", { name: "Topics" }).closest(".sc-course-accordion")).toBe(
      accordionRoot,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classList.contains("sc-course-accordion__section")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(sectionVerticalState(editor, "accordion001")).toEqual({ kind: "unavailable" });
    expect(
      alignmentTargetPort.setVertical(
        editor,
        { id: "accordion001", kind: InteractionTargetKind.Section },
        "middle",
      ),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Add section" })).toBeInTheDocument();
    expect(layout?.querySelector("[data-authoring-move-handle]")).not.toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).not.toBeNull();
    expect(layout?.querySelector(".sc-app-structure-movement-handle--bare")).not.toBeNull();
    expect(layout?.querySelector(".sc-app-compact-movement-handle")).not.toBeNull();
    expect(layout?.querySelector(".sc-course-layout-chrome__move")).toBeNull();
    expect(layout?.querySelector(".sc-course-layout-chrome__options")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Add section" })
        .classList.contains("sc-course-layout-chrome__add"),
    ).toBe(true);
    expect(triggers[0]?.getAttribute("aria-label")).toBe("Before class");
    expect(fireEvent.mouseDown(triggers[0]!)).toBe(false);
    expect(panelViewport(panels[0])?.hasAttribute("data-bounded-scroll")).toBe(true);
    expect(panels[0]?.querySelector("[data-bounded-scroll-frame]")).not.toBeNull();
    expect(panels[0]?.querySelector("[data-bounded-scroll-hint]")?.textContent).toBe(
      "Scroll for more ↓",
    );
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[1]?.hidden).toBe(true);

    await user.click(triggers[1]!);

    await waitFor(() => {
      expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
      expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
      expect(panels[0]?.hidden).toBe(false);
      expect(panels[1]?.hidden).toBe(false);
    });
  });
});

describe("bounded accordion runtime", () => {
  it("renders terminal panel lanes without authoring controls", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({ editable: false, placement: "region" });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Topics" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const accordionRoot = directAccordionRoot(layout);
    const triggers = accordionTriggers();
    const panels = accordionPanels();
    const sections = sectionFrames("runtime");

    expect(layout?.closest('[data-node="region"]')).not.toBeNull();
    expect(layout?.classList.contains("sc-layout-frame")).toBe(true);
    expect(layout?.classList.contains("sc-layout-frame--runtime")).toBe(true);
    expect(layout?.classList.contains("sc-course-accordion")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(accordionRoot).not.toBeNull();
    expect(accordionRoot?.parentElement).toBe(layout);
    expect(accordionRoot?.classList.contains("sc-course-accordion--authoring")).toBe(false);
    expect(accordionRoot?.getAttribute("data-bounded-placement")).toBeNull();
    expect(screen.getByRole("group", { name: "Topics" }).closest(".sc-course-accordion")).toBe(
      accordionRoot,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classList.contains("sc-course-accordion__section")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
    expect(layout?.querySelector("[data-authoring-move-handle]")).toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
    expect(triggers[0]?.getAttribute("aria-label")).toBe("Before class");
    expect(fireEvent.mouseDown(triggers[0]!)).toBe(true);
    expect(panelViewport(panels[0])?.hasAttribute("data-bounded-scroll")).toBe(true);
    expect(panels[0]?.querySelector("[data-bounded-scroll-frame]")).not.toBeNull();
    expect(panels[0]?.querySelector("[data-bounded-scroll-hint]")?.textContent).toBe(
      "Scroll for more ↓",
    );

    await user.click(triggers[1]!);

    await waitFor(() => {
      expect(panels[0]?.hidden).toBe(false);
      expect(panels[1]?.hidden).toBe(false);
    });
  });
});

describe("page-flow accordion", () => {
  it("preserves natural disclosure behavior outside a finite region", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({ editable: false, placement: "surface" });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Topics" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const accordionRoot = directAccordionRoot(layout);
    const triggers = accordionTriggers();
    const panels = accordionPanels();

    expect(layout?.closest('[data-node="region"]')).toBeNull();
    expect(layout?.classList.contains("sc-course-accordion")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(accordionRoot).not.toBeNull();
    expect(accordionRoot?.parentElement).toBe(layout);
    expect(accordionRoot?.getAttribute("data-bounded-placement")).toBeNull();
    expect(panelViewport(panels[0])?.hasAttribute("data-bounded-scroll")).toBe(true);

    await user.click(triggers[1]!);

    await waitFor(() => {
      expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
      expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
      expect(panels[0]?.hidden).toBe(false);
      expect(panels[1]?.hidden).toBe(false);
    });
  });
});

function makeEditor({
  editable,
  placement,
}: {
  editable: boolean;
  placement: "region" | "surface";
}): Editor {
  const arrangementExtensions: AnyExtension[] = editable
    ? [
        createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
        GridAuthoringNode,
        CellAuthoringNode,
        LayoutAuthoringNode,
        SectionAuthoringNode,
      ]
    : [GridRuntimeNode, CellRuntimeNode, LayoutRuntimeNode, SectionRuntimeNode];
  const layout = accordionContent();
  const surfaceContent =
    placement === "region"
      ? [
          {
            type: "region",
            attrs: { id: "regionAcc001" },
            content: [layout],
          },
        ]
      : [layout];
  const editor = new Editor({
    editable,
    extensions: [
      createTestNodeIdentityExtension(),
      createScaffoldCapabilitiesStorageExtension(coreCapabilities),
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      ...arrangementExtensions,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: placement === "region" ? "slideshow" : "page" },
          content: [
            {
              type: "surface",
              attrs: {
                id: "surfaceAcc01",
                variant: placement === "region" ? "slide-content" : "page-default",
              },
              content: surfaceContent,
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function accordionContent(): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: "layoutAcc001",
      variant: "accordion",
      options: {
        variant: "default",
        label: "Topics",
        allowMultiple: true,
      },
    },
    content: [
      accordionSection("accordion001", "Before class", true),
      accordionSection("accordion002", "After class", false),
    ],
  };
}

function accordionSection(id: string, label: string, defaultOpen: boolean): JSONContent {
  return {
    type: "section",
    attrs: {
      id,
      role: "accordion-panel",
      verticalPosition: id === "accordion001" ? "bottom" : "top",
      options: { defaultOpen },
    },
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

function sectionVerticalState(editor: Editor, id: string) {
  const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, {
    id,
    kind: InteractionTargetKind.Section,
  });
  if (!descriptor) throw new Error(`Missing Section ${id}`);
  return alignmentTargetPort.snapshot(editor.state, descriptor).vertical;
}

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function accordionTriggers(): HTMLButtonElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("[data-scaffold-accordion-trigger]"),
  );
}

function accordionPanels(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>("[data-scaffold-accordion-panel]"));
}

function layoutFrame(mode: "authoring" | "runtime"): HTMLElement | null {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  return document.body.querySelector<HTMLElement>(
    `[${frameAttr}="layout"][data-definition="accordion"]`,
  );
}

function sectionFrames(mode: "authoring" | "runtime"): HTMLElement[] {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(
      `[${frameAttr}="section"][data-definition="accordion"]`,
    ),
  );
}

function directAccordionRoot(layout: HTMLElement | null): HTMLElement | null {
  return (
    Array.from(layout?.children ?? []).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("sc-course-accordion"),
    ) ?? null
  );
}

function panelViewport(panel: HTMLElement | undefined): HTMLElement | null {
  return panel?.querySelector<HTMLElement>(".sc-course-accordion__panel-content") ?? null;
}
