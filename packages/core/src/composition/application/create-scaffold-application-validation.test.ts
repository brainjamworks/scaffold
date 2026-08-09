import { CircleIcon } from "@phosphor-icons/react";
import { Extension, Node, type AnyExtension } from "@tiptap/core";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import type { BlockAuthoringBinding } from "@/editor/blocks/authoring-block-extensions";
import type { BlockRuntimeBinding } from "@/editor/blocks/runtime-block-extensions";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";

import { createBlockCapabilitiesFromBindings, type BlockCapability } from "./block-capability";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type LayoutCapability,
} from "./create-scaffold-application";
import {
  createSurfaceCapabilitiesFromBindings,
  type SurfaceCapability,
} from "./surface-capability";

describe("createScaffoldApplication", () => {
  it("resolves every Core built-in Layout before host Layout capabilities", () => {
    const hostLayout = testLayoutCapability("host-columns");
    const composition = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-content",
          layouts: [hostLayout],
        }),
      ],
    });

    expect(composition.capabilities.layouts.registry.definitions.map(({ id }) => id)).toEqual([
      ...builtInLayoutDefinitions.map(({ id }) => id),
      hostLayout.definition.id,
    ]);
    for (const definition of composition.capabilities.layouts.registry.definitions) {
      expect(composition.authoring.layouts.views.getById(definition.id)).toBeDefined();
      expect(composition.runtime.layouts.views.getById(definition.id)).toBeDefined();
    }
    expect(composition.authoring.layouts.views.getById(hostLayout.definition.id)?.layout).toBe(
      TestLayoutAuthoringView,
    );
    expect(composition.runtime.layouts.views.getById(hostLayout.definition.id)?.component).toBe(
      TestLayoutRuntimeView,
    );
  });

  it("copies and freezes pack collections without mutating caller inputs", () => {
    const blockCapability = testBlockCapability("host_immutable_block");
    const blocks = [blockCapability];
    const capability = testLayoutCapability("host-immutable-layout");
    const layouts = [capability];
    const surfaceCapability = testSurfaceCapability("host-immutable-surface");
    const surfaces = [surfaceCapability];
    const pack = defineScaffoldExtensionPack({
      id: "immutable-host",
      blocks,
      layouts,
      surfaces,
    });

    const composition = createScaffoldApplication({ packs: [pack] });

    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.blocks)).toBe(true);
    expect(pack.blocks).not.toBe(blocks);
    expect(pack.blocks[0]).not.toBe(blockCapability);
    expect(pack.blocks[0]?.definition).toBe(blockCapability.definition);
    expect(Object.isFrozen(pack.blocks[0])).toBe(true);
    expect(Object.isFrozen(pack.layouts)).toBe(true);
    expect(pack.layouts).not.toBe(layouts);
    expect(pack.layouts[0]).not.toBe(capability);
    expect(Object.isFrozen(pack.layouts[0])).toBe(true);
    expect(layouts).toEqual([capability]);
    expect(Object.isFrozen(pack.surfaces)).toBe(true);
    expect(pack.surfaces).not.toBe(surfaces);
    expect(pack.surfaces[0]).not.toBe(surfaceCapability);
    expect(Object.keys(pack.surfaces[0] ?? {})).toEqual([
      "definition",
      "authoringView",
      "runtimeView",
    ]);
    expect(pack.surfaces[0]?.definition).toBe(surfaceCapability.definition);
    expect(pack.surfaces[0]?.authoringView).toBe(surfaceCapability.authoringView);
    expect(pack.surfaces[0]?.runtimeView).toBe(surfaceCapability.runtimeView);
    expect(Object.isFrozen(pack.surfaces[0])).toBe(true);
    expect(Object.isFrozen(surfaceCapability.definition)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.definition.settingsSchema)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.definition.createSurface)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.authoringView)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.authoringView.component)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.authoringView.configuration)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.runtimeView)).toBe(false);
    expect(Object.isFrozen(surfaceCapability.runtimeView.component)).toBe(false);
    expect(surfaces).toEqual([surfaceCapability]);
    expect(Object.isFrozen(composition)).toBe(true);
    expect(Object.isFrozen(composition.capabilities)).toBe(true);
    expect(Object.isFrozen(composition.capabilities.layouts)).toBe(true);
    expect(Object.isFrozen(composition.capabilities.layouts.registry)).toBe(true);
    expect(Object.isFrozen(composition.authoring.blocks.extensions)).toBe(true);
    expect(Object.isFrozen(composition.runtime.blocks.extensions)).toBe(true);
    expect(Object.isFrozen(composition.authoring.layouts.views)).toBe(true);
    expect(Object.isFrozen(composition.runtime.layouts.views)).toBe(true);
  });

  it("joins Core Surface bindings by persisted variant ID rather than position", () => {
    const first = testSurfaceCapability("joined-first");
    const second = testSurfaceCapability("joined-second");

    const capabilities = createSurfaceCapabilitiesFromBindings({
      owner: "Core",
      definitions: [first.definition, second.definition],
      authoringBindings: [second.authoringView, first.authoringView],
      runtimeBindings: [second.runtimeView, first.runtimeView],
    });

    expect(capabilities).toEqual([first, second]);
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(capabilities.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    {
      label: "missing authoring",
      authoringIds: [] as readonly string[],
      runtimeIds: ["joined"],
      message: 'Core Surface definition "joined" is missing its authoring view binding.',
    },
    {
      label: "missing runtime",
      authoringIds: ["joined"],
      runtimeIds: [] as readonly string[],
      message: 'Core Surface definition "joined" is missing its runtime view binding.',
    },
    {
      label: "extra authoring",
      authoringIds: ["joined", "extra"],
      runtimeIds: ["joined"],
      message: 'Core authoring Surface binding "extra" has no matching definition.',
    },
    {
      label: "extra runtime",
      authoringIds: ["joined"],
      runtimeIds: ["joined", "extra"],
      message: 'Core runtime Surface binding "extra" has no matching definition.',
    },
    {
      label: "duplicate authoring",
      authoringIds: ["joined", "joined"],
      runtimeIds: ["joined"],
      message: 'Core authoring Surface binding variant ID "joined" is duplicated.',
    },
    {
      label: "duplicate runtime",
      authoringIds: ["joined"],
      runtimeIds: ["joined", "joined"],
      message: 'Core runtime Surface binding variant ID "joined" is duplicated.',
    },
  ])("reports $label Core Surface bindings deterministically", (testCase) => {
    const capability = testSurfaceCapability("joined");

    expect(() =>
      createSurfaceCapabilitiesFromBindings({
        owner: "Core",
        definitions: [capability.definition],
        authoringBindings: testCase.authoringIds.map((variantId) => ({
          variantId,
          component: TestSurfaceAuthoringView,
        })),
        runtimeBindings: testCase.runtimeIds.map((variantId) => ({
          variantId,
          component: TestSurfaceRuntimeView,
        })),
      }),
    ).toThrow(testCase.message);
  });

  it("isolates registered Layout-owned records between compositions", () => {
    const keywords = ["host keyword"];
    const placeholders = { paragraph: "Host paragraph" };
    const section = {
      label: "Host section",
      addLabel: "Add host section",
      create: () => ({ type: "section" }),
    };
    const baseCapability = testLayoutCapability("host-isolated-layout");
    const sharedCapability = {
      ...baseCapability,
      definition: {
        ...baseCapability.definition,
        keywords,
        placeholders,
        section,
      },
    } satisfies LayoutCapability;
    const pack = defineScaffoldExtensionPack({
      id: "isolated-host",
      layouts: [sharedCapability],
    });

    const firstComposition = createScaffoldApplication({ packs: [pack] });
    const secondComposition = createScaffoldApplication({ packs: [pack] });
    const firstRegistered = firstComposition.capabilities.layouts.registry.getById(
      sharedCapability.definition.id,
    );
    const secondRegistered = secondComposition.capabilities.layouts.registry.getById(
      sharedCapability.definition.id,
    );

    expect(firstRegistered).toBeDefined();
    expect(secondRegistered).toBeDefined();
    expect(firstRegistered?.keywords).not.toBe(keywords);
    expect(firstRegistered?.placeholders).not.toBe(placeholders);
    expect(firstRegistered?.section).not.toBe(section);
    expect(firstRegistered?.keywords).not.toBe(secondRegistered?.keywords);
    expect(firstRegistered?.placeholders).not.toBe(secondRegistered?.placeholders);
    expect(firstRegistered?.section).not.toBe(secondRegistered?.section);
    expect(Object.isFrozen(firstRegistered?.keywords)).toBe(true);
    expect(Object.isFrozen(firstRegistered?.placeholders)).toBe(true);
    expect(Object.isFrozen(firstRegistered?.section)).toBe(true);

    keywords.push("caller mutation");
    placeholders.paragraph = "Changed by caller";
    section.label = "Changed by caller";

    expect(firstRegistered?.keywords).toEqual(["host keyword"]);
    expect(secondRegistered?.keywords).toEqual(["host keyword"]);
    expect(firstRegistered?.placeholders?.paragraph).toBe("Host paragraph");
    expect(secondRegistered?.placeholders?.paragraph).toBe("Host paragraph");
    expect(firstRegistered?.section?.label).toBe("Host section");
    expect(secondRegistered?.section?.label).toBe("Host section");

    expect(Reflect.set(firstRegistered!.keywords!, 0, "first mutation")).toBe(false);
    expect(Reflect.set(firstRegistered!.placeholders!, "paragraph", "first mutation")).toBe(false);
    expect(Reflect.set(firstRegistered!.section!, "label", "first mutation")).toBe(false);
    expect(firstRegistered?.keywords).toEqual(["host keyword"]);
    expect(secondRegistered?.keywords).toEqual(["host keyword"]);
    expect(firstRegistered?.placeholders?.paragraph).toBe("Host paragraph");
    expect(secondRegistered?.placeholders?.paragraph).toBe("Host paragraph");
    expect(firstRegistered?.section?.label).toBe("Host section");
    expect(secondRegistered?.section?.label).toBe("Host section");
  });

  it("does not call Layout factories, components, or hooks while resolving a composition", () => {
    const createContent = vi.fn(() => ({
      type: "layout",
      attrs: { id: "dormant-instance", variant: "host-dormant-layout" },
      content: [{ type: "section", attrs: { id: "dormant-section" } }],
    }));
    const createSection = vi.fn(() => ({
      type: "section",
      attrs: { id: "dormant-created-section" },
    }));
    const authoringLayout = vi.fn(() => null);
    const authoringSection = vi.fn(() => null);
    const authoringSectionFrame = vi.fn(() => ({}));
    const runtimeComponent = vi.fn(() => null);
    const runtimeSectionComponent = vi.fn(() => null);
    const runtimeSectionFrame = vi.fn(() => ({}));
    const baseCapability = testLayoutCapability("host-dormant-layout", createContent);
    const capability = {
      ...baseCapability,
      definition: {
        ...baseCapability.definition,
        section: {
          label: "Section",
          addLabel: "Add section",
          create: createSection,
        },
      },
      authoringView: {
        id: baseCapability.definition.id,
        layout: authoringLayout,
        section: authoringSection,
        sectionFrame: authoringSectionFrame,
      },
      runtimeView: {
        id: baseCapability.definition.id,
        component: runtimeComponent,
        sectionComponent: runtimeSectionComponent,
        sectionFrame: runtimeSectionFrame,
      },
    } satisfies LayoutCapability;

    const pack = defineScaffoldExtensionPack({ id: "dormant-host", layouts: [capability] });
    createScaffoldApplication({ packs: [pack] });

    for (const callable of [
      createContent,
      createSection,
      authoringLayout,
      authoringSection,
      authoringSectionFrame,
      runtimeComponent,
      runtimeSectionComponent,
      runtimeSectionFrame,
    ]) {
      expect(callable).not.toHaveBeenCalled();
    }
  });

  it("accepts an ID-only runtime view for generic learner rendering", () => {
    const capability = testLayoutCapability("host-generic-runtime");
    const idOnlyRuntimeCapability = {
      ...capability,
      runtimeView: { id: capability.definition.id },
    } satisfies LayoutCapability;
    const pack = defineScaffoldExtensionPack({
      id: "generic-runtime-host",
      layouts: [idOnlyRuntimeCapability],
    });

    const composition = createScaffoldApplication({ packs: [pack] });
    const runtimeView = composition.runtime.layouts.views.getById(capability.definition.id);

    expect(runtimeView).toMatchObject({
      id: capability.definition.id,
      nodeType: "layout",
    });
    expect(runtimeView?.component).toBeUndefined();
  });

  it("rejects blank pack IDs clearly", () => {
    expect(() => defineScaffoldExtensionPack({ id: "  " })).toThrow(
      'Scaffold extension pack ID "  " must be a stable kebab-case name.',
    );
  });

  it("rejects extension pack names that are not kebab-case at both composition seams", () => {
    expect(() => defineScaffoldExtensionPack({ id: "Scaffold_Plus" })).toThrow(
      'Scaffold extension pack ID "Scaffold_Plus" must be a stable kebab-case name.',
    );

    const rawPack = {
      id: "host_content",
      blocks: [],
      layouts: [],
      surfaces: [],
    };
    expect(() => createScaffoldApplication({ packs: [rawPack] })).toThrow(
      'Scaffold extension pack ID "host_content" must be a stable kebab-case name.',
    );
  });

  it("rejects duplicate pack IDs clearly", () => {
    const first = defineScaffoldExtensionPack({ id: "duplicate-host" });
    const second = defineScaffoldExtensionPack({ id: "duplicate-host" });

    expect(() => createScaffoldApplication({ packs: [first, second] })).toThrow(
      'Duplicate Scaffold extension pack ID "duplicate-host".',
    );
  });

  it("rejects a host Layout that attempts to override a Core built-in", () => {
    const builtInId = builtInLayoutDefinitions[0]!.id;
    const pack = defineScaffoldExtensionPack({
      id: "override-host",
      layouts: [testLayoutCapability(builtInId)],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Layout definition ID "${builtInId}" is duplicated.`,
    );
  });

  it("rejects the same Layout ID contributed by two host packs", () => {
    const duplicateId = "duplicate-host-layout";
    const first = defineScaffoldExtensionPack({
      id: "first-host",
      layouts: [testLayoutCapability(duplicateId)],
    });
    const second = defineScaffoldExtensionPack({
      id: "second-host",
      layouts: [testLayoutCapability(duplicateId)],
    });

    expect(() => createScaffoldApplication({ packs: [first, second] })).toThrow(
      `Layout definition ID "${duplicateId}" is duplicated.`,
    );
  });

  it.each(["authoring", "runtime"] as const)(
    "rejects a Block capability missing its %s bundle",
    (lane) => {
      const nodeType = `missing_${lane}`;
      const capability = testBlockCapability(nodeType);
      const incomplete = {
        ...capability,
        ...(lane === "authoring"
          ? { authoringExtension: undefined }
          : { runtimeExtension: undefined }),
      } as unknown as BlockCapability;
      const pack = defineScaffoldExtensionPack({
        id: `missing-${lane}-block-host`,
        blocks: [incomplete],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
        `Block capability "${nodeType}" is missing its ${lane} extension bundle.`,
      );
    },
  );

  it.each(["authoring", "runtime"] as const)(
    "rejects a Block capability whose %s bundle lacks its persisted root Node",
    (lane) => {
      const nodeType = `mismatched_${lane}`;
      const capability = testBlockCapability(nodeType, {
        [`${lane}Extension`]: Node.create({ name: `different_${lane}_root` }),
      });
      const pack = defineScaffoldExtensionPack({
        id: `mismatched-${lane}-block-host`,
        blocks: [capability],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
        `Block capability "${nodeType}" ${lane} extension bundle must contain exactly one root Node named "${nodeType}"; found 0.`,
      );
    },
  );

  it("rejects a host Block that attempts to override a Core built-in", () => {
    const nodeType = builtInBlockDefinitions[0]!.nodeType;
    const pack = defineScaffoldExtensionPack({
      id: "core-block-override-host",
      blocks: [testBlockCapability(nodeType)],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Duplicate block node type "${nodeType}".`,
    );
  });

  it("rejects the same Block node type contributed by two host packs", () => {
    const nodeType = "duplicate_host_block";
    const first = defineScaffoldExtensionPack({
      id: "first-block-host",
      blocks: [testBlockCapability(nodeType)],
    });
    const second = defineScaffoldExtensionPack({
      id: "second-block-host",
      blocks: [testBlockCapability(nodeType)],
    });

    expect(() => createScaffoldApplication({ packs: [first, second] })).toThrow(
      `Duplicate block node type "${nodeType}".`,
    );
  });

  it("rejects a host Block whose projected action ID duplicates a Core action", () => {
    const coreActionId = builtInBlockDefinitions.find((definition) => definition.insert)?.insert
      ?.id;
    if (!coreActionId) throw new Error("Expected an insertable Core Block definition.");
    const capability = testBlockCapability("host_duplicate_action", {
      definition: {
        nodeType: "host_duplicate_action",
        title: "Host duplicate action",
        insert: {
          id: coreActionId,
          title: "Duplicate action",
          description: "A host action that collides with Core",
          icon: CircleIcon,
          category: "content",
          content: () => ({ type: "host_duplicate_action" }),
        },
      },
    });
    const pack = defineScaffoldExtensionPack({
      id: "duplicate-insert-action-host",
      blocks: [capability],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Duplicate insert action id "${coreActionId}".`,
    );
  });

  it.each(["authoring", "runtime"] as const)(
    "rejects duplicate flattened %s extension names across complete capabilities",
    (lane) => {
      const first = testBlockCapability("first_private_owner", {
        [`${lane}Extension`]: testBlockBundle(
          `first-${lane}-bundle`,
          "first_private_owner",
          "shared-private-node",
        ),
      });
      const second = testBlockCapability("second_private_owner", {
        [`${lane}Extension`]: testBlockBundle(
          `second-${lane}-bundle`,
          "second_private_owner",
          "shared-private-node",
        ),
      });
      const pack = defineScaffoldExtensionPack({
        id: `duplicate-${lane}-extension-host`,
        blocks: [first, second],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
        `${lane === "authoring" ? "Authoring" : "Runtime"} Block extension name "shared-private-node" is duplicated by capabilities "first_private_owner" and "second_private_owner".`,
      );
    },
  );

  it.each(
    (["authoring", "runtime"] as const).flatMap((lane) =>
      (["unavailable_block", "unavailable_layout", "unavailable_surface"] as const).map(
        (reservedName) => ({ lane, reservedName }),
      ),
    ),
  )(
    "rejects reserved compatibility name $reservedName in a nested $lane bundle",
    ({ lane, reservedName }) => {
      const nodeType = `host_reserved_${lane}_${reservedName}`;
      const capability = testBlockCapability(nodeType, {
        [`${lane}Extension`]: testBlockBundle(
          `reserved-${lane}-${reservedName.replaceAll("_", "-")}`,
          nodeType,
          reservedName,
        ),
      });
      const id = `reserved-${lane}-${reservedName.replaceAll("_", "-")}`;
      const message = `Scaffold ${lane} Block extension name "${reservedName}" is reserved for unavailable-content compatibility.`;

      expect(() => defineScaffoldExtensionPack({ id, blocks: [capability] })).toThrow(message);
      expect(() =>
        createScaffoldApplication({
          packs: [{ id, blocks: [capability], layouts: [], surfaces: [] }],
        }),
      ).toThrow(message);
    },
  );

  it("keeps Block insertion content factories dormant during composition validation", () => {
    const content = vi.fn(() => ({ type: "host_dormant_block" }));
    const capability = testBlockCapability("host_dormant_block", {
      definition: {
        nodeType: "host_dormant_block",
        title: "Host dormant Block",
        insert: {
          id: "host-dormant-block",
          title: "Dormant Block",
          description: "A host Block whose factory stays dormant during composition",
          icon: CircleIcon,
          category: "content",
          content,
        },
      },
    });
    const pack = defineScaffoldExtensionPack({
      id: "dormant-block-host",
      blocks: [capability],
    });

    createScaffoldApplication({ packs: [pack] });

    expect(content).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing authoring",
      authoringBindings: [] as readonly BlockAuthoringBinding[],
      runtimeBindings: [{ nodeType: "joined", extension: Node.create({ name: "joined" }) }],
      message: 'Core Block definition "joined" is missing its authoring binding.',
    },
    {
      label: "missing runtime",
      authoringBindings: [{ nodeType: "joined", extension: Node.create({ name: "joined" }) }],
      runtimeBindings: [] as readonly BlockRuntimeBinding[],
      message: 'Core Block definition "joined" is missing its runtime binding.',
    },
    {
      label: "extra authoring",
      authoringBindings: [
        { nodeType: "joined", extension: Node.create({ name: "joined" }) },
        { nodeType: "extra", extension: Node.create({ name: "extra" }) },
      ],
      runtimeBindings: [{ nodeType: "joined", extension: Node.create({ name: "joined" }) }],
      message: 'Core authoring Block binding "extra" has no matching definition.',
    },
    {
      label: "extra runtime",
      authoringBindings: [{ nodeType: "joined", extension: Node.create({ name: "joined" }) }],
      runtimeBindings: [
        { nodeType: "joined", extension: Node.create({ name: "joined" }) },
        { nodeType: "extra", extension: Node.create({ name: "extra" }) },
      ],
      message: 'Core runtime Block binding "extra" has no matching definition.',
    },
    {
      label: "duplicate authoring",
      authoringBindings: [
        { nodeType: "joined", extension: Node.create({ name: "joined" }) },
        { nodeType: "joined", extension: Node.create({ name: "joined" }) },
      ],
      runtimeBindings: [{ nodeType: "joined", extension: Node.create({ name: "joined" }) }],
      message: 'Core authoring Block binding node type "joined" is duplicated.',
    },
    {
      label: "duplicate runtime",
      authoringBindings: [{ nodeType: "joined", extension: Node.create({ name: "joined" }) }],
      runtimeBindings: [
        { nodeType: "joined", extension: Node.create({ name: "joined" }) },
        { nodeType: "joined", extension: Node.create({ name: "joined" }) },
      ],
      message: 'Core runtime Block binding node type "joined" is duplicated.',
    },
  ])("reports $label Core Block bindings deterministically", (testCase) => {
    expect(() =>
      createBlockCapabilitiesFromBindings({
        owner: "Core",
        definitions: [{ nodeType: "joined", title: "Joined" }],
        authoringBindings: testCase.authoringBindings,
        runtimeBindings: testCase.runtimeBindings,
      }),
    ).toThrow(testCase.message);
  });

  it.each([
    {
      label: "authoring",
      capability: () => {
        const { authoringView: _authoringView, ...incomplete } =
          testLayoutCapability("missing-authoring");
        return incomplete as unknown as LayoutCapability;
      },
      message: 'Layout capability "missing-authoring" is missing its authoring view registration.',
    },
    {
      label: "runtime",
      capability: () => {
        const { runtimeView: _runtimeView, ...incomplete } =
          testLayoutCapability("missing-runtime");
        return incomplete as unknown as LayoutCapability;
      },
      message: 'Layout capability "missing-runtime" is missing its runtime view registration.',
    },
  ])("rejects a Layout capability missing its $label binding", ({ capability, label, message }) => {
    const pack = defineScaffoldExtensionPack({
      id: `incomplete-${label}`,
      layouts: [capability()],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(message);
  });

  it.each([
    {
      label: "authoring",
      capability: () => ({
        ...testLayoutCapability("mismatched-authoring"),
        authoringView: {
          id: "different-authoring-id",
          layout: TestLayoutAuthoringView,
        },
      }),
      message:
        'Layout capability "mismatched-authoring" authoring view ID "different-authoring-id" must match its definition ID.',
    },
    {
      label: "runtime",
      capability: () => ({
        ...testLayoutCapability("mismatched-runtime"),
        runtimeView: {
          id: "different-runtime-id",
          component: TestLayoutRuntimeView,
        },
      }),
      message:
        'Layout capability "mismatched-runtime" runtime view ID "different-runtime-id" must match its definition ID.',
    },
  ])(
    "rejects a Layout capability with a mismatched $label binding",
    ({ capability, label, message }) => {
      const pack = defineScaffoldExtensionPack({
        id: `mismatched-${label}`,
        layouts: [capability()],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(message);
    },
  );

  it.each([
    {
      id: "malformed-create-content",
      path: "definition.createContent",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-create-content", {
          definition: { createContent: "not callable" },
        }),
    },
    {
      id: "malformed-authoring-layout",
      path: "authoringView.layout",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-authoring-layout", {
          authoringView: { layout: "not callable" },
        }),
    },
    {
      id: "malformed-section-create",
      path: "definition.section.create",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-section-create", {
          definition: {
            section: {
              label: "Section",
              addLabel: "Add section",
              create: "not callable",
            },
          },
        }),
    },
    {
      id: "malformed-authoring-section",
      path: "authoringView.section",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-authoring-section", {
          authoringView: { section: "not callable" },
        }),
    },
    {
      id: "malformed-authoring-section-frame",
      path: "authoringView.sectionFrame",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-authoring-section-frame", {
          authoringView: { sectionFrame: "not callable" },
        }),
    },
    {
      id: "malformed-runtime-component",
      path: "runtimeView.component",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-runtime-component", {
          runtimeView: { component: "not callable" },
        }),
    },
    {
      id: "malformed-runtime-section-component",
      path: "runtimeView.sectionComponent",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-runtime-section-component", {
          runtimeView: { sectionComponent: "not callable" },
        }),
    },
    {
      id: "malformed-runtime-section-frame",
      path: "runtimeView.sectionFrame",
      capability: () =>
        testLayoutCapabilityWithOverrides("malformed-runtime-section-frame", {
          runtimeView: { sectionFrame: "not callable" },
        }),
    },
  ])("rejects a Layout capability whose $path is not callable", ({ capability, id, path }) => {
    const pack = defineScaffoldExtensionPack({
      id: `malformed-host-${id}`,
      layouts: [capability()],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Layout capability "${id}" ${path} must be callable.`,
    );
  });

  it.each(["authoring", "runtime"] as const)(
    "rejects a Surface capability missing its %s view binding",
    (lane) => {
      const id = `missing-${lane}-surface`;
      const capability = testSurfaceCapability(id);
      const incomplete = {
        ...capability,
        ...(lane === "authoring" ? { authoringView: undefined } : { runtimeView: undefined }),
      } as unknown as SurfaceCapability;
      const pack = defineScaffoldExtensionPack({
        id: `missing-${lane}-surface-host`,
        surfaces: [incomplete],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
        `Surface capability "${id}" is missing its ${lane} view binding.`,
      );
    },
  );

  it.each(["authoring", "runtime"] as const)(
    "rejects a Surface capability whose %s binding has a mismatched persisted variant ID",
    (lane) => {
      const id = `mismatched-${lane}-surface`;
      const capability = testSurfaceCapability(id);
      const mismatched = {
        ...capability,
        ...(lane === "authoring"
          ? { authoringView: { ...capability.authoringView, variantId: "different-authoring-id" } }
          : { runtimeView: { ...capability.runtimeView, variantId: "different-runtime-id" } }),
      } satisfies SurfaceCapability;
      const pack = defineScaffoldExtensionPack({
        id: `mismatched-${lane}-surface-host`,
        surfaces: [mismatched],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
        `Surface capability "${id}" ${lane} view variant ID "different-${lane}-id" must match its definition ID.`,
      );
    },
  );

  it.each(["authoring", "runtime"] as const)(
    "rejects a Surface capability whose %s view component is not callable",
    (lane) => {
      const id = `malformed-${lane}-surface-component`;
      const capability = testSurfaceCapability(id);
      const malformed = {
        ...capability,
        ...(lane === "authoring"
          ? { authoringView: { ...capability.authoringView, component: "not callable" } }
          : { runtimeView: { ...capability.runtimeView, component: "not callable" } }),
      } as unknown as SurfaceCapability;
      const pack = defineScaffoldExtensionPack({
        id: `malformed-${lane}-surface-component-host`,
        surfaces: [malformed],
      });

      expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
        `Surface capability "${id}" ${lane}View.component must be callable.`,
      );
    },
  );

  it("rejects a host Surface that attempts to override a Core built-in", () => {
    const builtInId = builtInSurfaceVariantDefinitions[0]!.id;
    const pack = defineScaffoldExtensionPack({
      id: "core-surface-override-host",
      surfaces: [testSurfaceCapability(builtInId)],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Surface definition "${builtInId}" is already registered.`,
    );
  });

  it("rejects the same Surface ID contributed by two host packs", () => {
    const id = "duplicate-host-surface";
    const first = defineScaffoldExtensionPack({
      id: "first-surface-host",
      surfaces: [testSurfaceCapability(id)],
    });
    const second = defineScaffoldExtensionPack({
      id: "second-surface-host",
      surfaces: [testSurfaceCapability(id)],
    });

    expect(() => createScaffoldApplication({ packs: [first, second] })).toThrow(
      `Surface definition "${id}" is already registered.`,
    );
  });

  it("lets the Surface registry reject a duplicate catalogue position", () => {
    const existing = builtInSurfaceVariantDefinitions.find(
      (definition) => definition.catalogue !== undefined,
    );
    if (!existing?.catalogue) throw new Error("Expected a catalogued Core Surface definition.");
    const capability = testSurfaceCapability("duplicate-catalogue-surface", {
      catalogue: existing.catalogue,
    });
    const pack = defineScaffoldExtensionPack({
      id: "duplicate-catalogue-surface-host",
      surfaces: [capability],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Surface catalogue position "${existing.catalogue.section}:${existing.catalogue.order}" is already registered by "${existing.id}".`,
    );
  });

  it("lets the Surface registry reject a conflicting default mode", () => {
    const mode = "slideshow";
    const existingDefault = builtInSurfaceVariantDefinitions.find((definition) =>
      definition.defaultForModes?.includes(mode),
    );
    if (!existingDefault) throw new Error(`Expected a Core default Surface for "${mode}".`);
    const capability = testSurfaceCapability("conflicting-default-surface", {
      defaultForModes: [mode],
    });
    const pack = defineScaffoldExtensionPack({
      id: "conflicting-default-surface-host",
      surfaces: [capability],
    });

    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Course mode "${mode}" already has default surface "${existingDefault.id}".`,
    );
  });

  it("rejects invalid host Surface factory output during explicit application validation", () => {
    const id = "invalid-factory-surface";
    const createSurface = vi.fn(({ surfaceId }: { surfaceId: string }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "wrong-persisted-variant", settings: {} },
    }));
    const capability = testSurfaceCapability(id, { createSurface });
    const pack = defineScaffoldExtensionPack({
      id: "invalid-factory-surface-host",
      surfaces: [capability],
    });

    expect(createSurface).not.toHaveBeenCalled();
    expect(() => createScaffoldApplication({ packs: [pack] })).toThrow(
      `Surface definition "${id}" must create its own persisted surface variant.`,
    );
    expect(createSurface).toHaveBeenCalledOnce();
  });
});

function testLayoutCapabilityWithOverrides(
  id: string,
  overrides: {
    definition?: Record<string, unknown>;
    authoringView?: Record<string, unknown>;
    runtimeView?: Record<string, unknown>;
  },
): LayoutCapability {
  const capability = testLayoutCapability(id);

  return {
    definition: { ...capability.definition, ...overrides.definition },
    authoringView: { ...capability.authoringView, ...overrides.authoringView },
    runtimeView: { ...capability.runtimeView, ...overrides.runtimeView },
  } as unknown as LayoutCapability;
}

function testBlockCapability(
  nodeType: string,
  overrides: Partial<BlockCapability> = {},
): BlockCapability {
  return {
    definition: { nodeType, title: `Block ${nodeType}` },
    authoringExtension: Node.create({ name: nodeType }),
    runtimeExtension: Node.create({ name: nodeType }),
    ...overrides,
  };
}

function testBlockBundle(
  name: string,
  rootNodeType: string,
  privateNodeType: string,
): AnyExtension {
  return Extension.create({
    name,
    addExtensions: () => [
      Node.create({ name: rootNodeType }),
      Node.create({ name: privateNodeType }),
    ],
  });
}

function testLayoutCapability(
  id: string,
  createContent: LayoutDefinition["createContent"] = () => ({
    type: "layout",
    attrs: { id: `${id}-instance`, variant: id },
    content: [{ type: "section", attrs: { id: `${id}-section` } }],
  }),
): LayoutCapability {
  return {
    definition: {
      id,
      title: "Host layout",
      description: "Host-contributed layout",
      icon: CircleIcon,
      createContent,
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
  overrides: Partial<SurfaceVariantDefinition> = {},
): SurfaceCapability {
  const settingsSchema = z.object({}).strict();

  return {
    definition: {
      id,
      modes: ["slideshow"],
      title: "Host Surface",
      description: "A host-contributed Surface fixture.",
      settingsSchema,
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [{ type: "paragraph" }],
      }),
      ...overrides,
    },
    authoringView: {
      variantId: id,
      component: TestSurfaceAuthoringView,
      configuration: {
        attr: "settings",
        schema: settingsSchema,
        controls: [],
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
