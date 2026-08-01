// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Extension, Node, getSchema, type JSONContent } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { EditorContent, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
import * as surfaceLifecyclePolicy from "@/document/authoring/surface-lifecycle-authoring-policy";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInBlockAuthoringBindings } from "@/editor/blocks/authoring-block-extensions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { LayoutAddGhost } from "@/editor/arrangements/layout/authoring/layout-chrome";
import type { LayoutComponentProps } from "@/editor/arrangements/layout/authoring/layout-view-definition";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import * as emptyInsertionRow from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import * as slashCommand from "@/editor/suggestions/slash/SlashCommand";
import * as surfaceAuthoringNode from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import * as surfaceRootSelectionPolicy from "@/editor/surfaces/authoring/surface-root-selection-policy";
import type { SurfaceAuthoringViewProps } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import * as surfaceVariantRegistry from "@/editor/surfaces/model/surface-variant-registry";
import { createCourseDocumentAuthoringExtensions } from "./create-authoring-composition";

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates built-in Surface factories when resolving the default authoring composition at call time", () => {
    const validateFactories = vi.spyOn(surfaceVariantRegistry, "validateSurfaceVariantFactories");

    createCourseDocumentAuthoringExtensions({ editable: true });

    expect(validateFactories).toHaveBeenCalledOnce();
    expect(validateFactories.mock.calls[0]?.[0]).not.toBe(builtInSurfaceVariantRegistry);
  });

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

    const missingBlockNames = builtInBlockAuthoringBindings
      .map(({ extension }) => extension.name)
      .filter((name) => !documentExtensionNames.has(name));

    expect(missingBlockNames).toEqual([]);
  });

  it("passes built-in stable-id node types into the authoring composition", () => {
    const authoringUniqueId = createCourseDocumentAuthoringExtensions({ editable: true }).find(
      (extension) => extension.name === "uniqueID",
    );

    expect(authoringUniqueId?.options["types"]).toEqual(
      expect.arrayContaining([...builtInBlockRegistry.stableIdNodeTypes]),
    );
  });

  it("passes built-in resizable node types into the authoring frame extension", () => {
    const authoringFrame = createCourseDocumentAuthoringExtensions({ editable: true }).find(
      (extension) => extension.name === "runtimeBlockFrameAttributes",
    );

    expect(authoringFrame?.options["resizableBlockNodeTypes"]).toEqual(
      builtInBlockRegistry.resizableNodeTypes,
    );
  });

  it("uses authoring arrangement nodes", () => {
    const authoringExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
    });

    expect(authoringExtensions.find((extension) => extension.name === "grid")).toBe(
      GridAuthoringNode,
    );
    expect(authoringExtensions.find((extension) => extension.name === "cell")).toBe(
      CellAuthoringNode,
    );
    expect(authoringExtensions.filter((extension) => extension.name === "layout")).toHaveLength(1);
    expect(authoringExtensions.filter((extension) => extension.name === "section")).toHaveLength(1);
    expect(LayoutAuthoringNode.name).toBe("layout");
    expect(SectionAuthoringNode.name).toBe("section");
  });

  it("renders a persisted built-in layout through the authoring composition", async () => {
    const authoringEditor = new Editor({
      editable: true,
      extensions: createCourseDocumentAuthoringExtensions({ editable: true }),
      content: persistedTabsDocument("authoring"),
    });

    try {
      render(createElement(EditorContent, { editor: authoringEditor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-authoring-frame="layout"][data-definition="tabs"] .sc-tabs',
          ),
        ).not.toBeNull();
      });
    } finally {
      cleanup();
      authoringEditor.destroy();
    }
  });

  it("creates a host-defined section through the resolved authoring composition", async () => {
    const capability = hostLayoutCapability();
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-authoring-layouts",
          layouts: [capability],
        }),
      ],
    });
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    });
    const editor = new Editor({
      editable: true,
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
            `[data-testid="host-layout-authoring-view"][data-resolved-layout="${capability.definition.id}"]`,
          ),
        ).not.toBeNull();
        expect(
          document.body.querySelector('[data-layout-add-ghost][aria-label="Add host section"]'),
        ).not.toBeNull();
      });

      fireEvent.click(
        document.body.querySelector('[data-layout-add-ghost][aria-label="Add host section"]')!,
      );

      await waitFor(() => {
        const createdSection = findNodeJsonById(editor, "section-host-created-2");

        expect(createdSection?.attrs).toMatchObject({
          id: "section-host-created-2",
          role: "host-created-section",
          label: "Host section 2",
          options: {
            sectionIndex: 1,
            source: "host-layout-section-factory",
          },
        });
        expect(createdSection?.content?.[0]?.content?.[0]?.text).toBe(
          "Created by host section factory 2",
        );
      });
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("uses resolved host Layout placement in bounded transaction validation", () => {
    const fillCapability = hostLayoutCapability("host-fill-layout", "fill");
    const flowCapability = hostLayoutCapability("host-flow-layout");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-bounded-layouts",
          layouts: [fillCapability, flowCapability],
        }),
      ],
    });
    const fillEditor = new Editor({
      editable: true,
      extensions: createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: application.authoring,
      }).filter(({ name }) => name !== "surfaceLifecycleAuthoringPolicy"),
      content: persistedHostLayoutInBoundedCellDocument(fillCapability.definition.id, "cell-fill"),
    });
    const flowEditor = new Editor({
      editable: true,
      extensions: createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: application.authoring,
      }).filter(({ name }) => name !== "surfaceLifecycleAuthoringPolicy"),
      content: persistedHostLayoutInBoundedCellDocument(flowCapability.definition.id, "cell-flow"),
    });

    try {
      appendParagraphToNode(fillEditor, "cell-fill");
      appendParagraphToNode(flowEditor, "cell-flow");

      expect(findNodeJsonById(fillEditor, "cell-fill")?.content?.map(({ type }) => type)).toEqual([
        "layout",
      ]);
      expect(findNodeJsonById(flowEditor, "cell-flow")?.content?.map(({ type }) => type)).toEqual([
        "layout",
        "paragraph",
      ]);
    } finally {
      fillEditor.destroy();
      flowEditor.destroy();
    }
  });

  it("constructs one Surface node and binds every Surface policy to the resolved application", () => {
    const capability = hostSurfaceCapability("host-surface-policy-tracer");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-surface-policy-pack",
          surfaces: [capability],
        }),
      ],
    });
    const createNode = vi.spyOn(surfaceAuthoringNode, "createSurfaceAuthoringNode");
    const createRootSelection = vi.spyOn(
      surfaceRootSelectionPolicy,
      "createSurfaceRootSelectionPolicy",
    );
    const createLifecycle = vi.spyOn(
      surfaceLifecyclePolicy,
      "createSurfaceLifecycleAuthoringPolicy",
    );
    const createEmptyRow = vi.spyOn(emptyInsertionRow, "createEmptyInsertionRowExtension");
    const createSlash = vi.spyOn(slashCommand, "createSlashCommand");

    const authoringExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    });
    const surfaceRegistry = application.capabilities.surfaces.registry;

    expect(authoringExtensions.filter((extension) => extension.name === "surface")).toHaveLength(1);
    expect(createNode).toHaveBeenCalledOnce();
    expect(createNode).toHaveBeenCalledWith({
      registry: surfaceRegistry,
      views: application.authoring.surfaces.views,
    });
    expect(createRootSelection).toHaveBeenCalledWith({ surfaceVariants: surfaceRegistry });
    expect(createLifecycle).toHaveBeenCalledWith({ registry: surfaceRegistry });
    expect(createEmptyRow).toHaveBeenCalledWith({ surfaceVariants: surfaceRegistry });
    expect(createSlash).toHaveBeenCalledWith({
      items: builtInInsertCatalog.actions,
      surfaceVariants: surfaceRegistry,
    });
  });

  it("renders and interprets a host Surface through the resolved authoring composition", async () => {
    const capability = hostSurfaceCapability("host-surface-authoring-tracer");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-surface-authoring-pack",
          surfaces: [capability],
        }),
      ],
    });
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    });
    const editor = new Editor({
      editable: true,
      extensions,
      content: persistedHostSurfaceDocument(capability.definition.id),
    });

    expect(extensions.filter(({ name }) => name === "surface")).toHaveLength(1);
    expect(Object.keys(getSchema(extensions).nodes).filter((name) => name === "surface")).toEqual([
      "surface",
    ]);

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            `[data-host-surface-authoring="${capability.definition.id}"]`,
          ),
        ).not.toBeNull();
      });

      const surfaceEnd =
        firstNodePosition(editor, "surface") + firstNodeSize(editor, "surface") - 1;
      editor.view.dispatch(
        editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(surfaceEnd))),
      );
      expect(editor.state.selection).toBeInstanceOf(GapCursor);

      const paragraphPosition = firstNodePosition(editor, "paragraph");
      editor.commands.setTextSelection(paragraphPosition + 1);
      await waitFor(() => {
        expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
      });

      expect(editor.commands.insertContentAt(paragraphPosition + 1, "Host-authored text")).toBe(
        true,
      );
      expect(editor.state.doc.textContent).toContain("Host-authored text");
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("keeps host Surface views and policy interpretation isolated between applications", () => {
    const firstCapability = hostSurfaceCapability("first-host-surface");
    const secondCapability = hostSurfaceCapability("second-host-surface");
    const firstApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "first-host-surface-pack",
          surfaces: [firstCapability],
        }),
      ],
    });
    const secondApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "second-host-surface-pack",
          surfaces: [secondCapability],
        }),
      ],
    });
    const firstExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: firstApplication.authoring,
    });
    const secondExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: secondApplication.authoring,
    });

    expect(
      firstApplication.authoring.surfaces.views.get(firstCapability.definition.id),
    ).toBeDefined();
    expect(
      firstApplication.authoring.surfaces.views.get(secondCapability.definition.id),
    ).toBeUndefined();
    expect(
      secondApplication.authoring.surfaces.views.get(firstCapability.definition.id),
    ).toBeUndefined();

    const firstEditor = new Editor({
      extensions: firstExtensions,
      content: persistedHostSurfaceDocument(firstCapability.definition.id),
    });
    const secondEditor = new Editor({
      extensions: secondExtensions,
      content: persistedHostSurfaceDocument(secondCapability.definition.id),
    });
    const firstPolicyWithSecondContent = new Editor({
      extensions: replaceSurfaceNodeView(firstExtensions),
      content: persistedHostSurfaceDocument(secondCapability.definition.id),
    });
    const secondPolicyWithFirstContent = new Editor({
      extensions: replaceSurfaceNodeView(secondExtensions),
      content: persistedHostSurfaceDocument(firstCapability.definition.id),
    });

    try {
      const firstParagraph = firstNodePosition(firstEditor, "paragraph");
      const secondParagraph = firstNodePosition(secondEditor, "paragraph");
      const foreignSecondParagraph = firstNodePosition(firstPolicyWithSecondContent, "paragraph");
      const foreignFirstParagraph = firstNodePosition(secondPolicyWithFirstContent, "paragraph");

      expect(firstEditor.commands.insertContentAt(firstParagraph + 1, "First host edit")).toBe(
        true,
      );
      expect(secondEditor.commands.insertContentAt(secondParagraph + 1, "Second host edit")).toBe(
        true,
      );
      expect(firstEditor.state.doc.textContent).toBe("First host edit");
      expect(secondEditor.state.doc.textContent).toBe("Second host edit");

      firstPolicyWithSecondContent.commands.insertContentAt(
        foreignSecondParagraph + 1,
        "Foreign second host edit",
      );
      secondPolicyWithFirstContent.commands.insertContentAt(
        foreignFirstParagraph + 1,
        "Foreign first host edit",
      );
      expect(firstPolicyWithSecondContent.state.doc.textContent).toBe("");
      expect(secondPolicyWithFirstContent.state.doc.textContent).toBe("");
    } finally {
      firstEditor.destroy();
      secondEditor.destroy();
      firstPolicyWithSecondContent.destroy();
      secondPolicyWithFirstContent.destroy();
    }
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

  it("installs one host Block authoring bundle with resolved identity and frame metadata", () => {
    const capability = hostBlockCapability("host_authoring_tracer");
    const application = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "host-authoring-blocks", blocks: [capability] })],
    });
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    });
    const schema = getSchema(extensions);
    const uniqueId = extensions.find(({ name }) => name === "uniqueID");
    const frame = extensions.find(({ name }) => name === "runtimeBlockFrameAttributes");

    expect(
      Object.keys(schema.nodes).filter((name) => name === capability.definition.nodeType),
    ).toHaveLength(1);
    expect(
      extensions.filter((extension) => extension === capability.authoringExtension),
    ).toHaveLength(1);
    expect(extensions).not.toContain(capability.runtimeExtension);
    expect(uniqueId?.options["types"]).toEqual(
      expect.arrayContaining([
        capability.definition.nodeType,
        ...capability.definition.identity!.stableChildNodeTypes!,
      ]),
    );
    expect(frame?.options["resizableBlockNodeTypes"]).toContain(capability.definition.nodeType);
  });

  it("keeps host Block registries and authoring schemas isolated between applications", () => {
    const first = hostBlockCapability("first_authoring_host_block");
    const second = hostBlockCapability("second_authoring_host_block");
    const firstApplication = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "first-authoring-host", blocks: [first] })],
    });
    const secondApplication = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "second-authoring-host", blocks: [second] })],
    });
    const firstSchema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: firstApplication.authoring,
      }),
    );
    const secondSchema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: secondApplication.authoring,
      }),
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

