// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import { isRegisteredSlideCompositionSurfaceDefinition } from "../../model/slide-composition-definition";
import { builtInSurfaceVariantRegistry } from "../../model/built-in-surface-variant-definitions";
import type { SurfaceVariantRegistry } from "../../model/surface-variant-registry";
import { builtInSurfaceRuntimeViewMap } from "../surface-runtime-views";
import type { SurfaceRuntimeViewMap } from "../surface-runtime-view-registry";
import { PageDefaultSurfaceRuntimeView } from "../variants/page-default";
import { SlideCompositionSurfaceRuntimeView } from "../variants/slide-composition";
import { SlideCoverSurfaceRuntimeView } from "../variants/slide-cover";
import { SlideImageBandSurfaceRuntimeView } from "../variants/slide-image-band";
import { SlideImageCoverSurfaceRuntimeView } from "../variants/slide-image-cover";
import { SlideModuleCoverSurfaceRuntimeView } from "../variants/slide-module-cover";
import { createSurfaceRuntimeNode, resolveSurfaceRuntimeNodeView } from "./surface-runtime-node";
import { RegionNode } from "../../model/nodes/region-node";
import { SlideCoverSubtitleNode } from "../../model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "../../model/nodes/slide-title";
import {
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

describe("surface runtime node views", () => {
  it("registers built-in runtime views by surface variant", () => {
    expect(builtInSurfaceRuntimeViewMap.get("page-default")?.component).toBe(
      PageDefaultSurfaceRuntimeView,
    );
    expect(builtInSurfaceRuntimeViewMap.get("slide-cover")?.component).toBe(
      SlideCoverSurfaceRuntimeView,
    );
    expect(builtInSurfaceRuntimeViewMap.get("slide-content")?.component).toBe(
      SlideCompositionSurfaceRuntimeView,
    );
    for (const id of [
      "slide-two-columns",
      "slide-three-columns",
      "slide-two-stacked",
      "slide-side-title",
      "slide-centred-stage",
      "slide-editorial",
    ]) {
      expect(builtInSurfaceRuntimeViewMap.get(id)?.component).toBe(
        SlideCompositionSurfaceRuntimeView,
      );
    }
    expect(builtInSurfaceRuntimeViewMap.get("slide-image-cover")?.component).toBe(
      SlideImageCoverSurfaceRuntimeView,
    );
    expect(builtInSurfaceRuntimeViewMap.get("slide-image-band")?.component).toBe(
      SlideImageBandSurfaceRuntimeView,
    );
    expect(builtInSurfaceRuntimeViewMap.get("slide-module-cover")?.component).toBe(
      SlideModuleCoverSurfaceRuntimeView,
    );
  });

  it("keeps the surface presentation contract on the outer runtime NodeView", async () => {
    const editor = createEditor("slide-cover");

    try {
      render(createElement(EditorContent, { editor }));

      const outer = await waitFor(() => {
        const element = document.body.querySelector<HTMLElement>(".sc-surface-runtime-node");
        if (!element) throw new Error("expected outer runtime surface NodeView");
        return element;
      });
      const content = outer.querySelector<HTMLElement>(".sc-surface-runtime-node__content");

      expect(outer.getAttribute("data-surface")).toBe("");
      expect(outer.getAttribute("data-definition")).toBe("slide-cover");
      expect(outer.getAttribute("data-surface-variant")).toBe("slide-cover");
      expect(content?.hasAttribute("data-surface")).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-cover surface through the runtime variant view", async () => {
    const editor = createEditor("slide-cover", undefined, { verticalPosition: "bottom" });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-course-surface-node-view="runtime"][data-definition="slide-cover"]',
          ),
        ).not.toBeNull();
      });

      const surface = document.body.querySelector("[data-surface]");
      expect(surface?.getAttribute("data-surface-variant")).toBe("slide-cover");
      expect(surface?.getAttribute("data-vertical-content-position")).toBe("bottom");

      const content = document.body.querySelector(".sc-surface-runtime-node__content");
      expect(content?.classList.contains("sc-slide-cover-surface-runtime-view")).toBe(true);
      expect(content?.querySelector(".sc-slide-cover-surface-view__motif")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("preserves independent fixed-template child alignment at runtime", async () => {
    const editor = createEditor("slide-cover", undefined, undefined, [
      {
        type: "heading",
        attrs: { level: 1, textAlign: "right" },
        content: [{ type: "text", text: "Runtime right title" }],
      },
      {
        type: "slide_cover_subtitle",
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "left" },
            content: [{ type: "text", text: "Runtime left subtitle" }],
          },
        ],
      },
    ]);

    try {
      render(createElement(EditorContent, { editor }));
      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected runtime surface");
        return element;
      });
      const title = Array.from(surface.querySelectorAll("h1")).find(
        (element) => element.textContent === "Runtime right title",
      );
      const subtitle = Array.from(surface.querySelectorAll("p")).find(
        (element) => element.textContent === "Runtime left subtitle",
      );

      expect(title?.getAttribute("data-text-align")).toBe("right");
      expect(subtitle?.getAttribute("data-text-align")).toBe("left");
      expect(surface.querySelector("[data-authoring-frame]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-image-cover surface through the runtime variant view", async () => {
    const editor = createEditor(
      "slide-image-cover",
      undefined,
      {
        image: {
          imageUrl: "https://example.test/cover.png",
          imageAlt: "Cover image",
          imagePosition: "bottom-right",
        },
        imageSide: "left",
      },
      [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Image cover title" }],
        },
        { type: "slide_cover_subtitle", content: [{ type: "paragraph" }] },
      ],
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-image-cover");

      const content = document.body.querySelector(".sc-surface-runtime-node__content");
      expect(content?.classList.contains("sc-slide-image-cover-surface-runtime-view")).toBe(true);
      expect(content?.getAttribute("data-slide-image-side")).toBe("left");
      expect(content?.querySelector("h1")?.textContent).toBe("Image cover title");
      const image = content?.querySelector<HTMLImageElement>(
        '[data-slot="slide-image-cover-image"] img',
      );
      expect(image).not.toBeNull();
      expect(image?.style.objectPosition).toBe("right bottom");
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-content surface with a plain region at runtime", async () => {
    const editor = createEditor("slide-content", undefined, { slideTitle: { enabled: false } }, [
      {
        type: "slide_title",
        content: [{ type: "text", text: "Runtime title" }],
      },
      {
        type: "region",
        attrs: { id: "region-a", role: "main" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Runtime region content" }],
          },
        ],
      },
    ]);

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-content");
      expect(surface.hasAttribute("data-vertical-content-position")).toBe(false);

      const content = document.body.querySelector(".sc-surface-runtime-node__content");
      expect(content?.classList.contains("sc-slide-layout-surface-runtime-view")).toBe(true);
      expect(content?.getAttribute("data-slide-layout-variant")).toBe("slide-content");
      expect(content?.getAttribute("data-slide-layout-composition")).toBe("content");
      expect(content?.getAttribute("data-slide-layout-title")).toBe("hidden");
      expect(content?.getAttribute("data-slide-layout-regions")).toBe("main");
      expect(content?.hasAttribute("data-slide-layout-orientation")).toBe(false);
      expect(content?.hasAttribute("data-slide-layout-proportion")).toBe(false);
      expect(content?.querySelector("[data-authoring-frame]")).toBeNull();

      const headerFooter = content?.querySelector('[data-node="region"]');
      expect(headerFooter?.hasAttribute("data-region")).toBe(false);
      expect(headerFooter?.hasAttribute("data-bounded-region")).toBe(false);
      expect(headerFooter?.hasAttribute("data-region-size")).toBe(false);
      expect(headerFooter?.getAttribute("data-region-role")).toBe("main");
      expect(headerFooter?.classList.contains("sc-region")).toBe(true);
      expect(headerFooter?.classList.contains("sc-region-authoring")).toBe(false);
      expect(headerFooter?.textContent).toContain("Runtime region content");
      expect(headerFooter?.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
      expect(headerFooter?.getAttribute("data-authoring-frame")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("projects declared semantics for every Content composition at runtime", async () => {
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
      const definition = builtInSurfaceVariantRegistry.get(variant);
      if (!definition) throw new Error(`expected definition for ${variant}`);
      const created = definition.createSurface({ surfaceId: "surface-a" });
      const settings = {
        ...(created.attrs?.["settings"] as Record<string, unknown>),
        ...(title === "hidden" ? { slideTitle: { enabled: false } } : {}),
        ...(orientation ? { orientation } : {}),
        ...(proportion ? { proportion } : {}),
      };
      const editor = createEditor(variant, undefined, settings, created.content);

      try {
        render(createElement(EditorContent, { editor }));
        const content = await waitFor(() => {
          const element = document.body.querySelector(".sc-slide-layout-surface-runtime-view");
          if (!element) throw new Error("expected a rendered composition");
          return element;
        });

        expect(content.getAttribute("data-slide-layout-variant")).toBe(variant);
        expect(content.getAttribute("data-slide-layout-composition")).toBe(composition);
        expect(content.getAttribute("data-slide-layout-regions")).toBe(regions);
        expect(content.getAttribute("data-slide-layout-title")).toBe(title);
        expect(content.getAttribute("data-slide-layout-orientation") ?? undefined).toBe(
          orientation,
        );
        expect(content.getAttribute("data-slide-layout-proportion") ?? undefined).toBe(proportion);
      } finally {
        cleanup();
        editor.destroy();
      }
    }
  });

  it("renders the full-bleed image through the common surface background", async () => {
    const definition = builtInSurfaceVariantRegistry.get("slide-full-bleed-image");
    if (!definition) throw new Error("expected full-bleed image definition");
    const created = definition.createSurface({ surfaceId: "surface-a" });
    const settings = definition.settingsSchema?.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      background: {
        imageUrl: "https://example.test/runtime-overlay.png",
        imageAlt: "Runtime overlay subject",
        imagePosition: "bottom-left",
      },
    }) as Record<string, unknown>;
    const editor = createEditor(
      "slide-full-bleed-image",
      undefined,
      settings,
      created.content as Record<string, unknown>[],
    );

    try {
      render(createElement(EditorContent, { editor }));
      const surface = await waitFor(() => {
        const element = document.body.querySelector<HTMLElement>("[data-surface]");
        if (!element) throw new Error("expected runtime full-bleed surface");
        return element;
      });
      expect(surface.getAttribute("data-surface-background-image")).toBe("");
      expect(surface.style.backgroundImage).toContain("runtime-overlay.png");
      expect(surface.style.backgroundPosition).toBe("left bottom");
      expect(surface.querySelector("[data-image-role]")).toBeNull();
      expect(document.body.querySelector("button")).toBeNull();
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("renders the backdrop panel through the common surface background", async () => {
    const definition = builtInSurfaceVariantRegistry.get("slide-image-backdrop-panel");
    if (!definition) throw new Error("expected backdrop panel definition");
    const created = definition.createSurface({ surfaceId: "surface-a" });
    const settings = definition.settingsSchema?.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      background: {
        imageUrl: "https://example.test/runtime-backdrop.png",
        imageAlt: "Runtime backdrop",
        imagePosition: "bottom-left",
      },
    }) as Record<string, unknown>;
    const editor = createEditor(
      "slide-image-backdrop-panel",
      undefined,
      settings,
      created.content as Record<string, unknown>[],
    );

    try {
      render(createElement(EditorContent, { editor }));
      const surface = await waitFor(() => {
        const element = document.body.querySelector<HTMLElement>("[data-surface]");
        if (!element) throw new Error("expected runtime backdrop surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-background-image")).toBe("");
      expect(surface.style.backgroundImage).toContain("runtime-backdrop.png");
      expect(surface.querySelector("[data-image-role]")).toBeNull();
      expect(document.body.querySelector("button")).toBeNull();
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it.each(["slide-diptych", "slide-triptych"] as const)(
    "keeps ordered logical image roles in %s runtime",
    async (variant) => {
      const definition = builtInSurfaceVariantRegistry.get(variant);
      if (!definition || !isRegisteredSlideCompositionSurfaceDefinition(definition)) {
        throw new Error(`expected ${variant}`);
      }
      const created = definition.createSurface({ surfaceId: "surface-a" });
      const images = Object.fromEntries(
        definition.slideComposition.imageSlots.map((role) => [
          role,
          { imageUrl: `https://example.test/${role}.png`, imageAlt: `${role} runtime subject` },
        ]),
      );
      const settings = definition.settingsSchema.parse({
        ...(created.attrs?.["settings"] as Record<string, unknown>),
        images,
      }) as Record<string, unknown>;
      const editor = createEditor(
        variant,
        undefined,
        settings,
        created.content as Record<string, unknown>[],
      );

      try {
        render(createElement(EditorContent, { editor }));
        const slots = await waitFor(() => {
          const elements = document.body.querySelectorAll("[data-image-role]");
          if (elements.length !== definition.slideComposition.imageSlots.length) {
            throw new Error("expected every runtime gallery image slot");
          }
          return elements;
        });
        expect(Array.from(slots).map((slot) => slot.getAttribute("data-image-role"))).toEqual(
          definition.slideComposition.imageSlots,
        );
        expect(document.body.querySelector("button")).toBeNull();
      } finally {
        cleanup();
        editor.destroy();
      }
    },
  );

  it("renders a slide-image-band surface through the runtime variant view", async () => {
    const editor = createEditor(
      "slide-image-band",
      undefined,
      {
        image: {
          imageUrl: "https://example.test/band.png",
          imageAlt: "Band image",
          imagePosition: "bottom-center",
        },
      },
      [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Image band title" }],
        },
        { type: "slide_cover_subtitle", content: [{ type: "paragraph" }] },
      ],
    );

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-image-band");

      const content = document.body.querySelector(".sc-surface-runtime-node__content");
      expect(content?.classList.contains("sc-slide-image-band-surface-runtime-view")).toBe(true);
      expect(content?.getAttribute("data-slide-image")).toBe("set");
      expect(content?.querySelector("h1")?.textContent).toBe("Image band title");
      const image = content?.querySelector<HTMLImageElement>(
        '[data-slot="slide-image-band-image"] img',
      );
      expect(image).not.toBeNull();
      expect(image?.style.objectPosition).toBe("center bottom");
    } finally {
      editor.destroy();
    }
  });

  it("renders a slide-module-cover surface through the runtime variant view", async () => {
    const editor = createEditor("slide-module-cover", undefined, undefined, [
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
    ]);

    try {
      render(createElement(EditorContent, { editor }));

      const surface = await waitFor(() => {
        const element = document.body.querySelector("[data-surface]");
        if (!element) throw new Error("expected a rendered surface");
        return element;
      });

      expect(surface.getAttribute("data-surface-variant")).toBe("slide-module-cover");

      const content = document.body.querySelector(".sc-surface-runtime-node__content");
      expect(content?.classList.contains("sc-slide-module-cover-surface-runtime-view")).toBe(true);
      expect(content?.querySelectorAll('[data-slot="slide-cover-subtitle"]')).toHaveLength(3);
      expect(
        Array.from(content?.querySelectorAll('[data-slot="slide-cover-subtitle"]') ?? []).every(
          (element) => element.classList.contains("sc-field-content"),
        ),
      ).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("projects surface background attrs onto runtime surfaces", async () => {
    const editor = createEditor("slide-cover", {
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
      expect(surface.getAttribute("style")).toContain("background-color: #161D77");
      expect(surface.getAttribute("style")).toContain("https://example.test/background.png");
      expect(surface.getAttribute("style")).toContain("background-position: right bottom");
    } finally {
      editor.destroy();
    }
  });

  it("projects slide header/footer settings and slots onto runtime surfaces", async () => {
    const editor = createEditor(
      "slide-cover",
      undefined,
      {
        header: { enabled: true },
        footer: { enabled: true },
      },
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
    } finally {
      editor.destroy();
    }
  });

  it("does not register runtime fallback views for unknown variants", () => {
    expect(builtInSurfaceRuntimeViewMap.get("future-slide")).toBeUndefined();
  });

  it("throws an invariant error when the injected runtime map cannot resolve a variant", () => {
    const editor = createEditor("slide-cover");
    const surface = editor.state.doc.firstChild?.firstChild;
    expect(surface).toBeDefined();
    if (!surface) return;

    try {
      expect(() =>
        resolveSurfaceRuntimeNodeView({
          node: surface,
          registry: builtInSurfaceVariantRegistry,
          views: { get: () => undefined },
        }),
      ).toThrow(/No surface runtime view registered for surface variant "slide-cover"/);
    } finally {
      editor.destroy();
    }
  });

  it("dispatches by variant when surface instance IDs repeat", () => {
    const editor = createEditor("slide-cover");
    const original = editor.state.doc.firstChild?.firstChild;
    expect(original).toBeDefined();
    if (!original) return;

    try {
      const cover = original.type.create({
        ...original.attrs,
        id: "surface-repeat",
        variant: "slide-cover",
      });
      const content = original.type.create({
        ...original.attrs,
        id: "surface-repeat",
        variant: "slide-content",
      });

      expect(
        resolveSurfaceRuntimeNodeView({
          node: cover,
          registry: builtInSurfaceVariantRegistry,
          views: builtInSurfaceRuntimeViewMap,
        }).runtimeView.component,
      ).toBe(SlideCoverSurfaceRuntimeView);
      expect(
        resolveSurfaceRuntimeNodeView({
          node: content,
          registry: builtInSurfaceVariantRegistry,
          views: builtInSurfaceRuntimeViewMap,
        }).runtimeView.component,
      ).toBe(SlideCompositionSurfaceRuntimeView);
    } finally {
      editor.destroy();
    }
  });
});

interface SurfaceRuntimeComposition {
  registry: SurfaceVariantRegistry;
  views: SurfaceRuntimeViewMap;
}

function createEditor(
  variant: string,
  background?: Record<string, unknown>,
  settings?: Record<string, unknown>,
  surfaceContent: Record<string, unknown>[] = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Surface content" }],
    },
  ],
  surfaceComposition: SurfaceRuntimeComposition = {
    registry: builtInSurfaceVariantRegistry,
    views: builtInSurfaceRuntimeViewMap,
  },
): Editor {
  return new Editor({
    editable: false,
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
      createSurfaceRuntimeNode({
        registry: surfaceComposition.registry,
        views: surfaceComposition.views,
      }),
      RegionNode,
      SurfaceHeaderNode,
      SurfaceHeaderFooterSlotNode,
      SlideCoverSubtitleNode,
      SlideTitleNode,
      SurfaceFooterNode,
      TestArrangementNode,
      TestSectionArrangementNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: {
                id: "surface-a",
                variant,
                settings: {
                  ...(background ? { background } : {}),
                  ...(settings ?? {}),
                },
              },
              content: surfaceContent,
            },
          ],
        },
      ],
    },
  });
}
