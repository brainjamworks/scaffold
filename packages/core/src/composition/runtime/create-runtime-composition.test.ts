// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Extension, Node, getSchema } from "@tiptap/core";
import { EditorContent, NodeViewContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
  type LayoutCapability,
} from "@/composition/application/create-scaffold-application";
import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import {
  LayoutRuntimeNode,
  SectionRuntimeNode,
} from "@/editor/arrangements/layout/runtime/layout-nodes";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInBlockRuntimeBindings } from "@/editor/blocks/runtime-block-extensions";
import type { LayoutRuntimeViewProps } from "@/editor/arrangements/layout/runtime/layout-view-definition";

import { createCourseDocumentRuntimeExtensions } from "./create-runtime-composition";

const AUTHORING_ONLY_EXTENSION_NAMES = [
  "scaffoldInteractionOwner",
  "scaffoldStableIdPasteNormalization",
  "placeholder",
  "emptyInsertionRow",
  "surfaceRootSelectionPolicy",
  "slashCommand",
];

describe("createCourseDocumentRuntimeExtensions", () => {
  it("constructs one built-in runtime surface node", () => {
    const extensions = createCourseDocumentRuntimeExtensions();

    expect(extensions.filter((extension) => extension.name === "surface")).toHaveLength(1);
  });

  it("still accepts an explicit runtime surface node for isolated composition tests", () => {
    const TestRuntimeSurfaceNode = Node.create({
      name: "surface",
      group: "block",
      content: "block*",
    });

    const extensions = createCourseDocumentRuntimeExtensions({
      surfaceNode: TestRuntimeSurfaceNode,
    });

    expect(extensions.find((extension) => extension.name === "surface")).toBe(
      TestRuntimeSurfaceNode,
    );
  });

  it("includes course block extensions and no authoring-only policies", () => {
    const runtimeExtensionNames = createCourseDocumentRuntimeExtensions()
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");
    const runtimeExtensionNameSet = new Set(runtimeExtensionNames);
    const missingBlockNames = builtInBlockRuntimeBindings
      .map(({ extension }) => extension.name)
      .filter((name) => !runtimeExtensionNameSet.has(name));

    expect(missingBlockNames).toEqual([]);
    expect(runtimeExtensionNames).toContain("runtimeBlockFrameAttributes");
    expect(runtimeExtensionNames).toContain("uniqueID");
    expect(runtimeExtensionNames).toContain("studentGuard");
    expect(runtimeExtensionNames).not.toContain("blockFrameAttributes");

    for (const authoringOnlyName of AUTHORING_ONLY_EXTENSION_NAMES) {
      expect(runtimeExtensionNames).not.toContain(authoringOnlyName);
    }
  });

  it("keeps runtime identity and frame policies tied to built-in Block definitions", () => {
    const extensions = createCourseDocumentRuntimeExtensions();
    const runtimeUniqueId = extensions.find((extension) => extension.name === "uniqueID");
    const runtimeFrame = extensions.find(
      (extension) => extension.name === "runtimeBlockFrameAttributes",
    );
    const options = runtimeUniqueId?.options as { updateDocument?: boolean } | undefined;

    expect(options?.updateDocument).toBe(false);
    expect(runtimeUniqueId?.options["types"]).toEqual(
      expect.arrayContaining([...builtInBlockRegistry.stableIdNodeTypes]),
    );
    expect(runtimeFrame?.options["resizableBlockNodeTypes"]).toEqual(
      builtInBlockRegistry.resizableNodeTypes,
    );
  });

  it("uses runtime arrangement nodes", () => {
    const extensions = createCourseDocumentRuntimeExtensions();

    expect(extensions.find((extension) => extension.name === "grid")).toBe(GridRuntimeNode);
    expect(extensions.find((extension) => extension.name === "cell")).toBe(CellRuntimeNode);
    expect(extensions.filter((extension) => extension.name === "layout")).toHaveLength(1);
    expect(extensions.filter((extension) => extension.name === "section")).toHaveLength(1);
    expect(LayoutRuntimeNode.name).toBe("layout");
    expect(SectionRuntimeNode.name).toBe("section");
  });

  it("renders a persisted built-in Layout through the runtime composition", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions(),
      content: persistedTabsDocument(),
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-runtime-frame="layout"][data-definition="tabs"] .sc-tabs',
          ),
        ).not.toBeNull();
      });
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("resolves and renders a host Layout runtime view exactly once", async () => {
    const capability = hostLayoutCapability();
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-runtime-layouts",
          layouts: [capability],
        }),
      ],
    });
    const extensions = createCourseDocumentRuntimeExtensions({ composition: application.runtime });
    const editor = new Editor({
      editable: false,
      extensions,
      content: persistedHostLayoutDocument(capability.definition.id),
    });

    expect(extensions.filter((extension) => extension.name === "layout")).toHaveLength(1);
    expect(extensions.filter((extension) => extension.name === "section")).toHaveLength(1);
    expect(
      extensions.filter((extension) => extension.name === "scaffoldCapabilities"),
    ).toHaveLength(1);
    expect(getScaffoldCapabilitiesForEditor(editor)).toBe(application.capabilities);

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            `[data-testid="host-layout-runtime-view"][data-resolved-layout="${capability.definition.id}"]`,
          ),
        ).not.toBeNull();
      });
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("installs one host Block runtime bundle with resolved identity and frame metadata", () => {
    const capability = hostBlockCapability("host_runtime_tracer");
    const application = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "host-runtime-blocks", blocks: [capability] })],
    });
    const extensions = createCourseDocumentRuntimeExtensions({ composition: application.runtime });
    const schema = getSchema(extensions);
    const uniqueId = extensions.find(({ name }) => name === "uniqueID");
    const frame = extensions.find(({ name }) => name === "runtimeBlockFrameAttributes");

    expect(
      Object.keys(schema.nodes).filter((name) => name === capability.definition.nodeType),
    ).toHaveLength(1);
    expect(
      extensions.filter((extension) => extension === capability.runtimeExtension),
    ).toHaveLength(1);
    expect(extensions).not.toContain(capability.authoringExtension);
    expect(uniqueId?.options["types"]).toEqual(
      expect.arrayContaining([
        capability.definition.nodeType,
        ...capability.definition.identity!.stableChildNodeTypes!,
      ]),
    );
    expect(frame?.options["resizableBlockNodeTypes"]).toContain(capability.definition.nodeType);
  });

  it("keeps host Block registries and runtime schemas isolated between applications", () => {
    const first = hostBlockCapability("first_runtime_host_block");
    const second = hostBlockCapability("second_runtime_host_block");
    const firstApplication = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "first-runtime-host", blocks: [first] })],
    });
    const secondApplication = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "second-runtime-host", blocks: [second] })],
    });
    const firstSchema = getSchema(
      createCourseDocumentRuntimeExtensions({ composition: firstApplication.runtime }),
    );
    const secondSchema = getSchema(
      createCourseDocumentRuntimeExtensions({ composition: secondApplication.runtime }),
    );

    expect(
      firstApplication.capabilities.blocks.registry.getByNodeType(first.definition.nodeType),
    ).toBe(first.definition);
    expect(
      firstApplication.capabilities.blocks.registry.getByNodeType(second.definition.nodeType),
    ).toBeUndefined();
    expect(
      secondApplication.capabilities.blocks.registry.getByNodeType(second.definition.nodeType),
    ).toBe(second.definition);
    expect(firstSchema.nodes[first.definition.nodeType]).toBeDefined();
    expect(firstSchema.nodes[second.definition.nodeType]).toBeUndefined();
    expect(secondSchema.nodes[second.definition.nodeType]).toBeDefined();
    expect(secondSchema.nodes[first.definition.nodeType]).toBeUndefined();
  });
});

