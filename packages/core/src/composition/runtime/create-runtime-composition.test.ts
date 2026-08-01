// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Extension, Node, getSchema } from "@tiptap/core";
import { EditorContent, NodeViewContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
  type LayoutCapability,
  type SurfaceCapability,
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
import type { SurfaceAuthoringViewProps } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { SurfaceRuntimeViewProps } from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { SurfaceRuntimeFrame } from "@/editor/surfaces/runtime/views/SurfaceRuntimeFrame";
import * as surfaceRuntimeNode from "@/editor/surfaces/runtime/nodes/surface-runtime-node";
import * as surfaceVariantRegistry from "@/editor/surfaces/model/surface-variant-registry";

import { createCourseDocumentRuntimeExtensions } from "./create-runtime-composition";
import type { ScaffoldRuntimeComposition } from "./scaffold-runtime-composition";

const AUTHORING_ONLY_EXTENSION_NAMES = [
  "scaffoldInteractionOwner",
  "scaffoldStableIdPasteNormalization",
  "placeholder",
  "emptyInsertionRow",
  "surfaceRootSelectionPolicy",
  "slashCommand",
];

describe("createCourseDocumentRuntimeExtensions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates built-in Surface factories when resolving the default runtime composition at call time", () => {
    const validateFactories = vi.spyOn(surfaceVariantRegistry, "validateSurfaceVariantFactories");

    createCourseDocumentRuntimeExtensions();

    expect(validateFactories).toHaveBeenCalledOnce();
    expect(validateFactories.mock.calls[0]?.[0]).not.toBe(builtInSurfaceVariantRegistry);
  });

  it("constructs one generic Surface node from an explicit runtime composition", () => {
    const capability = hostSurfaceCapability("test-runtime-surface");
    const composition: ScaffoldRuntimeComposition = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "test-runtime-surface-pack",
          surfaces: [capability],
        }),
      ],
    }).runtime;
    const createNode = vi.spyOn(surfaceRuntimeNode, "createSurfaceRuntimeNode");

    const extensions = createCourseDocumentRuntimeExtensions({ composition });

    expect(extensions.filter((extension) => extension.name === "surface")).toHaveLength(1);
    expect(Object.keys(getSchema(extensions).nodes).filter((name) => name === "surface")).toEqual([
      "surface",
    ]);
    expect(createNode).toHaveBeenCalledOnce();
    expect(createNode).toHaveBeenCalledWith({
      registry: composition.capabilities.surfaces.registry,
      views: composition.surfaces.views,
    });
  });

  it("renders a persisted host Surface through its runtime component only", async () => {
    const capability = hostSurfaceCapability("host-surface-runtime-tracer");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-surface-runtime-pack",
          surfaces: [capability],
        }),
      ],
    });
    const extensions = createCourseDocumentRuntimeExtensions({ composition: application.runtime });
    const editor = new Editor({
      editable: false,
      extensions,
      content: persistedHostSurfaceDocument(capability.definition.id),
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            `[data-host-surface-runtime="${capability.definition.id}"]`,
          ),
        ).not.toBeNull();
      });

      expect(
        document.body.querySelector(
          `[data-host-surface-authoring="${capability.definition.id}"]`,
        ),
      ).toBeNull();
    } finally {
      cleanup();
      editor.destroy();
    }
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

  it("keeps host Surface registries, views, and schemas isolated between applications", () => {
    const first = hostSurfaceCapability("first-runtime-host-surface");
    const second = hostSurfaceCapability("second-runtime-host-surface");
    const firstApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({ id: "first-runtime-surface-pack", surfaces: [first] }),
      ],
    });
    const secondApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({ id: "second-runtime-surface-pack", surfaces: [second] }),
      ],
    });
    const firstExtensions = createCourseDocumentRuntimeExtensions({
      composition: firstApplication.runtime,
    });
    const secondExtensions = createCourseDocumentRuntimeExtensions({
      composition: secondApplication.runtime,
    });
    const firstSchema = getSchema(firstExtensions);
    const secondSchema = getSchema(secondExtensions);
    const firstSurfaceNode = firstExtensions.find(({ name }) => name === "surface");
    const secondSurfaceNode = secondExtensions.find(({ name }) => name === "surface");

    expect(firstApplication.capabilities.surfaces.registry.get(first.definition.id)?.id).toBe(
      first.definition.id,
    );
    expect(
      firstApplication.capabilities.surfaces.registry.get(second.definition.id),
    ).toBeUndefined();
    expect(secondApplication.capabilities.surfaces.registry.get(second.definition.id)?.id).toBe(
      second.definition.id,
    );
    expect(
      secondApplication.capabilities.surfaces.registry.get(first.definition.id),
    ).toBeUndefined();
    expect(firstApplication.runtime.surfaces.views.get(first.definition.id)?.component).toBe(
      first.runtimeView.component,
    );
    expect(
      firstApplication.runtime.surfaces.views.get(second.definition.id),
    ).toBeUndefined();
    expect(secondApplication.runtime.surfaces.views.get(second.definition.id)?.component).toBe(
      second.runtimeView.component,
    );
    expect(
      secondApplication.runtime.surfaces.views.get(first.definition.id),
    ).toBeUndefined();
    expect(firstApplication.capabilities.surfaces.registry).not.toBe(
      secondApplication.capabilities.surfaces.registry,
    );
    expect(firstExtensions.filter(({ name }) => name === "surface")).toHaveLength(1);
    expect(secondExtensions.filter(({ name }) => name === "surface")).toHaveLength(1);
    expect(Object.keys(firstSchema.nodes).filter((name) => name === "surface")).toEqual([
      "surface",
    ]);
    expect(Object.keys(secondSchema.nodes).filter((name) => name === "surface")).toEqual([
      "surface",
    ]);
    expect(firstSurfaceNode).not.toBe(secondSurfaceNode);
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

function hostSurfaceCapability(id: string): SurfaceCapability {
  return {
    definition: {
      id,
      modes: ["page"],
      title: `Host Surface ${id}`,
      description: "Host-contributed runtime Surface",
      structurePolicy: {
        fixedChildren: [{ type: "paragraph" }],
        allowRootInsertion: true,
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [{ type: "paragraph" }],
      }),
    },
    authoringView: {
      variantId: id,
      component: HostSurfaceAuthoringView,
    },
    runtimeView: {
      variantId: id,
      component: HostSurfaceRuntimeView,
    },
  };
}

function HostSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return createElement("div", {
    "data-host-surface-authoring": props.definition.id,
  });
}

function HostSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return createElement(SurfaceRuntimeFrame, {
    ...props,
    attributes: { "data-host-surface-runtime": props.definition.id },
  });
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

function persistedHostSurfaceDocument(variant: string) {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: `surface-${variant}`, variant, settings: {} },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}
