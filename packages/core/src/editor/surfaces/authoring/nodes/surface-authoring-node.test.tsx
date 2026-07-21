// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import { PageDefaultSurfaceAuthoringView } from "../variants/page-default";
import { SlideCompositionSurfaceAuthoringView } from "../variants/slide-composition";
import { SlideCoverSurfaceAuthoringView } from "../variants/slide-cover";
import { SlideImageBandSurfaceAuthoringView } from "../variants/slide-image-band";
import { SlideImageCoverSurfaceAuthoringView } from "../variants/slide-image-cover";
import { SlideModuleCoverSurfaceAuthoringView } from "../variants/slide-module-cover";
import {
  createSurfaceAuthoringViewMap,
  type SurfaceAuthoringViewMap,
  type SurfaceAuthoringViewProps,
} from "../surface-authoring-view-registry";
import {
  builtInSurfaceAuthoringViewMap,
  deriveSurfaceImageControls,
} from "../surface-authoring-views";
import { isRegisteredSlideCompositionSurfaceDefinition } from "../../model/slide-composition-definition";
import {
  createSurfaceVariantRegistry,
  type SurfaceVariantRegistry,
} from "../../model/surface-variant-registry";
import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import {
  createSurfaceAuthoringNode,
  resolveSurfaceAuthoringNodeView,
} from "./surface-authoring-node";
import { RegionAuthoringNode } from "./region-authoring-node";
import { SlideCoverSubtitleNode } from "../../model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "../../model/nodes/slide-title";
import {
  createEmptySurfaceHeaderFooterNode,
  SurfaceFooterNode,
  SurfaceHeaderNode,
  SurfaceHeaderFooterSlotNode,
} from "../../model/nodes/header-footer-slots";

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

const TestSectionArrangementNode = Node.create({
  name: "testSectionArrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

const TEST_ALIGNABLE_BLOCK = "region_alignment_test_block";

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  defineBlock({ nodeType: TEST_ALIGNABLE_BLOCK, frame: { resizable: true } }),
]);
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: testBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

const TestAlignableBlockNode = Node.create({
  name: TEST_ALIGNABLE_BLOCK,
  group: "block",
  content: "paragraph+",
  addAttributes() {
    return {
      frame: { default: null },
      id: { default: null },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-test-alignable-block": node.attrs["id"],
        "data-test-frame-align": normalizeBlockFrame(node.attrs["frame"]).align,
      },
      0,
    ];
  },
});