function hostBlockCapability(nodeType: string): BlockCapability {
  const childNodeType = `${nodeType}_child`;
  return {
    definition: {
      nodeType,
      identity: { stableChildNodeTypes: [childNodeType] },
      frame: { resizable: true },
    },
    authoringExtension: Extension.create({
      name: `${nodeType}_authoring_bundle`,
      addExtensions: () => [
        Node.create({ name: nodeType, group: "block", content: `${childNodeType}?` }),
        Node.create({ name: childNodeType }),
      ],
    }),
    runtimeExtension: Extension.create({
      name: `${nodeType}_runtime_bundle`,
      addExtensions: () => [
        Node.create({ name: nodeType, group: "block", content: `${childNodeType}?` }),
        Node.create({ name: childNodeType }),
      ],
    }),
  };
}

function hostLayoutCapability(): LayoutCapability {
  const id = "host-runtime-layout";
  return {
    definition: {
      id,
      title: "Host runtime layout",
      description: "Host-contributed runtime layout",
      icon: CircleIcon,
      createContent: () => ({
        type: "layout",
        attrs: { id: "layout-host-runtime", variant: id, options: {} },
        content: [
          {
            type: "section",
            attrs: { id: "section-host-runtime", options: {} },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    },
    authoringView: {
      id,
      layout: HostLayoutAuthoringView,
    },
    runtimeView: {
      id,
      component: HostLayoutRuntimeView,
    },
  };
}

function HostLayoutAuthoringView() {
  return null;
}

function HostLayoutRuntimeView({ runtimeView }: LayoutRuntimeViewProps) {
  return createElement(
    "div",
    {
      "data-testid": "host-layout-runtime-view",
      "data-resolved-layout": runtimeView?.id,
    },
    createElement(NodeViewContent),
  );
}

function persistedTabsDocument() {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-runtime", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layout-runtime",
                  variant: "tabs",
                  options: { variant: "default", label: "runtime tabs" },
                },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: "section-runtime",
                      role: "tab-panel",
                      label: "First tab",
                      options: { label: "First tab" },
                    },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "runtime content" }],
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

function persistedHostLayoutDocument(variant: string) {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-host-runtime", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layout-host-runtime",
                  variant,
                  options: {},
                },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: "section-host-runtime",
                      options: {},
                    },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Host runtime content" }],
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
