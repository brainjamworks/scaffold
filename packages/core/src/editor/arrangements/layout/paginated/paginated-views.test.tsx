// @vitest-environment jsdom

import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

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
import { createEmptyInsertionRowExtension } from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
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
    activePageByLayoutId: {},
  });
});

afterAll(() => {
  restoreProperty(Range.prototype, "getClientRects", rangeClientRectsDescriptor);
  restoreProperty(Range.prototype, "getBoundingClientRect", rangeBoundingRectDescriptor);
});

describe("paginated authoring", () => {
  it("keeps the generic frame outside a direct paginated surface", async () => {
    const user = userEvent.setup();
    const editor = makeEditor(true, "region");
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    });

    const layout = layoutFrame("authoring");
    const paginatedRoot = directPaginatedRoot(layout);
    const pageButtons = pageNumberButtons();
    const panels = pagePanels();
    const sections = sectionFrames("authoring");

    expect(layout?.closest('[data-node="region"]')).not.toBeNull();
    expect(layout?.classList.contains("sc-layout-frame")).toBe(true);
    expect(layout?.classList.contains("sc-layout-frame--authoring")).toBe(true);
    expect(layout?.classList.contains("sc-paginated-layout")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(paginatedRoot).not.toBeNull();
    expect(paginatedRoot?.parentElement).toBe(layout);
    expect(paginatedRoot?.classList.contains("sc-paginated-layout--authoring")).toBe(true);
    expect(paginatedRoot?.getAttribute("data-bounded-placement")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Pages" }).closest(".sc-paginated-layout")).toBe(
      paginatedRoot,
    );
    expect(sections).toHaveLength(3);
    expect(sections[0]?.classList.contains("sc-paginated-layout__section")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("middle");
    expect(sectionVerticalState(editor, "page-a")).toEqual({ kind: "value", value: "middle" });
    expect(screen.getByRole("button", { name: "Add page" })).toBeInTheDocument();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).not.toBeNull();
    expect(pageButtons[0]?.getAttribute("aria-current")).toBe("page");
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[1]?.hidden).toBe(true);
    expect(activePageViewport(panels)?.getAttribute("data-bounded-viewport")).toBe("fill");

    await user.click(pageButtons[1]!);

    await waitFor(() => {
      expect(pageButtons[0]?.getAttribute("aria-current")).toBeNull();
      expect(pageButtons[1]?.getAttribute("aria-current")).toBe("page");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });
  });

  it("moves the empty insertion row through repeated real page activations", async () => {
    const user = userEvent.setup();
    const editor = makeEditor(true, "region");
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    });

    const pageButtons = pageNumberButtons();
    const panels = pagePanels();
    editor.commands.setTextSelection(sectionTextSelectionPos(editor, "page-a"));
    editor.view.focus();

    await waitFor(() => {
      expect(panels[0]?.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    await user.click(pageButtons[1]!);

    await waitFor(() => {
      expect(selectionSectionId(editor)).toBe("page-b");
      expect(panels[1]?.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    await user.click(pageButtons[2]!);

    await waitFor(() => {
      expect(selectionSectionId(editor)).toBe("page-c");
      expect(panels[2]?.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });
  });

  it("reveals the page that receives editor selection", async () => {
    const editor = makeEditor(true, "region");
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    });

    const pageButtons = pageNumberButtons();
    const panels = pagePanels();
    editor.commands.setTextSelection(sectionTextSelectionPos(editor, "page-c"));

    await waitFor(() => {
      expect(pageButtons[2]?.getAttribute("aria-current")).toBe("page");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[2]?.hidden).toBe(false);
    });
  });
});

