// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Extension, Node, getSchema, type JSONContent } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { EditorContent, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
import { getScaffoldAuthoringCataloguesForEditor } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import * as structuralClipboardPolicy from "@/document/authoring/structural-clipboard-policy";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInBlockAuthoringBindings } from "@/editor/blocks/authoring-block-extensions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { resolveContentLayoutStructuralActivationPlacement } from "@/editor/content-layout/authoring/content-layout-structural-activation-placement";
import * as interactionOwnerExtension from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { LayoutAddGhost } from "@/editor/arrangements/layout/authoring/layout-chrome";
import type { LayoutComponentProps } from "@/editor/arrangements/layout/authoring/layout-view-definition";
import * as emptyInsertionRow from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import * as slashCommand from "@/editor/suggestions/slash/SlashCommand";
import * as surfaceAuthoringNode from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import * as surfaceRootSelectionPolicy from "@/editor/surfaces/authoring/surface-root-selection-policy";
import type { SurfaceAuthoringViewProps } from "../../editor/surfaces/shared/surface-view-props";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import * as surfaceVariantRegistry from "@/editor/surfaces/model/surface-variant-registry";
import {
  createCourseDocumentAuthoringEnvironment,
  createCourseDocumentAuthoringExtensions,
  getCourseDocumentAuthoringEnvironmentState,
} from "./create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "./scaffold-authoring-composition";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();

const AUTHORING_ONLY_EXTENSION_NAMES = [
  "semanticDocumentController",
  "contentLayoutAuthoring",
  "scaffoldInteractionOwner",
  "scaffoldStructuralClipboardPolicy",
  "placeholder",
  "emptyInsertionRow",
  "surfaceRootSelectionPolicy",
  "slashCommand",
  "unavailable_block",
  "unavailable_layout",
  "unavailable_surface",
  "scaffoldUnavailableContentClipboardPolicy",
];

const UNAVAILABLE_CONTENT_NODE_NAMES = [
  "unavailable_block",
  "unavailable_layout",
  "unavailable_surface",
] as const;

const DECOMMISSIONED_ACTIVATION_EXTENSION_NAMES = ["scaffoldInteractionState", "blockSelection"];

