import { CircleIcon } from "@phosphor-icons/react";
import { Node } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import * as surfaceVariantRegistry from "@/editor/surfaces/model/surface-variant-registry";
import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";

import type { BlockCapability } from "./block-capability";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type LayoutCapability,
} from "./create-scaffold-application";
import type { SurfaceCapability } from "./surface-capability";

const createHostTracerSurface = vi.fn(({ surfaceId }: { surfaceId: string }) => ({
  type: "surface",
  attrs: { id: surfaceId, variant: "host-tracer-first", settings: {} },
  content: [{ type: "paragraph" }],
}));
const hostTracerSurface = testSurfaceCapability("host-tracer-first", createHostTracerSurface);
const hostTracerPack = defineScaffoldExtensionPack({
  id: "first-surface-host",
  surfaces: [hostTracerSurface],
});

describe("createScaffoldApplication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createHostTracerSurface.mockClear();
  });

  it("validates built-in Surface factories during explicit application construction", () => {
    const validateFactories = vi.spyOn(surfaceVariantRegistry, "validateSurfaceVariantFactories");

    const application = createScaffoldApplication();

    expect(validateFactories).toHaveBeenCalledOnce();
    expect(validateFactories).toHaveBeenCalledWith(application.capabilities.surfaces.registry);
    expect(application.capabilities.surfaces.registry).not.toBe(builtInSurfaceVariantRegistry);
    expect(application.capabilities.surfaces.registry.definitions.map(({ id }) => id)).toEqual(
      builtInSurfaceVariantRegistry.definitions.map(({ id }) => id),
    );
  });

  it("shares neutral capabilities while keeping authoring and runtime views lane-local", () => {
    const hostLayout = testLayoutCapability("host-columns");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-content",
          layouts: [hostLayout],
        }),
      ],
    });

    expect(application.authoring.capabilities).toBe(application.capabilities);
    expect(application.runtime.capabilities).toBe(application.capabilities);
    expect(Object.keys(application.capabilities)).toEqual([
      "blocks",
      "layouts",
      "surfaces",
      "contentIdentity",
      "documentSemantics",
    ]);
    expect(Object.keys(application.capabilities.blocks)).toEqual(["registry"]);
    expect(Object.keys(application.capabilities.layouts)).toEqual(["registry"]);
    expect(Object.keys(application.capabilities.surfaces)).toEqual(["registry"]);
    expect(application.authoring.capabilities.blocks.registry).toBe(
      application.capabilities.blocks.registry,
    );
    expect(application.runtime.capabilities.blocks.registry).toBe(
      application.capabilities.blocks.registry,
    );
    expect(application.authoring.capabilities.surfaces.registry).toBe(
      application.capabilities.surfaces.registry,
    );
    expect(application.runtime.capabilities.surfaces.registry).toBe(
      application.capabilities.surfaces.registry,
    );
    expect(Object.keys(application.authoring.blocks)).toEqual(["extensions"]);
    expect(Object.keys(application.runtime.blocks)).toEqual(["extensions"]);
    expect(Object.keys(application.authoring.layouts)).toEqual(["views"]);
    expect(Object.keys(application.runtime.layouts)).toEqual(["views"]);
    expect(Object.keys(application.authoring.surfaces)).toEqual(["views", "chrome"]);
    expect(Object.keys(application.runtime.surfaces)).toEqual(["views"]);
    expect(application.authoring.documentSemantics).toBe(
      application.capabilities.documentSemantics,
    );
    expect(application.runtime.documentSemantics).toBe(application.capabilities.documentSemantics);
    expect(application.authoring.layouts.views.getById(hostLayout.definition.id)?.layout).toBe(
      TestLayoutAuthoringView,
    );
    expect(application.runtime.layouts.views.getById(hostLayout.definition.id)?.component).toBe(
      TestLayoutRuntimeView,
    );
  });

  it("does not add a parallel Course Structure service to application lanes", () => {
    const application = createScaffoldApplication({ packs: [hostTracerPack] });

    expect(application).not.toHaveProperty("courseStructure");
    expect(application.authoring).not.toHaveProperty("courseStructure");
    expect(application.runtime).not.toHaveProperty("courseStructure");
  });

  it("creates isolated immutable Block and Surface registries for each application", () => {
    const firstApplication = createScaffoldApplication();
    const secondApplication = createScaffoldApplication();

    expect(firstApplication.capabilities.blocks.registry.definitions).toHaveLength(35);
    expect(firstApplication.capabilities.blocks.registry).not.toBe(
      secondApplication.capabilities.blocks.registry,
    );
    expect(firstApplication.capabilities.surfaces.registry.definitions).toHaveLength(18);
    expect(firstApplication.capabilities.surfaces.registry).not.toBe(
      secondApplication.capabilities.surfaces.registry,
    );
    expect(Object.isFrozen(firstApplication.capabilities.blocks)).toBe(true);
    expect(Object.isFrozen(firstApplication.capabilities.blocks.registry)).toBe(true);
    expect(Object.isFrozen(firstApplication.capabilities.surfaces)).toBe(true);
    expect(Object.isFrozen(firstApplication.capabilities.surfaces.registry)).toBe(true);
  });

  it("derives isolated immutable authoring catalogues from each application's cumulative capabilities", () => {
    const hostBlockContent = () => ({ type: "host_catalogue_block" });
    const hostBlock = {
      ...testBlockCapability("host_catalogue_block"),
      definition: {
        nodeType: "host_catalogue_block",
        title: "Host catalogue Block",
        insert: {
          id: "host-catalogue-block",
          title: "Host catalogue Block",
          description: "A host Block projected into its application catalogue",
          icon: CircleIcon,
          category: "content" as const,
          content: hostBlockContent,
        },
      },
    } satisfies BlockCapability;
    const hostLayout = testLayoutCapability("host-catalogue-layout");
    const baseHostSurface = testSurfaceCapability("host-catalogue-surface");
    const hostSurface = {
      ...baseHostSurface,
      definition: {
        ...baseHostSurface.definition,
        catalogue: {
          section: "image" as const,
          order: 1_000,
          preview: { kind: "slot" as const, role: "image" as const },
        },
      },
    } satisfies SurfaceCapability;

    const coreApplication = createScaffoldApplication();
    const hostApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-authoring-catalogues",
          blocks: [hostBlock],
          layouts: [hostLayout],
          surfaces: [hostSurface],
        }),
      ],
    });
    const coreActionIds = coreApplication.authoring.catalogues.inDocument.actions.map(
      ({ id }) => id,
    );
    const coreActionNodeTypes = coreApplication.authoring.catalogues.inDocument.actions.map(
      ({ nodeType }) => nodeType,
    );
    const hostActionIds = hostApplication.authoring.catalogues.inDocument.actions.map(
      ({ id }) => id,
    );

    for (const [outerNodeType, implementationNodeTypes] of [
      ["categorise", ["categorise_content", "categorise_bin", "categorise_item"]],
      ["image_hotspot", ["image_hotspot_canvas"]],
      ["matching", ["matching_pairs_group", "matching_pair", "matching_item", "matching_target"]],
      ["sequencing", ["sequencing_items_group", "sequencing_item"]],
    ] as const) {
      expect(coreActionNodeTypes).toContain(outerNodeType);
      for (const implementationNodeType of implementationNodeTypes) {
        expect(coreActionNodeTypes).not.toContain(implementationNodeType);
      }
    }

    expect(hostActionIds.filter((id) => coreActionIds.includes(id))).toEqual(coreActionIds);
    expect(hostActionIds).toHaveLength(coreActionIds.length + 2);
    expect(hostActionIds.indexOf(hostBlock.definition.insert.id)).toBeLessThan(
      hostActionIds.indexOf(hostLayout.definition.id),
    );
    expect(hostActionIds.indexOf(hostLayout.definition.id)).toBeLessThan(
      hostActionIds.indexOf("grid"),
    );
    expect(
      hostApplication.authoring.catalogues.surfaceCreation
        .forMode("slideshow")
        .map(({ variantId }) => variantId),
    ).toEqual([
      ...coreApplication.authoring.catalogues.surfaceCreation
        .forMode("slideshow")
        .map(({ variantId }) => variantId),
      hostSurface.definition.id,
    ]);

    for (const coreAction of coreApplication.authoring.catalogues.inDocument.actions) {
      expect(hostActionIds.filter((id) => id === coreAction.id)).toHaveLength(1);
      const hostCoreAction = hostApplication.authoring.catalogues.inDocument.getById(coreAction.id);
      expect(hostCoreAction).toMatchObject({
        id: coreAction.id,
        nodeType: coreAction.nodeType,
        title: coreAction.title,
        description: coreAction.description,
        category: coreAction.category,
      });
      expect(hostCoreAction).not.toBe(coreAction);
    }
    expect(
      hostApplication.authoring.catalogues.inDocument.getById(hostBlock.definition.insert.id)
        ?.content,
    ).toBe(hostBlockContent);
    expect(coreApplication.authoring.catalogues).not.toBe(hostApplication.authoring.catalogues);
    expect(coreApplication.authoring.catalogues.inDocument).not.toBe(
      hostApplication.authoring.catalogues.inDocument,
    );
    expect(coreApplication.authoring.catalogues.surfaceCreation).not.toBe(
      hostApplication.authoring.catalogues.surfaceCreation,
    );
    expect(Object.isFrozen(hostApplication.authoring.catalogues)).toBe(true);
  });

  it("projects one complete host Block after all mandatory Core Blocks", () => {
    const hostBlock = testBlockCapability("host_tracer");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-blocks",
          blocks: [hostBlock],
        }),
      ],
    });

    expect(
      application.capabilities.blocks.registry.definitions.map(({ nodeType }) => nodeType),
    ).toEqual([
      ...builtInBlockDefinitions.map(({ nodeType }) => nodeType),
      hostBlock.definition.nodeType,
    ]);
    expect(
      application.capabilities.blocks.registry.definitions.filter(
        ({ nodeType }) => nodeType === hostBlock.definition.nodeType,
      ),
    ).toHaveLength(1);
    expect(
      application.authoring.blocks.extensions.filter(
        (extension) => extension === hostBlock.authoringExtension,
      ),
    ).toHaveLength(1);
    expect(
      application.runtime.blocks.extensions.filter(
        (extension) => extension === hostBlock.runtimeExtension,
      ),
    ).toHaveLength(1);
  });

  it("composes a Block identity rewrite into the immutable application lookup", () => {
    const rewrite = vi.fn(({ content }) => content);
    const hostBlock = {
      ...testBlockCapability("host_duplication_owner"),
      identityRewrites: [{ nodeType: "host_duplication_owner", rewrite }],
    } satisfies BlockCapability;
    const hostApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-duplication-owner",
          blocks: [hostBlock],
        }),
      ],
    });
    const coreApplication = createScaffoldApplication();

    expect(hostApplication.capabilities.contentIdentity.rewrites.getByNodeType("mcq")).toBeTypeOf(
      "function",
    );
    expect(
      hostApplication.capabilities.contentIdentity.rewrites.hasNodeType(
        hostBlock.definition.nodeType,
      ),
    ).toBe(true);
    expect(
      hostApplication.capabilities.contentIdentity.rewrites.getByNodeType(
        hostBlock.definition.nodeType,
      ),
    ).toBe(rewrite);
    expect(
      coreApplication.capabilities.contentIdentity.rewrites.getByNodeType(
        hostBlock.definition.nodeType,
      ),
    ).toBeUndefined();
    expect(Object.isFrozen(hostApplication.capabilities.contentIdentity)).toBe(true);
    expect(Object.isFrozen(hostApplication.capabilities.contentIdentity.rewrites)).toBe(true);
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("composes a Surface identity rewrite without a Block registry dependency", () => {
    const rewrite = vi.fn(({ content }) => content);
    const hostSurface = {
      ...testSurfaceCapability("host-identity-surface"),
      identityRewrites: [{ nodeType: "host_surface_content", rewrite }],
    } satisfies SurfaceCapability;

    const application = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "host-surface-identity", surfaces: [hostSurface] })],
    });

    expect(
      application.capabilities.contentIdentity.rewrites.getByNodeType("host_surface_content"),
    ).toBe(rewrite);
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("uses one combined Block-plus-Surface lookup for an inside-out copy", () => {
    const blockRewrite = vi.fn(({ content }) => ({ ...content, attrs: { owner: "block" } }));
    const surfaceRewrite = vi.fn(({ content }) => ({ ...content, attrs: { owner: "surface" } }));
    const block = {
      ...testBlockCapability("host_identity_block"),
      identityRewrites: [{ nodeType: "host_identity_block", rewrite: blockRewrite }],
    } satisfies BlockCapability;
    const surface = {
      ...testSurfaceCapability("host-identity-surface"),
      identityRewrites: [{ nodeType: "host_surface_content", rewrite: surfaceRewrite }],
    } satisfies SurfaceCapability;
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-combined-identity",
          blocks: [block],
          surfaces: [surface],
        }),
      ],
    });

    const copied = cloneJsonWithNewStableIds(
      {
        type: "host_identity_block",
        content: [{ type: "host_surface_content" }],
      },
      { identityRewrites: application.capabilities.contentIdentity.rewrites },
    );

    expect(copied).toEqual({
      type: "host_identity_block",
      attrs: { owner: "block" },
      content: [{ type: "host_surface_content", attrs: { owner: "surface" } }],
    });
    expect(surfaceRewrite).toHaveBeenCalledBefore(blockRewrite);
  });

  it("rejects conflicting Block and Surface owners with both registrations as evidence", () => {
    const blockRegistration = {
      nodeType: "shared_identity_owner",
      rewrite: vi.fn(({ content }) => content),
    };
    const surfaceRegistration = {
      nodeType: "shared_identity_owner",
      rewrite: vi.fn(({ content }) => content),
    };
    const block = {
      ...testBlockCapability("host_identity_block"),
      identityRewrites: [blockRegistration],
    } satisfies BlockCapability;
    const surface = {
      ...testSurfaceCapability("host-identity-surface"),
      identityRewrites: [surfaceRegistration],
    } satisfies SurfaceCapability;
    const pack = defineScaffoldExtensionPack({
      id: "host-conflicting-identity",
      blocks: [block],
      surfaces: [surface],
    });

    try {
      createScaffoldApplication({ packs: [pack] });
      throw new Error("Expected conflicting identity registrations to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        message:
          'Duplicate content identity rewrite registration for "shared_identity_owner".',
        cause: {
          nodeType: "shared_identity_owner",
          registrations: [blockRegistration, surfaceRegistration],
        },
      });
    }
  });

  it("shares one exact Core-plus-host semantic lookup across both composition lanes", () => {
    const describeBlock = vi.fn(() => ({ label: "Host semantic block" }));
    const describeLayout = vi.fn(() => ({ label: "Host semantic layout" }));
    const describeSurface = vi.fn(() => ({ label: "Host semantic surface" }));
    const baseBlock = testBlockCapability("host_semantic_block");
    const baseLayout = testLayoutCapability("host-semantic-layout");
    const baseSurface = testSurfaceCapability("host-semantic-surface");
    const hostBlock = {
      ...baseBlock,
      definition: defineBlock({
        nodeType: "host_semantic_block",
        title: "Host semantic block",
        documentSemantics: { describe: describeBlock },
      }),
    } satisfies BlockCapability;
    const hostLayout = {
      ...baseLayout,
      definition: {
        ...baseLayout.definition,
        documentSemantics: { describe: describeLayout },
      },
    } satisfies LayoutCapability;
    const hostSurface = {
      ...baseSurface,
      definition: {
        ...baseSurface.definition,
        documentSemantics: { describe: describeSurface },
      },
    } satisfies SurfaceCapability;

    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-document-semantics",
          blocks: [hostBlock],
          layouts: [hostLayout],
          surfaces: [hostSurface],
        }),
      ],
    });
    const lookup = application.capabilities.documentSemantics;

    expect(lookup.blocks.get("code_block")?.title).toBe("Code block");
    expect(lookup.blocks.get(hostBlock.definition.nodeType)).toMatchObject({
      nodeType: hostBlock.definition.nodeType,
      title: "Host semantic block",
      documentSemantics: hostBlock.definition.documentSemantics,
    });
    expect(lookup.layouts.get(hostLayout.definition.id)?.documentSemantics?.describe).toBe(
      describeLayout,
    );
    expect(lookup.surfaces.get(hostSurface.definition.id)?.documentSemantics?.describe).toBe(
      describeSurface,
    );
    expect(lookup.blocks.get("unmounted_block")).toBeUndefined();
    expect(lookup.layouts.get("unmounted-layout")).toBeUndefined();
    expect(lookup.surfaces.get("unmounted-surface")).toBeUndefined();
    expect(application.authoring.documentSemantics).toBe(lookup);
    expect(application.runtime.documentSemantics).toBe(lookup);
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(describeBlock).not.toHaveBeenCalled();
    expect(describeLayout).not.toHaveBeenCalled();
    expect(describeSurface).not.toHaveBeenCalled();
  });

  it("projects complete host Surfaces after Core in pack order without leaking between applications", () => {
    const secondSurface = testSurfaceCapability("host-tracer-second");

    expect(createHostTracerSurface).not.toHaveBeenCalled();

    const application = createScaffoldApplication({
      packs: [
        hostTracerPack,
        defineScaffoldExtensionPack({
          id: "second-surface-host",
          surfaces: [secondSurface],
        }),
      ],
    });
    const coreApplication = createScaffoldApplication();

    expect(createHostTracerSurface).toHaveBeenCalledOnce();
    expect(application.capabilities.surfaces.registry.definitions.map(({ id }) => id)).toEqual([
      ...builtInSurfaceVariantDefinitions.map(({ id }) => id),
      hostTracerSurface.definition.id,
      secondSurface.definition.id,
    ]);
    expect(
      application.capabilities.surfaces.registry.definitions.filter(
        ({ id }) => id === hostTracerSurface.definition.id,
      ),
    ).toHaveLength(1);
    expect(
      application.authoring.surfaces.views.get(hostTracerSurface.definition.id)?.component,
    ).toBe(TestSurfaceAuthoringView);
    expect(
      application.authoring.surfaces.chrome
        .resolve(hostTracerSurface.definition.id)
        ?.quickMenu?.controls.map(({ name }) => name),
    ).toEqual(["accent"]);
    expect(application.runtime.surfaces.views.get(hostTracerSurface.definition.id)?.component).toBe(
      TestSurfaceRuntimeView,
    );
    expect(
      application.runtime.surfaces.views.get(hostTracerSurface.definition.id)?.component,
    ).not.toBe(TestSurfaceAuthoringView);
    expect(
      coreApplication.capabilities.surfaces.registry.get(hostTracerSurface.definition.id),
    ).toBe(undefined);
    expect(coreApplication.authoring.surfaces.views.get(hostTracerSurface.definition.id)).toBe(
      undefined,
    );
    expect(coreApplication.runtime.surfaces.views.get(hostTracerSurface.definition.id)).toBe(
      undefined,
    );
    expect(Object.isFrozen(application.authoring.surfaces)).toBe(true);
    expect(Object.isFrozen(application.authoring.surfaces.views)).toBe(true);
    expect(Object.isFrozen(application.authoring.surfaces.chrome)).toBe(true);
    expect(Object.isFrozen(application.runtime.surfaces)).toBe(true);
    expect(Object.isFrozen(application.runtime.surfaces.views)).toBe(true);
  });
});