function hostSurfaceCapability(id: string): SurfaceCapability {
  return {
    definition: {
      id,
      modes: ["page"],
      title: `Host Surface ${id}`,
      description: "Host-contributed authoring Surface",
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
  return createElement(
    NodeViewWrapper,
    {
      "data-surface": "",
      "data-host-surface-authoring": props.definition.id,
      "data-surface-variant": props.variant,
    },
    createElement(NodeViewContent),
  );
}

function HostSurfaceRuntimeView() {
  return null;
}

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

function hostLayoutCapability(
  id = "host-authoring-layout",
  boundedPlacement?: "fill",
): LayoutCapability {
  return {
    definition: {
      id,
      title: "Host authoring layout",
      description: "Host-contributed authoring layout",
      icon: CircleIcon,
      ...(boundedPlacement ? { boundedPlacement } : {}),
      createContent: () => persistedHostLayoutDocument(id).content[0]!.content[0]!.content[0]!,
      section: {
        label: "Host section",
        addLabel: "Add host section",
        create: ({ index }) => ({
          type: "section",
          attrs: {
            id: `section-host-created-${index + 1}`,
            role: "host-created-section",
            label: `Host section ${index + 1}`,
            options: {
              sectionIndex: index,
              source: "host-layout-section-factory",
            },
          },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Created by host section factory ${index + 1}`,
                },
              ],
            },
          ],
        }),
      },
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

function HostLayoutAuthoringView({
  definition,
  editable,
  editor,
  getPos,
  node,
}: LayoutComponentProps) {
  return createElement(
    "div",
    {
      "data-testid": "host-layout-authoring-view",
      "data-resolved-layout": definition?.id,
    },
    createElement(NodeViewContent),
    editable && definition?.section
      ? createElement(LayoutAddGhost, {
          editor,
          getPos,
          label: definition.section.addLabel,
          layoutId: node.attrs["id"],
        })
      : null,
  );
}

function HostLayoutRuntimeView() {
  return null;
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
            attrs: { id: "surface-host-authoring", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layout-host-authoring",
                  variant,
                  options: {},
                },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: "section-host-authoring",
                      options: {},
                    },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Host-authored content" }],
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

function persistedHostLayoutInBoundedCellDocument(variant: string, cellId: string) {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          {
            type: "surface",
            attrs: { id: `surface-${cellId}`, variant: "slide-content" },
            content: [
              {
                type: "region",
                attrs: { id: `region-${cellId}` },
                content: [
                  {
                    type: "grid",
                    attrs: { id: `grid-${cellId}` },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: cellId },
                        content: [
                          persistedHostLayoutDocument(variant).content[0]!.content[0]!.content[0]!,
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

function appendParagraphToNode(editor: Editor, id: string): void {
  let insertPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    insertPos = pos + node.nodeSize - 1;
    return false;
  });

  if (insertPos === null) throw new Error(`expected node "${id}"`);
  const paragraph = editor.schema.nodes.paragraph?.create();
  if (!paragraph) throw new Error("expected paragraph node");
  editor.view.dispatch(editor.state.tr.insert(insertPos, paragraph));
}

function firstNodePosition(editor: Editor, type: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== type) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`expected ${type} node`);
  return found;
}

function firstNodeSize(editor: Editor, type: string): number {
  const position = firstNodePosition(editor, type);
  const node = editor.state.doc.nodeAt(position);
  if (!node) throw new Error(`expected ${type} node at ${position}`);
  return node.nodeSize;
}

function replaceSurfaceNodeView(
  extensions: ReturnType<typeof createCourseDocumentAuthoringExtensions>,
) {
  return extensions.map((extension) => (extension.name === "surface" ? SurfaceNode : extension));
}

function findNodeJsonById(editor: Editor, id: string): JSONContent | null {
  let found: JSONContent | null = null;

  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] !== id) return true;
    found = node.toJSON();
    return false;
  });

  return found;
}
