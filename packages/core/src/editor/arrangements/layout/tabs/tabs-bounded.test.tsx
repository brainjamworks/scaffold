// @vitest-environment jsdom

import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
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
import { createEmptyInsertionRowExtension } from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { useLayoutInteractionStore } from "../shared/model/layout-interaction-store";

const editors: Editor[] = [];
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: builtInBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});
const rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
const rangeBoundingRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);

beforeAll(() => {
  const rect = DOMRect.fromRect({ height: 16, width: 80, x: 0, y: 0 });
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: {
      configurable: true,
      value: () => rect,
    },
    getClientRects: {
      configurable: true,
      value: () => [rect],
    },
  });
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  useLayoutInteractionStore.setState({
    activeTabByLayoutId: {},
  });
});

afterAll(() => {
  restoreProperty(Range.prototype, "getClientRects", rangeClientRectsDescriptor);
  restoreProperty(Range.prototype, "getBoundingClientRect", rangeBoundingRectDescriptor);
});

describe("bounded tabs authoring", () => {
  it("hands the finite region from the generic frame to the inner tabs surface", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({ editable: true, placement: "region" });
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Lesson sections" })).toBeInTheDocument();
    });

    const layout = layoutFrame("authoring");
    const tabsSurface = directTabsSurface(layout);
    const sections = sectionFrames("authoring");
    const tabs = screen.getAllByRole("tab");
    const panels = screen.getAllByRole("tabpanel", { hidden: true });

    expect(layout?.closest('[data-node="region"]')).not.toBeNull();
    expect(layout?.classList.contains("sc-layout-frame")).toBe(true);
    expect(layout?.classList.contains("sc-layout-frame--authoring")).toBe(true);
    expect(layout?.classList.contains("sc-tabs")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(tabsSurface).not.toBeNull();
    expect(tabsSurface?.getAttribute("data-bounded-placement")).toBeNull();
    expect(screen.getByRole("tablist").closest(".sc-tabs")).toBe(tabsSurface);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classList.contains("sc-tabs__panel-frame")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(sectionVerticalState(editor, "tab-a")).toEqual({ kind: "value", value: "bottom" });
    expect(activePanelViewport(panels)?.getAttribute("data-bounded-viewport")).toBe("fill");
    expect(screen.getByRole("button", { name: "Add tab" })).toBeInTheDocument();
    expect(layout?.querySelector("[data-authoring-move-handle]")).not.toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).not.toBeNull();

    await user.click(tabs[1]!);

    await waitFor(() => {
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });
  });

  it("moves the empty insertion row through repeated real tab activations", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({
      editable: true,
      layout: emptyTabsContent(),
      placement: "region",
    });
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Empty lesson sections" })).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole("tab");
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    editor.commands.setTextSelection(sectionTextSelectionPos(editor, "tab-a"));
    editor.view.focus();

    await waitFor(() => {
      expect(panels[0]?.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    await user.click(tabs[1]!);

    await waitFor(() => {
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(selectionSectionId(editor)).toBe("tab-b");
      expect(panels[1]?.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    await user.click(tabs[2]!);

    await waitFor(() => {
      expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
      expect(selectionSectionId(editor)).toBe("tab-c");
      expect(panels[2]?.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });
  });

  it("keeps the active layout frame visible while focus moves between tabs", async () => {
    const editor = makeEditor({
      editable: true,
      layout: emptyTabsContent(),
      placement: "region",
    });
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Empty lesson sections" })).toBeInTheDocument();
    });

    const layout = layoutFrame("authoring");
    const tabs = screen.getAllByRole("tab");
    const layoutPos = nodePosById(editor, "layout-empty-tabs");
    editor.view.focus();
    createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).activateStructuralTarget({
      id: "layout-empty-tabs",
      kind: InteractionTargetKind.Layout,
      pos: layoutPos,
    });

    await waitFor(() => {
      expect(layout?.hasAttribute("data-authoring-chrome-active")).toBe(true);
    });

    const transitions: Array<"activated" | "deactivated"> = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        transitions.push(mutation.oldValue === null ? "activated" : "deactivated");
      }
    });
    observer.observe(layout!, {
      attributeFilter: ["data-authoring-chrome-active"],
      attributeOldValue: true,
    });

    editor.view.dom.blur();
    act(() => {
      editor.commands.setTextSelection(sectionTextSelectionPos(editor, "tab-b"));
    });
    tabs[1]?.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();

    expect(transitions).not.toContain("deactivated");
    expect(layout?.hasAttribute("data-authoring-chrome-active")).toBe(true);
  });
});

