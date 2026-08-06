// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Extension, Node, getSchema } from "@tiptap/core";
import { EditorContent, NodeViewContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

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
import {
  createCoreScaffoldRuntimeComposition,
  type ScaffoldRuntimeComposition,
} from "./scaffold-runtime-composition";

const coreRuntimeComposition = createCoreScaffoldRuntimeComposition();

const AUTHORING_ONLY_EXTENSION_NAMES = [
  "scaffoldAuthoringCatalogues",
  "scaffoldInteractionOwner",
  "placeholder",
  "emptyInsertionRow",
  "surfaceRootSelectionPolicy",
  "slashCommand",
];

describe("createCourseDocumentRuntimeExtensions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires an explicit runtime composition", () => {
    type Options = NonNullable<Parameters<typeof createCourseDocumentRuntimeExtensions>[0]>;
    expectTypeOf<{} extends Pick<Options, "composition"> ? true : false>().toEqualTypeOf<false>();
  });

  it("uses the explicitly supplied Core runtime composition", () => {
    const validateFactories = vi.spyOn(surfaceVariantRegistry, "validateSurfaceVariantFactories");

    createCourseDocumentRuntimeExtensions({ composition: coreRuntimeComposition });

    expect(validateFactories).not.toHaveBeenCalled();
    expect(coreRuntimeComposition.capabilities.surfaces.registry).not.toBe(
      builtInSurfaceVariantRegistry,
    );
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

  it("registers one inert Course Section node with shared mounted identity", () => {
    const extensions = createCourseDocumentRuntimeExtensions({
      composition: coreRuntimeComposition,
    });
    const courseSectionNodes = extensions.filter(({ name }) => name === "courseSection");
    const schema = getSchema(extensions);

    expect(courseSectionNodes).toHaveLength(1);
    expect(courseSectionNodes[0]?.config.addNodeView).toBeUndefined();
    expect(Object.keys(schema.nodes).filter((name) => name === "courseSection")).toEqual([
      "courseSection",
    ]);
    expect(schema.nodes["courseSection"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["courseSection"]?.spec.attrs?.["title"]).toBeDefined();
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
          document.body.querySelector(`[data-host-surface-runtime="${capability.definition.id}"]`),
        ).not.toBeNull();
      });

      expect(
        document.body.querySelector(`[data-host-surface-authoring="${capability.definition.id}"]`),
      ).toBeNull();
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("includes course block extensions and no authoring-only policies", () => {
    const runtimeExtensionNames = createCourseDocumentRuntimeExtensions({
      composition: coreRuntimeComposition,
    })
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

  it("configures identity for every eligible mounted node without mutating runtime documents", () => {
    const extensions = createCourseDocumentRuntimeExtensions({
      composition: coreRuntimeComposition,
    });
    const runtimeUniqueId = extensions.find((extension) => extension.name === "uniqueID");
    const runtimeFrame = extensions.find(
      (extension) => extension.name === "runtimeBlockFrameAttributes",
    );
    expect(runtimeUniqueId?.options).toMatchObject({
      attributeName: "id",
      types: "all",
      updateDocument: false,
    });
    expect(runtimeUniqueId?.options["generateID"]).toBeTypeOf("function");
    expect(runtimeFrame?.options["resizableBlockNodeTypes"]).toEqual(
      builtInBlockRegistry.resizableNodeTypes,
    );
  });

  it("does not mutate missing, malformed or valid Surface identity during load", () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({ composition: coreRuntimeComposition }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "slideshow" },
            content: [
              runtimeSurface(),
              runtimeSurface("not-an-id"),
              runtimeSurface("AbCdEf123_--"),
            ],
          },
        ],
      },
    });

    try {
      expect(
        editor
          .getJSON()
          .content?.[0]?.content?.map((surface) =>
            "attrs" in surface ? surface.attrs?.["id"] : undefined,
          ),
      ).toEqual([null, "not-an-id", "AbCdEf123_--"]);
    } finally {
      editor.destroy();
    }
  });

  it("uses runtime arrangement nodes", () => {
    const extensions = createCourseDocumentRuntimeExtensions({
      composition: coreRuntimeComposition,
    });

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
      extensions: createCourseDocumentRuntimeExtensions({ composition: coreRuntimeComposition }),
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

  it("gives Core and contributed node extensions mounted identity in runtime", () => {
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
    expect(uniqueId?.options["types"]).toBe("all");
    expect(schema.nodes["paragraph"]?.spec.attrs?.["id"]).toBeDefined();
    expect(
      schema.nodes[`${capability.definition.nodeType}_child`]?.spec.attrs?.["id"],
    ).toBeDefined();
    expect(schema.nodes["doc"]?.spec.attrs?.["id"]).toBeUndefined();
    expect(schema.nodes["text"]?.spec.attrs?.["id"]).toBeUndefined();
    expect(schema.marks["bold"]?.spec.attrs?.["id"]).toBeUndefined();
    expect(frame?.options["resizableBlockNodeTypes"]).toContain(capability.definition.nodeType);

    const editor = new Editor({
      editable: false,
      extensions,
      content: contributedIdentityDocument(capability.definition.nodeType),
    });
    try {
      const container = document.createElement("div");
      container.innerHTML = editor.getHTML();
      expect(container.querySelector("p")?.getAttribute("data-id")).toBe("corePara0001");
      expect(container.querySelector("[data-contributed-wrapper]")?.getAttribute("data-id")).toBe(
        "hostWrap0001",
      );
      expect(
        container.querySelector("[data-contributed-inline-atom]")?.getAttribute("data-id"),
      ).toBe("hostAtom0001");
    } finally {
      editor.destroy();
    }
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
    expect(firstSchema.nodes[`${first.definition.nodeType}_child`]).toBeDefined();
    expect(firstSchema.nodes[`${second.definition.nodeType}_child`]).toBeUndefined();
    expect(secondSchema.nodes[`${second.definition.nodeType}_child`]).toBeDefined();
    expect(secondSchema.nodes[`${first.definition.nodeType}_child`]).toBeUndefined();
  });

  it("keeps host Surface registries, views, and schemas isolated between applications", () => {
    const first = hostSurfaceCapability("first-runtime-host-surface");
    const second = hostSurfaceCapability("second-runtime-host-surface");
    const firstApplication = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "first-runtime-surface-pack", surfaces: [first] })],
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
    expect(firstApplication.runtime.surfaces.views.get(second.definition.id)).toBeUndefined();
    expect(secondApplication.runtime.surfaces.views.get(second.definition.id)?.component).toBe(
      second.runtimeView.component,
    );
    expect(secondApplication.runtime.surfaces.views.get(first.definition.id)).toBeUndefined();
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

function runtimeSurface(id?: string) {
  return {
    type: "surface",
    attrs: { ...(id === undefined ? {} : { id }), variant: "slide-cover" },
    content: [{ type: "paragraph" }],
  };
}

function hostBlockCapability(nodeType: string): BlockCapability {
  const childNodeType = `${nodeType}_child`;
  const inlineNodeType = `${nodeType}_inline_atom`;
  return {
    definition: {
      nodeType,
      frame: { resizable: true },
    },
    authoringExtension: Extension.create({
      name: `${nodeType}_authoring_bundle`,
      addExtensions: () => [
        Node.create({
          name: nodeType,
          group: "block",
          content: childNodeType,
          renderHTML: ({ HTMLAttributes }) => [
            "div",
            { ...HTMLAttributes, "data-contributed-root": "" },
            0,
          ],
        }),
        Node.create({
          name: childNodeType,
          content: "paragraph",
          renderHTML: ({ HTMLAttributes }) => [
            "div",
            { "data-contributed-wrapper": "", ...HTMLAttributes },
            0,
          ],
        }),
        Node.create({
          name: inlineNodeType,
          group: "inline",
          inline: true,
          atom: true,
          renderHTML: ({ HTMLAttributes }) => [
            "span",
            { "data-contributed-inline-atom": "", ...HTMLAttributes },
          ],
        }),
      ],
    }),
    runtimeExtension: Extension.create({
      name: `${nodeType}_runtime_bundle`,
      addExtensions: () => [
        Node.create({
          name: nodeType,
          group: "block",
          content: childNodeType,
          renderHTML: ({ HTMLAttributes }) => [
            "div",
            { ...HTMLAttributes, "data-contributed-root": "" },
            0,
          ],
        }),
        Node.create({
          name: childNodeType,
          content: "paragraph",
          renderHTML: ({ HTMLAttributes }) => [
            "div",
            { "data-contributed-wrapper": "", ...HTMLAttributes },
            0,
          ],
        }),
        Node.create({
          name: inlineNodeType,
          group: "inline",
          inline: true,
          atom: true,
          renderHTML: ({ HTMLAttributes }) => [
            "span",
            { "data-contributed-inline-atom": "", ...HTMLAttributes },
          ],
        }),
      ],
    }),
  };
}

function contributedIdentityDocument(nodeType: string) {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseDoc001", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surface00001", variant: "page-default" },
            content: [
              {
                type: nodeType,
                attrs: { id: "hostRoot0001" },
                content: [
                  {
                    type: `${nodeType}_child`,
                    attrs: { id: "hostWrap0001" },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "corePara0001" },
                        content: [
                          { type: "text", text: "Before " },
                          { type: `${nodeType}_inline_atom`, attrs: { id: "hostAtom0001" } },
                          { type: "text", text: " after" },
                        ],
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
