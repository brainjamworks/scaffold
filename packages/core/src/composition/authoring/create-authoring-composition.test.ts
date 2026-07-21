// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import { createAuthoringBlockExtensions } from "@/editor/blocks/authoring-block-extensions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockExtensions } from "@/editor/blocks/runtime-block-extensions";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  LayoutRuntimeNode,
  SectionRuntimeNode,
} from "@/editor/arrangements/layout/runtime/layout-nodes";
import { createCourseDocumentAuthoringExtensions } from "./create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";

const AUTHORING_ONLY_EXTENSION_NAMES = [
  "scaffoldInteractionOwner",
  "scaffoldStableIdPasteNormalization",
  "placeholder",
  "emptyInsertionRow",
  "surfaceRootSelectionPolicy",
  "slashCommand",
];

const DECOMMISSIONED_ACTIVATION_EXTENSION_NAMES = ["scaffoldInteractionState", "blockSelection"];

describe("createCourseDocumentAuthoringExtensions", () => {
  it("returns each extension name only once", () => {
    const extensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    const duplicates = extensionNames.filter(
      (name, index) => extensionNames.indexOf(name) !== index,
    );

    expect(duplicates).toEqual([]);
  });

  it("includes course block extensions in authoring composition", () => {
    const documentExtensionNames = new Set(
      createCourseDocumentAuthoringExtensions({ editable: true }).map(
        (extension) => extension.name,
      ),
    );

    const missingBlockNames = createAuthoringBlockExtensions(builtInBlockRegistry)
      .map((extension) => extension.name)
      .filter((name) => !documentExtensionNames.has(name));

    expect(missingBlockNames).toEqual([]);
  });

  it("includes course block extensions in runtime composition", () => {
    const runtimeExtensionNames = new Set(
      createCourseDocumentRuntimeExtensions().map((extension) => extension.name),
    );

    const missingBlockNames = createRuntimeBlockExtensions(builtInBlockRegistry)
      .map((extension) => extension.name)
      .filter((name) => !runtimeExtensionNames.has(name));

    expect(missingBlockNames).toEqual([]);
  });

  it("keeps authoring-only extensions out of runtime composition", () => {
    const runtimeExtensionNames = createCourseDocumentRuntimeExtensions()
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    expect(runtimeExtensionNames).toContain("runtimeBlockFrameAttributes");
    expect(runtimeExtensionNames).toContain("uniqueID");
    expect(runtimeExtensionNames).toContain("studentGuard");
    expect(runtimeExtensionNames).not.toContain("blockFrameAttributes");

    for (const authoringOnlyName of AUTHORING_ONLY_EXTENSION_NAMES) {
      expect(runtimeExtensionNames).not.toContain(authoringOnlyName);
    }
  });

  it("keeps runtime UniqueID non-mutating", () => {
    const runtimeUniqueId = createCourseDocumentRuntimeExtensions().find(
      (extension) => extension.name === "uniqueID",
    );
    const options = runtimeUniqueId?.options as { updateDocument?: boolean } | undefined;

    expect(options?.updateDocument).toBe(false);
  });

  it("passes built-in stable-id node types into both lane compositions", () => {
    const authoringUniqueId = createCourseDocumentAuthoringExtensions({ editable: true }).find(
      (extension) => extension.name === "uniqueID",
    );
    const runtimeUniqueId = createCourseDocumentRuntimeExtensions().find(
      (extension) => extension.name === "uniqueID",
    );

    expect(authoringUniqueId?.options["types"]).toEqual(
      expect.arrayContaining([...builtInBlockRegistry.stableIdNodeTypes]),
    );
    expect(runtimeUniqueId?.options["types"]).toEqual(
      expect.arrayContaining([...builtInBlockRegistry.stableIdNodeTypes]),
    );
  });

  it("passes built-in resizable node types into both frame extensions", () => {
    const authoringFrame = createCourseDocumentAuthoringExtensions({ editable: true }).find(
      (extension) => extension.name === "runtimeBlockFrameAttributes",
    );
    const runtimeFrame = createCourseDocumentRuntimeExtensions().find(
      (extension) => extension.name === "runtimeBlockFrameAttributes",
    );

    expect(authoringFrame?.options["resizableBlockNodeTypes"]).toEqual(
      builtInBlockRegistry.resizableNodeTypes,
    );
    expect(runtimeFrame?.options["resizableBlockNodeTypes"]).toEqual(
      builtInBlockRegistry.resizableNodeTypes,
    );
  });

  it("uses lane-specific arrangement nodes", () => {
    const runtimeExtensions = createCourseDocumentRuntimeExtensions();
    const authoringExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
    });

    expect(runtimeExtensions.find((extension) => extension.name === "grid")).toBe(GridRuntimeNode);
    expect(runtimeExtensions.find((extension) => extension.name === "cell")).toBe(CellRuntimeNode);
    expect(authoringExtensions.find((extension) => extension.name === "grid")).toBe(
      GridAuthoringNode,
    );
    expect(authoringExtensions.find((extension) => extension.name === "cell")).toBe(
      CellAuthoringNode,
    );
    expect(runtimeExtensions.find((extension) => extension.name === "layout")).toBe(
      LayoutRuntimeNode,
    );
    expect(runtimeExtensions.find((extension) => extension.name === "section")).toBe(
      SectionRuntimeNode,
    );
    expect(authoringExtensions.find((extension) => extension.name === "layout")).toBe(
      LayoutAuthoringNode,
    );
    expect(authoringExtensions.find((extension) => extension.name === "section")).toBe(
      SectionAuthoringNode,
    );
  });

  it("renders a persisted built-in layout through both lane compositions", async () => {
    const authoringEditor = new Editor({
      editable: true,
      extensions: createCourseDocumentAuthoringExtensions({ editable: true }),
      content: persistedTabsDocument("authoring"),
    });
    const runtimeEditor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions(),
      content: persistedTabsDocument("runtime"),
    });

    try {
      render(
        createElement(
          "div",
          null,
          createElement(EditorContent, { editor: authoringEditor }),
          createElement(EditorContent, { editor: runtimeEditor }),
        ),
      );

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-authoring-frame="layout"][data-definition="tabs"] .sc-tabs',
          ),
        ).not.toBeNull();
        expect(
          document.body.querySelector(
            '[data-runtime-frame="layout"][data-definition="tabs"] .sc-tabs',
          ),
        ).not.toBeNull();
      });
    } finally {
      cleanup();
      authoringEditor.destroy();
      runtimeEditor.destroy();
    }
  });

  it("constructs one lane-specific surface authoring node", () => {
    const authoringExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
    });

    expect(authoringExtensions.filter((extension) => extension.name === "surface")).toHaveLength(1);
  });

  it("adds authoring-only extensions in authoring composition", () => {
    const authoringExtensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    expect(authoringExtensionNames).not.toContain("studentGuard");

    for (const authoringOnlyName of AUTHORING_ONLY_EXTENSION_NAMES) {
      expect(authoringExtensionNames).toContain(authoringOnlyName);
    }
  });

  it("keeps the owner extension store editor-owned", () => {
    const ownerExtension = createCourseDocumentAuthoringExtensions({
      editable: true,
    }).find((extension) => extension.name === "scaffoldInteractionOwner");

    expect(ownerExtension?.options).toEqual({});
  });

  it("installs interaction ownership and no old activation extensions", () => {
    const authoringExtensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    expect(authoringExtensionNames).toContain("scaffoldInteractionOwner");

    for (const decommissionedName of DECOMMISSIONED_ACTIVATION_EXTENSION_NAMES) {
      expect(authoringExtensionNames).not.toContain(decommissionedName);
    }
  });
});

function persistedTabsDocument(lane: string) {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: `surface-${lane}`, variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: `layout-${lane}`,
                  variant: "tabs",
                  options: { variant: "default", label: `${lane} tabs` },
                },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: `section-${lane}`,
                      role: "tab-panel",
                      label: "First tab",
                      options: { label: "First tab" },
                    },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: `${lane} content` }],
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
  };
}