describe("bounded tabs runtime", () => {
  it("keeps runtime semantics inside the tabs-owned surface without authoring controls", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({ editable: false, placement: "region" });
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Lesson sections" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const tabsSurface = directTabsSurface(layout);
    const sections = sectionFrames("runtime");
    const tabs = screen.getAllByRole("tab");
    const panels = screen.getAllByRole("tabpanel", { hidden: true });

    expect(layout?.closest('[data-node="region"]')).not.toBeNull();
    expect(layout?.classList.contains("sc-layout-frame")).toBe(true);
    expect(layout?.classList.contains("sc-layout-frame--runtime")).toBe(true);
    expect(layout?.classList.contains("sc-tabs")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(tabsSurface).not.toBeNull();
    expect(tabsSurface?.getAttribute("data-bounded-placement")).toBeNull();
    expect(screen.getByRole("tablist").closest(".sc-tabs")).toBe(tabsSurface);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.classList.contains("sc-tabs__panel-frame")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(activePanelViewport(panels)?.getAttribute("data-bounded-viewport")).toBe("fill");
    expect(sectionVerticalState(editor, "tab-a")).toEqual({ kind: "value", value: "bottom" });
    expect(screen.queryByRole("button", { name: "Add tab" })).toBeNull();
    expect(layout?.querySelector("[data-authoring-move-handle]")).toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).toBeNull();

    await user.click(tabs[1]!);

    await waitFor(() => {
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });
  });
});

describe("page-flow tabs", () => {
  it("keeps finite geometry markers scoped below a region", async () => {
    const editor = makeEditor({ editable: false, placement: "surface" });
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Lesson sections" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const tabsSurface = directTabsSurface(layout);
    const panels = screen.getAllByRole("tabpanel", { hidden: true });

    expect(layout?.closest('[data-node="region"]')).toBeNull();
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(layout?.classList.contains("sc-tabs")).toBe(false);
    expect(tabsSurface).not.toBeNull();
    expect(tabsSurface?.getAttribute("data-bounded-placement")).toBeNull();
    expect(activePanelViewport(panels)?.getAttribute("data-bounded-viewport")).toBe("fill");
    expect(sectionVerticalState(editor, "tab-a")).toEqual({ kind: "unavailable" });
    expect(setSectionVerticalPosition(editor, "tab-a", "middle")).toBe(false);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});

function makeEditor({
  editable,
  layout = tabsContent(),
  placement,
}: {
  editable: boolean;
  layout?: JSONContent;
  placement: "region" | "surface";
}): Editor {
  const arrangementExtensions: AnyExtension[] = editable
    ? [
        createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
        GridAuthoringNode,
        CellAuthoringNode,
        LayoutAuthoringNode,
        SectionAuthoringNode,
        createEmptyInsertionRowExtension({ surfaceVariants: builtInSurfaceVariantRegistry }),
      ]
    : [GridRuntimeNode, CellRuntimeNode, LayoutRuntimeNode, SectionRuntimeNode];
  const surfaceContent =
    placement === "region"
      ? [
          {
            type: "region",
            attrs: { id: "region-tabs" },
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
                id: "surface-tabs",
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

function tabsContent(): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: "layout-tabs",
      variant: "tabs",
      options: { variant: "default", label: "Lesson sections" },
    },
    content: [tabSection("tab-a", "Overview", "bottom"), tabSection("tab-b", "Practice")],
  };
}

function emptyTabsContent(): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: "layout-empty-tabs",
      variant: "tabs",
      options: { variant: "default", label: "Empty lesson sections" },
    },
    content: [
      emptyTabSection("tab-a", "Overview"),
      emptyTabSection("tab-b", "Practice"),
      emptyTabSection("tab-c", "Review"),
    ],
  };
}

function tabSection(id: string, label: string, verticalPosition = "top"): JSONContent {
  return {
    type: "section",
    attrs: {
      id,
      role: "tab-panel",
      verticalPosition,
      options: { label },
    },
    content: [paragraph(`${label} content`)],
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

function setSectionVerticalPosition(
  editor: Editor,
  id: string,
  value: "top" | "middle" | "bottom",
) {
  return alignmentTargetPort.setVertical(
    editor,
    { id, kind: InteractionTargetKind.Section },
    value,
  );
}

function emptyTabSection(id: string, label: string): JSONContent {
  return {
    type: "section",
    attrs: {
      id,
      role: "tab-panel",
      options: { label },
    },
    content: [{ type: "paragraph" }],
  };
}

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function layoutFrame(mode: "authoring" | "runtime"): HTMLElement | null {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  return document.body.querySelector<HTMLElement>(
    `[${frameAttr}="layout"][data-definition="tabs"]`,
  );
}

function sectionFrames(mode: "authoring" | "runtime"): HTMLElement[] {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(`[${frameAttr}="section"][data-definition="tabs"]`),
  );
}

function directTabsSurface(layout: HTMLElement | null): HTMLElement | null {
  return (
    Array.from(layout?.children ?? []).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("sc-tabs"),
    ) ?? null
  );
}

function activePanelViewport(panels: HTMLElement[]): HTMLElement | null {
  return (
    panels
      .find((panel) => !panel.hidden)
      ?.querySelector<HTMLElement>('[data-bounded-viewport="fill"]') ?? null
  );
}

function sectionTextSelectionPos(editor: Editor, sectionId: string): number {
  let selectionPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "section" && node.attrs["id"] === sectionId) {
      selectionPos = pos + 2;
      return false;
    }
    return true;
  });
  if (selectionPos === null) throw new Error(`Missing section ${sectionId}`);
  return selectionPos;
}

function selectionSectionId(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "section") {
      return typeof node.attrs["id"] === "string" ? node.attrs["id"] : null;
    }
  }
  return null;
}

function nodePosById(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`Missing node ${id}`);
  return found;
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }
  Reflect.deleteProperty(target, property);
}