describe("paginated runtime", () => {
  it("keeps page semantics inside the paginated surface without authoring controls", async () => {
    const user = userEvent.setup();
    const editor = makeEditor(false, "region");
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const paginatedRoot = directPaginatedRoot(layout);
    const pageButtons = pageNumberButtons();
    const panels = pagePanels();
    const sections = sectionFrames("runtime");

    expect(layout?.closest('[data-node="region"]')).not.toBeNull();
    expect(layout?.classList.contains("sc-layout-frame")).toBe(true);
    expect(layout?.classList.contains("sc-layout-frame--runtime")).toBe(true);
    expect(layout?.classList.contains("sc-paginated-layout")).toBe(false);
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(paginatedRoot).not.toBeNull();
    expect(paginatedRoot?.parentElement).toBe(layout);
    expect(paginatedRoot?.classList.contains("sc-paginated-layout--authoring")).toBe(false);
    expect(screen.getByRole("navigation", { name: "Pages" }).closest(".sc-paginated-layout")).toBe(
      paginatedRoot,
    );
    expect(sections).toHaveLength(3);
    expect(sections[0]?.classList.contains("sc-paginated-layout__section")).toBe(true);
    expect(sections[0]?.getAttribute("data-vertical-content-position")).toBe("middle");
    expect(screen.queryByRole("button", { name: "Add page" })).toBeNull();
    expect(layout?.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
    expect(activePageViewport(panels)?.getAttribute("data-bounded-viewport")).toBe("fill");
    expect(sectionVerticalState(editor, "page-a")).toEqual({ kind: "value", value: "middle" });

    await user.click(pageButtons[1]!);

    await waitFor(() => {
      expect(pageButtons[1]?.getAttribute("aria-current")).toBe("page");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });
  });
});

describe("page-flow paginated", () => {
  it("keeps finite geometry scoped below a region", async () => {
    const editor = makeEditor(false, "surface");
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    });

    const layout = layoutFrame("runtime");
    const paginatedRoot = directPaginatedRoot(layout);
    const panels = pagePanels();

    expect(layout?.closest('[data-node="region"]')).toBeNull();
    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(paginatedRoot).not.toBeNull();
    expect(paginatedRoot?.getAttribute("data-bounded-placement")).toBeNull();
    expect(activePageViewport(panels)?.getAttribute("data-bounded-viewport")).toBe("fill");
    expect(sectionVerticalState(editor, "page-a")).toEqual({ kind: "unavailable" });
  });
});

function makeEditor(editable: boolean, placement: "region" | "surface"): Editor {
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
                id: "surface-pages",
                variant: placement === "region" ? "slide-content" : "page-default",
              },
              content:
                placement === "region"
                  ? [
                      {
                        type: "region",
                        attrs: { id: "region-pages" },
                        content: [paginatedContent()],
                      },
                    ]
                  : [paginatedContent()],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function paginatedContent(): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: "layout-pages",
      variant: "paginated",
    },
    content: [
      paginatedPage("page-a", "Overview", "middle"),
      paginatedPage("page-b", "Practice"),
      paginatedPage("page-c", "Review"),
    ],
  };
}

function paginatedPage(id: string, label: string, verticalPosition = "top"): JSONContent {
  return {
    type: "section",
    attrs: {
      id,
      role: "page",
      verticalPosition,
      options: { label },
    },
    content: [{ type: "paragraph" }],
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

function layoutFrame(mode: "authoring" | "runtime"): HTMLElement | null {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  return document.body.querySelector<HTMLElement>(
    `[${frameAttr}="layout"][data-definition="paginated"]`,
  );
}

function sectionFrames(mode: "authoring" | "runtime"): HTMLElement[] {
  const frameAttr = mode === "authoring" ? "data-authoring-frame" : "data-runtime-frame";
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(
      `[${frameAttr}="section"][data-definition="paginated"]`,
    ),
  );
}

function directPaginatedRoot(layout: HTMLElement | null): HTMLElement | null {
  return (
    Array.from(layout?.children ?? []).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("sc-paginated-layout"),
    ) ?? null
  );
}

function pageNumberButtons(): HTMLButtonElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>(".sc-paginated-layout__page"),
  );
}

function pagePanels(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(".sc-paginated-layout__panel"));
}

function activePageViewport(panels: HTMLElement[]): HTMLElement | null {
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