describe("createCourseDocumentAuthoringExtensions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires an explicit authoring composition", () => {
    type Options = Parameters<typeof createCourseDocumentAuthoringExtensions>[0];
    expectTypeOf<{} extends Pick<Options, "composition"> ? true : false>().toEqualTypeOf<false>();
  });

  it("uses the explicitly supplied Core authoring composition", () => {
    const validateFactories = vi.spyOn(surfaceVariantRegistry, "validateSurfaceVariantFactories");

    createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    });

    expect(validateFactories).not.toHaveBeenCalled();
    expect(coreAuthoringComposition.capabilities.surfaces.registry).not.toBe(
      builtInSurfaceVariantRegistry,
    );
  });

  it("owns one opaque immutable composition, extension list, capability set, and schema", () => {
    const environment = createCourseDocumentAuthoringEnvironment({
      composition: coreAuthoringComposition,
    });
    const state = getCourseDocumentAuthoringEnvironmentState(environment);

    expect(Object.keys(environment)).toEqual([]);
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(state.extensions)).toBe(true);
    expect(state.composition).toBe(coreAuthoringComposition);
    expect(Object.keys(state.schema.nodes)).toEqual(Object.keys(getSchema(state.extensions).nodes));
    expect(state.capabilities.blocks).toBe(coreAuthoringComposition.capabilities.blocks.registry);
    expect(state.capabilities.layouts).toBe(coreAuthoringComposition.capabilities.layouts.registry);
    expect(state.capabilities.surfaces).toBe(
      coreAuthoringComposition.capabilities.surfaces.registry,
    );
    type Options = Parameters<typeof createCourseDocumentAuthoringEnvironment>[0];
    expectTypeOf<"sessionExtensions" extends keyof Options ? true : false>().toEqualTypeOf<false>();
  });

  it("returns each extension name only once", () => {
    const extensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    const duplicates = extensionNames.filter(
      (name, index) => extensionNames.indexOf(name) !== index,
    );

    expect(duplicates).toEqual([]);
  });

  it("finalizes the authoring array with one Core-owned compatibility bundle", () => {
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    });
    const lastCapabilityExtensionIndex = Math.max(
      ...coreAuthoringComposition.blocks.extensions.map((capabilityExtension) =>
        extensions.indexOf(capabilityExtension),
      ),
    );

    for (const name of [
      ...UNAVAILABLE_CONTENT_NODE_NAMES,
      "scaffoldUnavailableContentClipboardPolicy",
    ]) {
      const matchingIndexes = extensions.flatMap((extension, index) =>
        extension.name === name ? [index] : [],
      );
      expect(matchingIndexes).toHaveLength(1);
      expect(matchingIndexes[0]).toBeGreaterThan(lastCapabilityExtensionIndex);
    }
  });

  it("does not expose compatibility items through mounted capabilities or insertion catalogues", () => {
    const actionIds = coreAuthoringComposition.catalogues.inDocument.actions.map(({ id }) => id);

    for (const name of UNAVAILABLE_CONTENT_NODE_NAMES) {
      expect(
        coreAuthoringComposition.capabilities.blocks.registry.getByNodeType(name),
      ).toBeUndefined();
      expect(actionIds).not.toContain(name);
      expect(actionIds).not.toContain(name.replaceAll("_", "-"));
    }
  });

  it("registers one neutral hidden Course Section boundary with shared mounted identity", () => {
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    });
    const courseSectionNodes = extensions.filter(({ name }) => name === "courseSection");
    const schema = getSchema(extensions);

    expect(courseSectionNodes).toHaveLength(1);
    const courseSectionNode = courseSectionNodes[0];
    expect(courseSectionNode).toBeInstanceOf(Node);
    if (!(courseSectionNode instanceof Node)) {
      throw new Error("Expected Course Section extension to be a Tiptap Node.");
    }
    expect(courseSectionNode.config.addNodeView).toBeUndefined();
    expect(Object.keys(schema.nodes).filter((name) => name === "courseSection")).toEqual([
      "courseSection",
    ]);
    expect(schema.nodes["courseSection"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["courseSection"]?.spec.attrs?.["title"]).toBeDefined();
  });

  it("installs Course Structure commands without a parallel document validator", () => {
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    });

    expect(coreAuthoringComposition).not.toHaveProperty("courseStructure");
    expect(extensions.filter(({ name }) => name === "courseStructureCommands")).toHaveLength(1);
    expect(extensions.filter(({ name }) => name === "semanticDocumentController")).toHaveLength(1);
    expect(extensions.findIndex(({ name }) => name === "scaffoldCapabilities")).toBeLessThan(
      extensions.findIndex(({ name }) => name === "semanticDocumentController"),
    );
  });

  it("installs the exact authoring catalogues and Course Structure commands for a host editor", () => {
    const capability = hostLayoutCapability("host-catalogue-storage-layout");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-catalogue-storage",
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

    try {
      expect(
        extensions.filter((extension) => extension.name === "scaffoldAuthoringCatalogues"),
      ).toHaveLength(1);
      expect(editor.commands.applyCourseStructureCommand).toBeTypeOf("function");
      expect(getScaffoldAuthoringCataloguesForEditor(editor)).toBe(
        application.authoring.catalogues,
      );
    } finally {
      editor.destroy();
    }
  });

  it("includes course block extensions in authoring composition", () => {
    const documentExtensionNames = new Set(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }).map((extension) => extension.name),
    );

    const missingBlockNames = builtInBlockAuthoringBindings
      .map(({ extension }) => extension.name)
      .filter((name) => !documentExtensionNames.has(name));

    expect(missingBlockNames).toEqual([]);
  });

  it("mounts the inline Drag and Drop authoring owner and canvas exactly once", () => {
    const schema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
    );

    expect(schema.nodes["drag_drop"]).toBeDefined();
    expect(schema.nodes["drag_drop_canvas"]).toBeDefined();
    expect(
      builtInBlockAuthoringBindings.filter(({ nodeType }) => nodeType === "drag_drop"),
    ).toHaveLength(1);
  });

  it("mounts the private Surface Categorise question owner in authoring", () => {
    const schema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
    );

    expect(schema.nodes["surface_categorise_question"]).toBeDefined();
    expect(schema.nodes["surface_categorise_question"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["categorise_content"]).toBeDefined();
    expect(schema.nodes["categorise_bin"]).toBeDefined();
    expect(schema.nodes["categorise_item"]).toBeDefined();
  });

  it("mounts the private Surface Sequencing question owner in authoring", () => {
    const schema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
    );

    expect(schema.nodes["surface_sequencing_question"]).toBeDefined();
    expect(schema.nodes["surface_sequencing_question"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["sequencing_items_group"]).toBeDefined();
    expect(schema.nodes["sequencing_item"]).toBeDefined();
  });

  it("mounts the private Surface Matching question owner in authoring", () => {
    const schema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
    );

    expect(schema.nodes["surface_matching_question"]).toBeDefined();
    expect(schema.nodes["surface_matching_question"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["matching_pairs_group"]).toBeDefined();
    expect(schema.nodes["matching_pair"]).toBeDefined();
    expect(schema.nodes["matching_item"]).toBeDefined();
    expect(schema.nodes["matching_target"]).toBeDefined();
  });

  it("mounts the private Surface Image Hotspot question owner in authoring", () => {
    const schema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
    );

    expect(schema.nodes["surface_image_hotspot_question"]).toBeDefined();
    expect(schema.nodes["surface_image_hotspot_question"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["image_hotspot_canvas"]).toBeDefined();
  });

  it("configures identity for every eligible mounted node in editable authoring", () => {
    const uniqueId = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    }).find((extension) => extension.name === "uniqueID");

    expect(uniqueId?.options).toMatchObject({
      attributeName: "id",
      types: "all",
      updateDocument: true,
    });
    expect(uniqueId?.options["generateID"]).toBeTypeOf("function");
  });

  it("keeps identity non-mutating when the authoring composition is read-only", () => {
    const uniqueId = createCourseDocumentAuthoringExtensions({
      editable: false,
      composition: coreAuthoringComposition,
    }).find((extension) => extension.name === "uniqueID");

    expect(uniqueId?.options["types"]).toBe("all");
    expect(uniqueId?.options["updateDocument"]).toBe(false);
  });

  it("passes built-in resizable node types into the authoring frame extension", () => {
    const authoringFrame = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    }).find((extension) => extension.name === "runtimeBlockFrameAttributes");

    expect(authoringFrame?.options["resizableBlockNodeTypes"]).toEqual(
      builtInBlockRegistry.resizableNodeTypes,
    );
  });

  it("uses authoring arrangement nodes", () => {
    const authoringExtensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    });

    expect(authoringExtensions.filter((extension) => extension.name === "grid")).toHaveLength(1);
    expect(authoringExtensions.filter((extension) => extension.name === "cell")).toHaveLength(1);
    expect(authoringExtensions.filter((extension) => extension.name === "layout")).toHaveLength(1);
    expect(authoringExtensions.filter((extension) => extension.name === "section")).toHaveLength(1);
    expect(LayoutAuthoringNode.name).toBe("layout");
    expect(SectionAuthoringNode.name).toBe("section");
  });

  it("renders a persisted built-in layout through the authoring composition", async () => {
    const authoringEditor = new Editor({
      editable: true,
      extensions: createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
      content: persistedTabsDocument("authoring"),
    });

    try {
      render(
        createAuthoringMovementTestRoot(
          authoringEditor,
          createElement(EditorContent, { editor: authoringEditor }),
        ),
      );

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-authoring-frame="layout"][data-definition="tabs"] .sc-course-tabs',
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
      render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));

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
        const createdSection = findNodeJsonById(editor, "hostsection2");

        expect(createdSection?.attrs).toMatchObject({
          id: "hostsection2",
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
    expect(createEmptyRow).toHaveBeenCalledWith({
      blockDefinitions: application.capabilities.blocks.registry,
      layoutDefinitions: application.capabilities.layouts.registry,
      surfaceVariants: surfaceRegistry,
    });
    expect(createSlash).toHaveBeenCalledWith({
      blockDefinitions: application.capabilities.blocks.registry,
      items: application.authoring.catalogues.inDocument.actions,
      layoutDefinitions: application.capabilities.layouts.registry,
      surfaceVariants: surfaceRegistry,
    });
  });

  it("binds structural clipboard refusal to the exact mounted ownership", () => {
    const capability = hostBlockCapability("host_clipboard_owner");
    const application = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "host-clipboard-owner", blocks: [capability] })],
    });
    const createPolicy = vi.spyOn(structuralClipboardPolicy, "createStructuralClipboardPolicy");

    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    });

    expect(createPolicy).toHaveBeenCalledOnce();
    expect(createPolicy).toHaveBeenCalledWith({
      blockDefinitions: application.capabilities.blocks.registry,
      identityRewrites: application.capabilities.contentIdentity.rewrites,
      carrierLimits: {
        maxCarrierBytes: 2_000_000,
        fragmentDecodeLimits: {
          maxEncodedBytes: 1_000_000,
          maxNestingDepth: 1_000,
          maxVisitedValues: 100_000,
          maxArrayLength: 100_000,
          maxObjectPropertyCount: 100_000,
          maxStringBytes: 100_000,
        },
      },
      layoutDefinitions: application.capabilities.layouts.registry,
      surfaceVariants: application.capabilities.surfaces.registry,
    });
    expect(
      extensions.filter(({ name }) => name === "scaffoldStructuralClipboardPolicy"),
    ).toHaveLength(1);
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
      render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));

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

  it("keeps host Surface views isolated between applications", () => {
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
    try {
      const firstParagraph = firstNodePosition(firstEditor, "paragraph");
      const secondParagraph = firstNodePosition(secondEditor, "paragraph");

      expect(firstEditor.commands.insertContentAt(firstParagraph + 1, "First host edit")).toBe(
        true,
      );
      expect(secondEditor.commands.insertContentAt(secondParagraph + 1, "Second host edit")).toBe(
        true,
      );
      expect(firstEditor.state.doc.textContent).toBe("First host edit");
      expect(secondEditor.state.doc.textContent).toBe("Second host edit");
    } finally {
      firstEditor.destroy();
      secondEditor.destroy();
    }
  });

  it("adds authoring-only extensions in authoring composition", () => {
    const authoringExtensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    expect(authoringExtensionNames).not.toContain("studentGuard");

    for (const authoringOnlyName of AUTHORING_ONLY_EXTENSION_NAMES) {
      expect(authoringExtensionNames).toContain(authoringOnlyName);
    }
  });

  it("installs the authoring coordinator after its projection dependencies without leaking to runtime", () => {
    const authoringExtensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");
    const semanticIndex = authoringExtensionNames.indexOf("semanticDocumentController");
    const projectionIndex = authoringExtensionNames.indexOf("contentLayoutProjection");
    const authoringIndex = authoringExtensionNames.indexOf("contentLayoutAuthoring");

    expect(semanticIndex).toBeGreaterThanOrEqual(0);
    expect(projectionIndex).toBe(semanticIndex + 1);
    expect(authoringIndex).toBe(projectionIndex + 1);

    const runtimeExtensionNames = createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    expect(runtimeExtensionNames).toContain("contentLayoutProjection");
    expect(runtimeExtensionNames).not.toContain("semanticDocumentController");
    expect(runtimeExtensionNames).not.toContain("contentLayoutAuthoring");
  });

  it("injects one Content Layout structural placement adapter at authoring composition only", () => {
    const createInteractionOwner = vi.spyOn(
      interactionOwnerExtension,
      "createScaffoldInteractionOwnerExtension",
    );

    createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    });
    createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    });

    expect(createInteractionOwner).toHaveBeenCalledOnce();
    expect(createInteractionOwner).toHaveBeenCalledWith(
      coreAuthoringComposition.capabilities.blocks.registry,
      {
        resolveStructuralActivationPlacement: resolveContentLayoutStructuralActivationPlacement,
      },
    );
  });

  it("keeps the owner extension store editor-owned", () => {
    const ownerExtension = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    }).find((extension) => extension.name === "scaffoldInteractionOwner");

    expect(ownerExtension?.options).toEqual({});
  });

  it("installs interaction ownership and no old activation extensions", () => {
    const authoringExtensionNames = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    })
      .map((extension) => extension.name)
      .filter((name): name is string => typeof name === "string");

    expect(authoringExtensionNames).toContain("scaffoldInteractionOwner");

    for (const decommissionedName of DECOMMISSIONED_ACTIVATION_EXTENSION_NAMES) {
      expect(authoringExtensionNames).not.toContain(decommissionedName);
    }
  });

  it("gives Core and contributed node extensions mounted identity in authoring", () => {
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
    const semanticLabel = extensions.find(({ name }) => name === "semanticLabel");
    const frame = extensions.find(({ name }) => name === "runtimeBlockFrameAttributes");

    expect(
      Object.keys(schema.nodes).filter((name) => name === capability.definition.nodeType),
    ).toHaveLength(1);
    expect(
      extensions.filter((extension) => extension === capability.authoringExtension),
    ).toHaveLength(1);
    expect(extensions).not.toContain(capability.runtimeExtension);
    expect(uniqueId?.options["types"]).toBe("all");
    expect(semanticLabel).toBeDefined();
    expect(schema.nodes["paragraph"]?.spec.attrs?.["id"]).toBeDefined();
    expect(schema.nodes["paragraph"]?.spec.attrs?.["semanticLabel"]?.default).toBeNull();
    expect(
      schema.nodes[`${capability.definition.nodeType}_child`]?.spec.attrs?.["id"],
    ).toBeDefined();
    expect(
      schema.nodes[capability.definition.nodeType]?.spec.attrs?.["semanticLabel"]?.default,
    ).toBeNull();
    expect(
      schema.nodes[`${capability.definition.nodeType}_child`]?.spec.attrs?.["semanticLabel"]
        ?.default,
    ).toBeNull();
    for (const [nodeType, nodeSchema] of Object.entries(schema.nodes)) {
      if (
        nodeType === "text" ||
        UNAVAILABLE_CONTENT_NODE_NAMES.includes(
          nodeType as (typeof UNAVAILABLE_CONTENT_NODE_NAMES)[number],
        )
      ) {
        continue;
      }
      expect(nodeSchema.spec.attrs?.["semanticLabel"]?.default, nodeType).toBeNull();
    }
    for (const nodeType of UNAVAILABLE_CONTENT_NODE_NAMES) {
      expect(schema.nodes[nodeType]?.spec.attrs?.["semanticLabel"], nodeType).toBeUndefined();
    }
    expect(schema.nodes["doc"]?.spec.attrs?.["id"]).toBeUndefined();
    expect(schema.nodes["text"]?.spec.attrs?.["id"]).toBeUndefined();
    expect(schema.marks["bold"]?.spec.attrs?.["id"]).toBeUndefined();
    expect(frame?.options["resizableBlockNodeTypes"]).toContain(capability.definition.nodeType);

    const editor = new Editor({
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
    expect(firstSchema.nodes[`${first.definition.nodeType}_child`]).toBeDefined();
    expect(firstSchema.nodes[`${second.definition.nodeType}_child`]).toBeUndefined();
    expect(secondSchema.nodes[`${second.definition.nodeType}_child`]).toBeDefined();
    expect(secondSchema.nodes[`${first.definition.nodeType}_child`]).toBeUndefined();
  });

  it("constructs Grid authoring nodes from the exact mounted Block registry", () => {
    const capability = hostBlockCapability("host_grid_owner_block");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-grid-owner",
          blocks: [capability],
        }),
      ],
    });
    const extensions = createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    });

    expect(extensions.find(({ name }) => name === "grid")).not.toBe(GridAuthoringNode);
    expect(extensions.find(({ name }) => name === "cell")).not.toBe(CellAuthoringNode);
  });
});

function hostBlockCapability(nodeType: string): BlockCapability {
  const childNodeType = `${nodeType}_child`;
  const inlineNodeType = `${nodeType}_inline_atom`;
  return {
    definition: {
      nodeType,
      title: `Host ${nodeType}`,
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

function contributedIdentityDocument(nodeType: string): JSONContent {
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
            attrs: { id: "surfaceAuth1", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layoutAuth01",
                  variant: "tabs",
                  options: { variant: "default", label: `${lane} tabs` },
                },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: "sectionAuth1",
                      role: "tab-panel",
                      label: "First tab",
                      options: { label: "First tab" },
                    },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "paraAuth0001" },
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
            id: `hostsection${index + 1}`,
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
            attrs: { id: "hostsurface1", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "hostlayout01",
                  variant,
                  options: {},
                },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: "hostsection1",
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
        attrs: { id: "courseDoc001", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "hostsurface1", variant, settings: {} },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
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

function findNodeJsonById(editor: Editor, id: string): JSONContent | null {
  let found: JSONContent | null = null;

  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] !== id) return true;
    found = node.toJSON();
    return false;
  });

  return found;
}