function testBlockCapability(nodeType: string): BlockCapability {
  return {
    definition: { nodeType, title: `Block ${nodeType}` },
    authoringExtension: Node.create({ name: nodeType }),
    runtimeExtension: Node.create({ name: nodeType }),
  };
}

function testLayoutCapability(id: string): LayoutCapability {
  return {
    definition: {
      id,
      title: "Host layout",
      description: "Host-contributed layout",
      icon: CircleIcon,
      createContent: () => ({
        type: "layout",
        attrs: { id: `${id}-instance`, variant: id },
        content: [{ type: "section", attrs: { id: `${id}-section` } }],
      }),
    },
    authoringView: {
      id,
      layout: TestLayoutAuthoringView,
    },
    runtimeView: {
      id,
      component: TestLayoutRuntimeView,
    },
  };
}

function TestLayoutAuthoringView() {
  return null;
}

function TestLayoutRuntimeView() {
  return null;
}

function testSurfaceCapability(
  id: string,
  createSurface: SurfaceCapability["definition"]["createSurface"] = ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: id, settings: {} },
    content: [{ type: "paragraph" }],
  }),
): SurfaceCapability {
  const settingsSchema = z.object({ accent: z.boolean().optional() }).strict();

  return {
    definition: {
      id,
      modes: ["slideshow"],
      title: "Host tracer Surface",
      description: "A host-contributed Surface used to trace application composition.",
      settingsSchema,
      createSurface,
    },
    authoringView: {
      variantId: id,
      component: TestSurfaceAuthoringView,
      configuration: {
        attr: "settings",
        schema: settingsSchema,
        controls: [
          {
            kind: "boolean",
            name: "accent",
            label: "Accent",
            placement: { quickMenu: { order: 10 } },
          },
        ],
      },
    },
    runtimeView: {
      variantId: id,
      component: TestSurfaceRuntimeView,
    },
  };
}

function TestSurfaceAuthoringView() {
  return null;
}

function TestSurfaceRuntimeView() {
  return null;
}