describe("surface authoring node views", () => {
  it("resolves the variant definition once at the NodeView boundary and passes it downward", async () => {
    const registry = createSurfaceVariantRegistry([
      {
        id: "test-authoring-surface",
        modes: ["page"],
        defaultForModes: ["page"],
        title: "Test authoring surface",
        description: "Test authoring surface",
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: "test-authoring-surface", settings: {} },
          content: [{ type: "paragraph" }],
        }),
      },
    ]);
    const views = createSurfaceAuthoringViewMap({
      registry,
      bindings: [{ variantId: "test-authoring-surface", component: DefinitionProbeSurfaceView }],
    });
    const editor = createEditor("test-authoring-surface", undefined, "page", undefined, undefined, {
      registry,
      views,
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector("[data-surface]")?.getAttribute("data-probe-definition"),
        ).toBe("test-authoring-surface");
      });
    } finally {
      editor.destroy();
    }
  });

  it("dispatches repeated variants independently of their surface instance IDs", async () => {
    const editor = createEditor(
      "slide-cover",
      undefined,
      "slideshow",
      undefined,
      undefined,
      undefined,
      ["surface-a", "surface-b"],
    );

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        const surfaces = document.body.querySelectorAll('[data-surface-variant="slide-cover"]');
        expect(Array.from(surfaces, (surface) => surface.getAttribute("data-id"))).toEqual([
          "surface-a",
          "surface-b",
        ]);
      });
    } finally {
      editor.destroy();
    }
  });

  it("seeds explicit child alignment in fixed-template factories", () => {
    for (const variant of [
      "slide-cover",
      "slide-image-cover",
      "slide-image-band",
      "slide-module-cover",
    ]) {
      const surface = resolveBuiltInDefinition(variant)?.createSurface({ surfaceId: "surface-a" });
      if (!surface) throw new Error(`expected ${variant} definition`);

      const textBlocks = (surface.content ?? []).flatMap((child) =>
        child.type === "heading" ? [child] : (child.content ?? []),
      );
      expect(textBlocks.length).toBeGreaterThan(0);
      expect(textBlocks.map((node) => node.attrs?.["textAlign"])).toEqual(
        Array.from({ length: textBlocks.length }, () => "left"),
      );
    }
  });

  it("seeds header and footer paragraph alignment from each slot position", () => {
    const editor = createEditor("slide-cover", undefined, "slideshow");

    try {
      const header = createEmptySurfaceHeaderFooterNode(editor.schema, "surface_header");
      expect(header).not.toBeNull();
      expect(
        Array.from(
          { length: header?.childCount ?? 0 },
          (_, index) => header?.child(index).firstChild?.attrs["textAlign"],
        ),
      ).toEqual(["left", "center", "right"]);
    } finally {
      editor.destroy();
    }
  });

  it("registers built-in authoring views by surface variant", () => {
    expect(resolveBuiltInAuthoringView("page-default")?.component).toBe(
      PageDefaultSurfaceAuthoringView,
    );
    expect(resolveBuiltInAuthoringView("slide-cover")?.component).toBe(
      SlideCoverSurfaceAuthoringView,
    );
    expect(resolveBuiltInAuthoringView("slide-content")?.component).toBe(
      SlideCompositionSurfaceAuthoringView,
    );
    for (const id of [
      "slide-two-columns",
      "slide-three-columns",
      "slide-two-stacked",
      "slide-side-title",
      "slide-centred-stage",
      "slide-editorial",
    ]) {
      expect(resolveBuiltInAuthoringView(id)?.component).toBe(SlideCompositionSurfaceAuthoringView);
    }
    expect(resolveBuiltInAuthoringView("slide-image-cover")?.component).toBe(
      SlideImageCoverSurfaceAuthoringView,
    );
    expect(resolveBuiltInAuthoringView("slide-image-band")?.component).toBe(
      SlideImageBandSurfaceAuthoringView,
    );
    expect(resolveBuiltInAuthoringView("slide-module-cover")?.component).toBe(
      SlideModuleCoverSurfaceAuthoringView,
    );
    expect(resolveBuiltInDefinition("page-default")?.structurePolicy?.allowRootInsertion).not.toBe(
      false,
    );
    expect(resolveBuiltInDefinition("slide-cover")?.structurePolicy?.allowRootInsertion).toBe(
      false,
    );
    expect(resolveBuiltInDefinition("slide-content")?.structurePolicy?.allowRootInsertion).toBe(
      false,
    );
    expect(resolveBuiltInDefinition("slide-image-cover")?.structurePolicy?.allowRootInsertion).toBe(
      false,
    );
    expect(resolveBuiltInDefinition("slide-image-band")?.structurePolicy?.allowRootInsertion).toBe(
      false,
    );
    expect(
      resolveBuiltInDefinition("slide-module-cover")?.structurePolicy?.allowRootInsertion,
    ).toBe(false);
  });

  it("keeps common surface controls on page and slide views", () => {
    const page = resolveBuiltInAuthoringView("page-default");
    const definition = resolveBuiltInAuthoringView("slide-cover");

    expect(definition?.quickMenu?.controls.map((control) => control.name)).toEqual([
      "background.color",
    ]);
    expect(
      definition?.settingsSheet?.sections.flatMap((section) =>
        section.fields.map((field) => field.name),
      ),
    ).toEqual(["background", "header.enabled", "footer.enabled"]);
    expect(page?.quickMenu?.controls.map((control) => control.name)).toEqual(["background.color"]);
    expect(
      page?.settingsSheet?.sections.flatMap((section) => section.fields.map((field) => field.name)),
    ).toEqual(["background", "header.enabled", "footer.enabled"]);
  });

  it("adds image-cover composition controls to the common surface controls", () => {
    const definition = resolveBuiltInAuthoringView("slide-image-cover");

    expect(definition?.quickMenu?.controls.map((control) => control.name)).toEqual([
      "background.color",
      "imageSide",
    ]);
    expect(definition?.quickMenu?.controls.at(-1)).toMatchObject({
      kind: "select",
      name: "imageSide",
      presentation: "segmented",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
    });
    expect(
      definition?.settingsSheet?.sections.flatMap((section) =>
        section.fields.map((field) => field.name),
      ),
    ).toEqual(["background", "header.enabled", "footer.enabled", "image"]);
  });

  it("derives optional title controls on content slides", () => {
    const definition = resolveBuiltInAuthoringView("slide-content");

    expect(definition?.quickMenu?.controls.map((control) => control.name)).toEqual([
      "background.color",
    ]);
    expect(
      definition?.settingsSheet?.sections.flatMap((section) =>
        section.fields.map((field) => field.name),
      ),
    ).toEqual(["background", "header.enabled", "footer.enabled", "slideTitle.enabled"]);
  });

  it.each([
    ["slide-full-bleed-image", ["background.color"]],
    ["slide-image-backdrop-panel", ["background.color", "orientation", "proportion"]],
  ] as const)("uses the common background field as %s's only image control", (variant, quick) => {
    const definition = resolveBuiltInAuthoringView(variant);

    expect(definition?.quickMenu?.controls.map((control) => control.name)).toEqual(quick);
    expect(
      definition?.settingsSheet?.sections.flatMap((section) =>
        section.fields.map((field) => field.name),
      ),
    ).toEqual(["background", "header.enabled", "footer.enabled", "slideTitle.enabled"]);
  });

  it("derives ordered standard image fields only from declared roles", () => {
    expect(deriveSurfaceImageControls({ slideComposition: { imageSlots: [] } })).toEqual([]);
    expect(
      deriveSurfaceImageControls({ slideComposition: { imageSlots: ["secondary", "primary"] } }),
    ).toMatchObject([
      {
        kind: "image",
        mediaStorage: "url",
        positioning: "crop",
        name: "images.secondary",
        label: "Secondary image",
        chooseLabel: "Choose secondary image",
        changeLabel: "Replace image",
        removeLabel: "Remove image",
      },
      {
        kind: "image",
        mediaStorage: "url",
        positioning: "crop",
        name: "images.primary",
        label: "Primary image",
        chooseLabel: "Choose primary image",
        changeLabel: "Replace image",
        removeLabel: "Remove image",
      },
    ]);
  });

  it("chooses an image for the targeted role through an image-only picker", async () => {
    const user = userEvent.setup();
    const definition = resolveBuiltInSlideCompositionDefinition("slide-diptych");
    if (!definition) throw new Error("expected diptych definition");
    const created = definition.createSurface({ surfaceId: "surface-a" });
    const editor = createEditor(
      definition.id,
      created.content,
      "slideshow",
      undefined,
      created.attrs?.["settings"] as Record<string, unknown>,
    );

    try {
      render(createElement(EditorContent, { editor }));
      await user.click(await screen.findByRole("button", { name: "Choose secondary image" }));
      await vi.dynamicImportSettled();

      const dialog = await screen.findByRole("dialog", { name: "Choose secondary image" });
      expect(within(dialog).queryByRole("button", { name: "Audio" })).toBeNull();
      expect(within(dialog).queryByRole("button", { name: "Video" })).toBeNull();

      await user.click(within(dialog).getByRole("tab", { name: "URL" }));
      await user.type(
        within(dialog).getByRole("textbox", { name: "Image URL" }),
        "https://example.test/secondary.png",
      );
      await user.click(within(dialog).getByRole("button", { name: "Use URL" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Choose secondary image" })).toBeNull();
      });
      expect(readSurfaceSettings(editor)).toMatchObject({
        images: {
          primary: {},
          secondary: { imageUrl: "https://example.test/secondary.png" },
        },
      });
    } finally {
      editor.destroy();
    }
  });

  it("derives reversible composition controls from each definition's capabilities", () => {
    const twoColumns = resolveBuiltInAuthoringView("slide-two-columns");
    const sideTitle = resolveBuiltInAuthoringView("slide-side-title");
    const editorial = resolveBuiltInAuthoringView("slide-editorial");

    expect(twoColumns?.quickMenu?.controls.slice(-2)).toMatchObject([
      {
        name: "orientation",
        options: [
          { value: "default", label: "Default" },
          { value: "reversed", label: "Reversed" },
        ],
      },
      {
        name: "proportion",
        options: [
          { value: "equal", label: "1:1" },
          { value: "one-third-two-thirds", label: "1:2" },
          { value: "two-thirds-one-third", label: "2:1" },
        ],
      },
    ]);
    expect(
      sideTitle?.settingsSheet?.sections.flatMap((section) =>
        section.fields.map((field) => field.name),
      ),
    ).not.toContain("slideTitle.enabled");
    expect(sideTitle?.quickMenu?.controls.at(-1)?.name).toBe("orientation");
    expect(sideTitle?.quickMenu?.controls.map((control) => control.name)).not.toContain(
      "proportion",
    );
    expect(editorial?.quickMenu?.controls.at(-1)).toMatchObject({
      name: "orientation",
      options: [
        { value: "default", label: "Default" },
        { value: "reversed", label: "Reversed" },
      ],
    });
    expect(editorial?.quickMenu?.controls.map((control) => control.name)).not.toContain(
      "proportion",
    );
  });

  it.each(["slide-image-cover", "slide-image-band"])(
    "keeps an empty %s heading as an aligned child in the editable content track",
    async (variant) => {
      const editor = createEditor(
        variant,
        [
          { type: "heading", attrs: { level: 1, textAlign: "left" } },
          {
            type: "slide_cover_subtitle",
            content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
          },
        ],
        "slideshow",
      );

      try {
        render(createElement(EditorContent, { editor }));
        const heading = await waitFor(() => {
          const element = document.body.querySelector("h1[data-text-align]");
          if (!element) throw new Error("expected empty heading");
          return element;
        });

        expect(heading.getAttribute("data-text-align")).toBe("left");
        expect(heading.textContent).toBe("");
        expect(heading.closest("[data-surface-content]")).not.toBeNull();
      } finally {
        editor.destroy();
      }
    },
  );

  it("adds image-band image controls to the common surface controls", () => {
    const definition = resolveBuiltInAuthoringView("slide-image-band");

    expect(definition?.quickMenu?.controls.map((control) => control.name)).toEqual([
      "background.color",
    ]);
    expect(
      definition?.settingsSheet?.sections.flatMap((section) =>
        section.fields.map((field) => field.name),
      ),
    ).toEqual(["background", "header.enabled", "footer.enabled", "image"]);
  });

  it("renders a page-default surface through the authoring variant view", async () => {
    const editor = createEditor("page-default", undefined, "page", undefined, {
      verticalPosition: "bottom",
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-course-surface-node-view="authoring"][data-definition="page-default"]',
          ),
        ).not.toBeNull();
      });

      const surface = document.body.querySelector("[data-surface]");
      expect(surface?.classList.contains("sc-surface-authoring-node__content")).toBe(true);
      expect(surface?.classList.contains("sc-page-default-surface-authoring-view")).toBe(true);
      expect(surface?.getAttribute("as")).toBeNull();
      expect(surface?.getAttribute("data-course-surface-node-view")).toBe("authoring");
      expect(surface?.getAttribute("data-authoring-frame")).toBe("surface");
      expect(surface?.getAttribute("data-surface-id")).toBe("surface-a");
      expect(surface?.getAttribute("data-surface-variant")).toBe("page-default");
      expect(surface?.hasAttribute("data-vertical-content-position")).toBe(false);
      expect(surface?.getAttribute("data-empty")).toBeNull();
      expect(surface?.querySelector("[data-surface-content]")).not.toBeNull();
      expect(
        surface?.querySelector('[data-surface-menu-trigger][aria-label="Surface options"]'),
      ).toBeNull();
      expect(surface?.classList.contains("react-renderer")).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("marks structurally empty authoring surfaces on the real surface container", async () => {
    const editor = createEditor("slide-cover", [{ type: "paragraph" }]);

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-cover");
      expect(surface.getAttribute("data-empty")).toBe("true");
      expect(surface.classList.contains("sc-surface-authoring-node__content")).toBe(true);
      expect(surface.classList.contains("sc-slide-cover-surface-authoring-view")).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-cover surface through the authoring variant view", async () => {
    const editor = createEditor("slide-cover", undefined, "slideshow", undefined, {
      verticalPosition: "bottom",
    });

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-cover");
      expect(surface.getAttribute("data-vertical-content-position")).toBe("bottom");
      expect(surface.classList.contains("sc-slide-cover-surface-authoring-view")).toBe(true);
      expect(surface.querySelector(".sc-slide-cover-surface-view__motif")).toBeNull();
      expect(
        surface.querySelector('[data-surface-menu-trigger][aria-label="Surface options"]'),
      ).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("positions a fixed-template title independently from its subtitle", async () => {
    const editor = createEditor(
      "slide-cover",
      [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "right" },
          content: [{ type: "text", text: "Right title" }],
        },
        {
          type: "slide_cover_subtitle",
          content: [
            {
              type: "paragraph",
              attrs: { textAlign: "left" },
              content: [{ type: "text", text: "Left subtitle" }],
            },
          ],
        },
      ],
      "slideshow",
    );

    try {
      render(createElement(EditorContent, { editor }));

      const title = await waitFor(() => {
        const element = textBlockFor("Right title");
        if (!element) throw new Error("expected rendered title");
        return element;
      });
      const subtitle = textBlockFor("Left subtitle");
      if (!subtitle) throw new Error("expected rendered subtitle");

      expect(title.getAttribute("data-text-align")).toBe("right");
      expect(subtitle.getAttribute("data-text-align")).toBe("left");
      expect(title.closest('[data-slot="slide-cover-subtitle"]')).toBeNull();
      expect(subtitle.closest('[data-slot="slide-cover-subtitle"]')).not.toBeNull();

      let titlePos: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "heading") return true;
        titlePos = pos;
        return false;
      });
      if (titlePos === null) throw new Error("expected title position");
      const titleNode = editor.state.doc.nodeAt(titlePos);
      if (!titleNode) throw new Error("expected title node");
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(titlePos, undefined, {
          ...titleNode.attrs,
          textAlign: "center",
        }),
      );

      await waitFor(() => {
        expect(textBlockFor("Right title")?.getAttribute("data-text-align")).toBe("center");
      });
      expect(textBlockFor("Left subtitle")?.getAttribute("data-text-align")).toBe("left");
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-image-cover surface through the authoring variant view", async () => {
    const editor = createEditor(
      "slide-image-cover",
      [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Image cover title" }],
        },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
      "slideshow",
      undefined,
      {
        image: {
          imageUrl: "https://example.test/cover.png",
          imageAlt: "Cover image",
          imagePosition: "bottom-right",
        },
        imageSide: "left",
      },
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-image-cover");
      expect(surface.getAttribute("data-slide-image-side")).toBe("left");
      expect(surface.getAttribute("data-slide-image")).toBe("set");
      expect(surface.classList.contains("sc-slide-image-cover-surface-authoring-view")).toBe(true);
      expect(surface.querySelector("h1")?.textContent).toBe("Image cover title");
      const image = surface.querySelector<HTMLImageElement>(
        '[data-slot="slide-image-cover-image"] img',
      );
      expect(image).not.toBeNull();
      expect(image?.style.objectPosition).toBe("right bottom");
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-content surface with region authoring chrome", async () => {
    const editor = createEditor(
      "slide-content",
      [
        {
          type: "slide_title",
          content: [{ type: "text", text: "Content title" }],
        },
        {
          type: "region",
          attrs: { id: "region-a", role: "main", verticalPosition: "top" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Region content" }],
            },
          ],
        },
      ],
      "slideshow",
      undefined,
      { slideTitle: { enabled: false } },
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-content");
      expect(surface.classList.contains("sc-slide-layout-surface-authoring-view")).toBe(true);
      expect(surface.getAttribute("data-slide-layout-variant")).toBe("slide-content");
      expect(surface.getAttribute("data-slide-layout-composition")).toBe("content");
      expect(surface.getAttribute("data-slide-layout-title")).toBe("hidden");
      expect(surface.getAttribute("data-slide-layout-regions")).toBe("main");
      expect(surface.hasAttribute("data-slide-layout-orientation")).toBe(false);
      expect(surface.hasAttribute("data-slide-layout-proportion")).toBe(false);

      const headerFooter = surface.querySelector('[data-node="region"]');
      expect(headerFooter?.hasAttribute("data-region")).toBe(false);
      expect(headerFooter?.hasAttribute("data-bounded-region")).toBe(false);
      expect(headerFooter?.hasAttribute("data-region-size")).toBe(false);
      expect(headerFooter?.getAttribute("data-region-role")).toBe("main");
      expect(headerFooter?.classList.contains("sc-region")).toBe(true);
      expect(headerFooter?.classList.contains("sc-region-authoring")).toBe(true);
      expect(headerFooter?.getAttribute("data-authoring-frame")).toBe("region");
      expect(headerFooter?.getAttribute("data-id")).toBe("region-a");
      expect(headerFooter?.getAttribute("data-vertical-content-position")).toBe("top");
      expect(nodeAttrsById(editor, "region-a")).toMatchObject({ verticalPosition: "top" });
      expect(headerFooter?.textContent).toContain("Region content");
      expect(
        headerFooter?.querySelector('[data-region-menu-trigger][aria-label="Region options"]'),
      ).toBeNull();
      expect(headerFooter?.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
      expect(headerFooter?.querySelector("[data-layout-outline]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("aligns Region-owned children without crossing block, Cell, or Section boundaries", async () => {
    const editor = createEditor(
      "slide-content",
      [
        {
          type: "region",
          attrs: { id: "region-a", role: "main" },
          content: [
            {
              type: "paragraph",
              attrs: { textAlign: "left" },
              content: [{ type: "text", text: "Direct content" }],
            },
            {
              type: TEST_ALIGNABLE_BLOCK,
              attrs: {
                id: "block-a",
                frame: { align: "end", widthMode: "fill", widthPercent: 100 },
              },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "left" },
                  content: [{ type: "text", text: "Block content" }],
                },
              ],
            },
            {
              type: "grid",
              attrs: { id: "grid-a", columnWidths: [1] },
              content: [
                {
                  type: "cell",
                  attrs: { id: "cell-a" },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { textAlign: "right" },
                      content: [{ type: "text", text: "Cell content" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "layout",
              attrs: { id: "layout-a" },
              content: [
                {
                  type: "section",
                  attrs: { id: "section-a" },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { textAlign: "left" },
                      content: [{ type: "text", text: "Section content" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      "slideshow",
      undefined,
      { slideTitle: { enabled: false } },
    );

    try {
      render(createElement(EditorContent, { editor }));
      const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, {
        id: "region-a",
        kind: InteractionTargetKind.Region,
      });
      if (!descriptor) throw new Error("expected Region descriptor");

      expect(alignmentTargetPort.setHorizontal(editor, descriptor.target, "center")).toBe(true);

      await waitFor(() => {
        expect(textBlockFor("Direct content")?.getAttribute("data-text-align")).toBe("center");
        expect(
          document.body
            .querySelector('[data-test-alignable-block="block-a"]')
            ?.getAttribute("data-test-frame-align"),
        ).toBe("center");
      });
      expect(textBlockFor("Block content")?.getAttribute("data-text-align")).toBe("left");
      expect(textBlockFor("Cell content")?.getAttribute("data-text-align")).toBe("right");
      expect(textBlockFor("Section content")?.getAttribute("data-text-align")).toBe("left");
    } finally {
      editor.destroy();
    }
  });

  it("projects declared semantics for every Content composition in authoring", async () => {
    const cases = [
      ["slide-content", "content", "main", "hidden", undefined, undefined],
      [
        "slide-two-columns",
        "two-columns",
        "primary secondary",
        "visible",
        "reversed",
        "one-third-two-thirds",
      ],
      ["slide-three-columns", "three-columns", "primary secondary tertiary", "hidden"],
      [
        "slide-two-stacked",
        "two-stacked",
        "primary secondary",
        "visible",
        "reversed",
        "two-thirds-one-third",
      ],
      ["slide-side-title", "side-title", "main", "required", "reversed", undefined],
      ["slide-centred-stage", "centred-stage", "main", "hidden"],
      ["slide-editorial", "editorial", "primary secondary tertiary", "hidden", "reversed"],
    ] as const;

    for (const [variant, composition, regions, title, orientation, proportion] of cases) {
      const definition = resolveBuiltInDefinition(variant);
      if (!definition) throw new Error(`expected definition for ${variant}`);
      const created = definition.createSurface({ surfaceId: "surface-a" });
      const settings = {
        ...(created.attrs?.["settings"] as Record<string, unknown>),
        ...(title === "hidden" ? { slideTitle: { enabled: false } } : {}),
        ...(orientation ? { orientation } : {}),
        ...(proportion ? { proportion } : {}),
      };
      const editor = createEditor(variant, created.content, "slideshow", undefined, settings);

      try {
        render(createElement(EditorContent, { editor }));
        const surface = await waitFor(() => {
          const element = document.body.querySelector("[data-surface]");
          if (!element) throw new Error("expected a rendered surface");
          return element;
        });

        expect(surface.getAttribute("data-slide-layout-variant")).toBe(variant);
        expect(surface.getAttribute("data-slide-layout-composition")).toBe(composition);
        expect(surface.getAttribute("data-slide-layout-regions")).toBe(regions);
        expect(surface.getAttribute("data-slide-layout-title")).toBe(title);
        expect(surface.getAttribute("data-slide-layout-orientation") ?? undefined).toBe(
          orientation,
        );
        expect(surface.getAttribute("data-slide-layout-proportion") ?? undefined).toBe(proportion);
      } finally {
        cleanup();
        editor.destroy();
      }
    }
  });

  it("renders the full-bleed image through the common surface background", async () => {
    const definition = resolveBuiltInDefinition("slide-full-bleed-image");
    if (!definition) throw new Error("expected full-bleed image definition");
    const created = definition.createSurface({ surfaceId: "surface-a" });
    const settings = definition.settingsSchema?.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      background: {
        imageUrl: "https://example.test/overlay.png",
        imageAlt: "Overlay subject",
        imagePosition: "top-right",
      },
    }) as Record<string, unknown>;
    const editor = createEditor(
      "slide-full-bleed-image",
      created.content,
      "slideshow",
      undefined,
      settings,
    );

    try {
      render(createElement(EditorContent, { editor }));
      const surface = await waitFor(() => {
        const element = document.body.querySelector<HTMLElement>("[data-surface]");
        if (!element) throw new Error("expected rendered image surface");
        return element;
      });
      expect(surface.getAttribute("data-slide-layout-composition")).toBe("full-bleed-image");
      expect(surface.getAttribute("data-slide-layout-title")).toBe("hidden");
      expect(surface.getAttribute("data-surface-background-image")).toBe("");
      expect(surface.style.backgroundImage).toContain("overlay.png");
      expect(surface.querySelector("[data-image-role]")).toBeNull();
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("renders the backdrop panel through the common surface background", async () => {
    const definition = resolveBuiltInDefinition("slide-image-backdrop-panel");
    if (!definition) throw new Error("expected backdrop panel definition");
    const created = definition.createSurface({ surfaceId: "surface-a" });
    const settings = definition.settingsSchema?.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      background: {
        imageUrl: "https://example.test/backdrop.png",
        imageAlt: "Backdrop",
        imagePosition: "top-right",
      },
    }) as Record<string, unknown>;
    const editor = createEditor(
      "slide-image-backdrop-panel",
      created.content,
      "slideshow",
      undefined,
      settings,
    );

    try {
      render(createElement(EditorContent, { editor }));
      const surface = await waitFor(() => {
        const element = document.body.querySelector<HTMLElement>("[data-surface]");
        if (!element) throw new Error("expected rendered backdrop surface");
        return element;
      });

      expect(surface.getAttribute("data-slide-layout-composition")).toBe("image-backdrop-panel");
      expect(surface.getAttribute("data-surface-background-image")).toBe("");
      expect(surface.style.backgroundImage).toContain("backdrop.png");
      expect(surface.querySelector("[data-image-role]")).toBeNull();
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it.each(["slide-diptych", "slide-triptych"] as const)(
    "keeps ordered logical image roles in %s authoring",
    async (variant) => {
      const definition = resolveBuiltInSlideCompositionDefinition(variant);
      if (!definition) throw new Error(`expected ${variant}`);
      const created = definition.createSurface({ surfaceId: "surface-a" });
      const images = Object.fromEntries(
        definition.slideComposition.imageSlots.map((role) => [
          role,
          { imageUrl: `https://example.test/${role}.png`, imageAlt: `${role} subject` },
        ]),
      );
      const settings = definition.settingsSchema.parse({
        ...(created.attrs?.["settings"] as Record<string, unknown>),
        images,
      }) as Record<string, unknown>;
      const editor = createEditor(variant, created.content, "slideshow", undefined, settings);

      try {
        render(createElement(EditorContent, { editor }));
        const slots = await waitFor(() => {
          const elements = document.body.querySelectorAll("[data-image-role]");
          if (elements.length !== definition.slideComposition.imageSlots.length) {
            throw new Error("expected every gallery image slot");
          }
          return elements;
        });
        expect(Array.from(slots).map((slot) => slot.getAttribute("data-image-role"))).toEqual(
          definition.slideComposition.imageSlots,
        );
        expect(
          Array.from(slots).map((slot) => slot.querySelector("img")?.getAttribute("alt")),
        ).toEqual(definition.slideComposition.imageSlots.map((role) => `${role} subject`));
      } finally {
        cleanup();
        editor.destroy();
      }
    },
  );

  it("renders a slide-image-band surface through the authoring variant view", async () => {
    const editor = createEditor(
      "slide-image-band",
      [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Image band title" }],
        },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
      "slideshow",
      undefined,
      {
        image: {
          imageUrl: "https://example.test/band.png",
          imageAlt: "Band image",
          imagePosition: "bottom-center",
        },
      },
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-image-band");
      expect(surface.getAttribute("data-slide-image")).toBe("set");
      expect(surface.classList.contains("sc-slide-image-band-surface-authoring-view")).toBe(true);
      expect(surface.querySelector("h1")?.textContent).toBe("Image band title");
      const image = surface.querySelector<HTMLImageElement>(
        '[data-slot="slide-image-band-image"] img',
      );
      expect(image).not.toBeNull();
      expect(image?.style.objectPosition).toBe("center bottom");
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-module-cover surface through the authoring variant view", async () => {
    const editor = createEditor(
      "slide-module-cover",
      [
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
      "slideshow",
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-module-cover");
      expect(surface.classList.contains("sc-slide-module-cover-surface-authoring-view")).toBe(true);
      expect(surface.querySelectorAll('[data-slot="slide-cover-subtitle"]')).toHaveLength(3);
      expect(
        Array.from(surface.querySelectorAll('[data-slot="slide-cover-subtitle"]')).every(
          (element) => element.classList.contains("sc-field-content"),
        ),
      ).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("projects surface background attrs onto authoring surfaces", async () => {
    const editor = createEditor("slide-cover", undefined, "slideshow", {
      color: "#161D77",
      imageUrl: "https://example.test/background.png",
      imagePosition: "bottom-right",
    });

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector<HTMLElement>("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-background-color")).toBe("#161D77");
      expect(surface.getAttribute("data-surface-background-image")).toBe("");
      expect(surface.style.backgroundColor).toBe("#161D77");
      expect(surface.style.backgroundImage).toContain("https://example.test/background.png");
      expect(surface.style.backgroundPosition).toBe("right bottom");
    } finally {
      editor.destroy();
    }
  });

  it("projects slide header/footer settings onto authoring surfaces", async () => {
    const editor = createEditor(
      "slide-cover",
      [
        {
          type: "surface_header",
          content: [
            {
              type: "surface_header_footer_slot",
              attrs: { position: "left" },
              content: [{ type: "paragraph" }],
            },
            {
              type: "surface_header_footer_slot",
              attrs: { position: "center" },
              content: [{ type: "paragraph" }],
            },
            {
              type: "surface_header_footer_slot",
              attrs: { position: "right" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 1 },
        },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
        {
          type: "surface_footer",
          content: [
            {
              type: "surface_header_footer_slot",
              attrs: { position: "left" },
              content: [{ type: "paragraph" }],
            },
            {
              type: "surface_header_footer_slot",
              attrs: { position: "center" },
              content: [{ type: "paragraph" }],
            },
            {
              type: "surface_header_footer_slot",
              attrs: { position: "right" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
      "slideshow",
      undefined,
      {
        header: { enabled: true },
        footer: { enabled: true },
      },
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-header")).toBe("on");
      expect(surface.getAttribute("data-surface-footer")).toBe("on");
      expect(surface.querySelector('[data-slot="surface-header"]')).not.toBeNull();
      expect(surface.querySelector('[data-slot="surface-footer"]')).not.toBeNull();
      expect(
        surface.querySelectorAll('[data-slot="surface-header"] [data-header-footer-slot]'),
      ).toHaveLength(3);
      expect(
        surface.querySelectorAll('[data-slot="surface-footer"] [data-header-footer-slot]'),
      ).toHaveLength(3);
      expect(
        Array.from(surface.querySelectorAll("[data-header-footer-slot]")).every((element) =>
          element.classList.contains("sc-field-content"),
        ),
      ).toBe(true);
      expect(
        surface.querySelector(
          '[data-slot="surface-header"] [data-header-footer-slot-position="left"]',
        ),
      ).not.toBeNull();
      expect(
        surface.querySelector(
          '[data-slot="surface-header"] [data-header-footer-slot-position="center"]',
        ),
      ).not.toBeNull();
      expect(
        surface.querySelector(
          '[data-slot="surface-header"] [data-header-footer-slot-position="right"]',
        ),
      ).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("renders default surface actions for slide-cover slideshow surfaces", async () => {
    const editor = createEditor("slide-cover", undefined, "slideshow");

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-cover");
      expect(
        surface.querySelector('[data-surface-menu-trigger][aria-label="Surface options"]'),
      ).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("throws an invariant error when the injected authoring map cannot resolve a variant", () => {
    const editor = createEditor("slide-cover");
    const surface = editor.state.doc.firstChild?.firstChild;
    expect(surface).toBeDefined();
    if (!surface) return;

    try {
      expect(() =>
        resolveSurfaceAuthoringNodeView({
          node: surface,
          registry: builtInSurfaceVariantRegistry,
          views: { get: () => undefined },
        }),
      ).toThrow(/No surface authoring view registered for surface variant "slide-cover"/);
    } finally {
      editor.destroy();
    }
  });
});

function DefinitionProbeSurfaceView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      attributes={{ "data-probe-definition": props.definition.id }}
    />
  );
}

interface SurfaceAuthoringComposition {
  registry: SurfaceVariantRegistry;
  views: SurfaceAuthoringViewMap;
}

function createEditor(
  variant: string,
  surfaceContent: JSONContent[] = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Surface content" }],
    },
  ],
  mode: "page" | "slideshow" = "page",
  background?: Record<string, unknown>,
  settings?: Record<string, unknown>,
  surfaceComposition: SurfaceAuthoringComposition = {
    registry: builtInSurfaceVariantRegistry,
    views: builtInSurfaceAuthoringViewMap,
  },
  surfaceIds: readonly string[] = ["surface-a"],
): Editor {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      createScaffoldTextAlignExtension(["paragraph", "heading", "slide_title"]),
      CourseDocumentNode,
      createSurfaceAuthoringNode({
        registry: surfaceComposition.registry,
        views: surfaceComposition.views,
      }),
      RegionAuthoringNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      SurfaceHeaderNode,
      SurfaceHeaderFooterSlotNode,
      SlideCoverSubtitleNode,
      SlideTitleNode,
      SurfaceFooterNode,
      TestArrangementNode,
      TestSectionArrangementNode,
      TestAlignableBlockNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode },
          content: surfaceIds.map((surfaceId) => ({
            type: "surface",
            attrs: {
              id: surfaceId,
              variant,
              settings: {
                ...(background ? { background } : {}),
                ...(settings ?? {}),
              },
            },
            content: surfaceContent,
          })),
        },
      ],
    },
  });
}

function resolveBuiltInAuthoringView(variantId: string) {
  return builtInSurfaceAuthoringViewMap.get(variantId);
}

function resolveBuiltInDefinition(variantId: string) {
  return builtInSurfaceVariantRegistry.get(variantId);
}

function resolveBuiltInSlideCompositionDefinition(variantId: string) {
  const definition = resolveBuiltInDefinition(variantId);
  return definition && isRegisteredSlideCompositionSurfaceDefinition(definition)
    ? definition
    : undefined;
}

function textBlockFor(text: string): Element | undefined {
  return Array.from(document.body.querySelectorAll("p, h1, h2, h3")).find(
    (element) => element.textContent === text,
  );
}

function nodeAttrsById(editor: Editor, id: string): Record<string, unknown> | undefined {
  let attrs: Record<string, unknown> | undefined;
  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] !== id) return true;
    attrs = { ...node.attrs };
    return false;
  });
  return attrs;
}

function readSurfaceSettings(editor: Editor): Record<string, unknown> {
  const courseDocument = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = courseDocument?.content?.[0] as JSONContent | undefined;
  return (surface?.attrs?.["settings"] as Record<string, unknown>) ?? {};
}
