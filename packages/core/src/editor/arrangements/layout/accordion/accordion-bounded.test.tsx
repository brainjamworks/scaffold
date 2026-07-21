// @vitest-environment jsdom

import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
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
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";
import { AccordionSectionPanelNode, AccordionSectionTitleNode } from "./accordion-section-nodes";

const editors: Editor[] = [];
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: builtInBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  useLayoutInteractionStore.setState({
    openAccordionSectionsByLayoutId: {},
  });
});

describe("bounded accordion authoring", () => {
  it("keeps the add affordance visible while open panels remain independent lanes", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({ editable: true, placement: "region" });
    render(createElement(EditorContent, { editor }));

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
    expect(layout?.classList.contains("sc-accordion-layout")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(accordionRoot).not.toBeNull();
    expect(accordionRoot?.parentElement).toBe(layout);
    expect(accordionRoot?.classList.contains("sc-accordion-layout--authoring")).toBe(true);
    expect(accordionRoot?.getAttribute("data-bounded-placement")).toBeNull();
    const outline = layout?.querySelector<HTMLElement>(":scope > [data-layout-outline]");
    expect(outline).not.toBeNull();
    expect(accordionRoot?.nextElementSibling).toBe(outline);
    expect(screen.getByRole("group", { name: "Topics" }).closest(".sc-accordion-layout")).toBe(
      accordionRoot,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classList.contains("sc-accordion-section")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(sectionVerticalState(editor, "accordion-a")).toEqual({ kind: "unavailable" });
    expect(
      alignmentTargetPort.setVertical(
        editor,
        { id: "accordion-a", kind: InteractionTargetKind.Section },
        "middle",
      ),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Add section" })).toBeInTheDocument();
    expect(layout?.querySelector("[data-authoring-move-handle]")).not.toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).not.toBeNull();
    expect(panelViewport(panels[0])?.getAttribute("data-bounded-viewport")).toBe("scroll");
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
    render(createElement(EditorContent, { editor }));

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
    expect(layout?.classList.contains("sc-accordion-layout")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(accordionRoot).not.toBeNull();
    expect(accordionRoot?.parentElement).toBe(layout);
    expect(accordionRoot?.classList.contains("sc-accordion-layout--authoring")).toBe(false);
    expect(accordionRoot?.getAttribute("data-bounded-placement")).toBeNull();
    expect(screen.getByRole("group", { name: "Topics" }).closest(".sc-accordion-layout")).toBe(
      accordionRoot,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classList.contains("sc-accordion-section")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
    expect(layout?.querySelector("[data-authoring-move-handle]")).toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
    expect(panelViewport(panels[0])?.getAttribute("data-bounded-viewport")).toBe("scroll");

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
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Topics" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const accordionRoot = directAccordionRoot(layout);
    const triggers = accordionTriggers();
    const panels = accordionPanels();

    expect(layout?.closest('[data-node="region"]')).toBeNull();
    expect(layout?.classList.contains("sc-accordion-layout")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(accordionRoot).not.toBeNull();
    expect(accordionRoot?.parentElement).toBe(layout);
    expect(accordionRoot?.getAttribute("data-bounded-placement")).toBeNull();
    expect(panelViewport(panels[0])?.getAttribute("data-bounded-viewport")).toBe("scroll");

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
            attrs: { id: "region-accordion" },
            content: [layout],
          },
        ]
      : [layout];
  const editor = new Editor({
    editable,
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
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
                id: "surface-accordion",
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
      id: "layout-accordion",
      variant: "accordion",
      options: {
        variant: "default",
        label: "Topics",
        allowMultiple: true,
      },
    },
    content: [
      accordionSection("accordion-a", "Before class", true),
      accordionSection("accordion-b", "After class", false),
    ],
  };
}

function accordionSection(id: string, label: string, defaultOpen: boolean): JSONContent {
  return {
    type: "section",
    attrs: {
      id,
      role: "accordion-panel",
      verticalPosition: id === "accordion-a" ? "bottom" : "top",
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
        child instanceof HTMLElement && child.classList.contains("sc-accordion-layout"),
    ) ?? null
  );
}

function panelViewport(panel: HTMLElement | undefined): HTMLElement | null {
  return panel?.querySelector<HTMLElement>(".sc-accordion-panel__content") ?? null;
}
