import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { SurfaceSettingsSchema, type CourseMode } from "@/schemas/course-document";

import {
  normalizeSurfaceDefinition,
  type FixedSurfaceChild,
  type SurfaceAlignmentDefinition,
  type SurfaceCatalogueEntry,
  type SurfaceVariantDefinition,
  type SurfaceStructureAttributeValue,
  type SurfaceStructurePolicy,
  type SurfaceTemplatePreviewNode,
} from "./surface-variant-definition";
import { createSurfaceVariantRegistry } from "./surface-variant-registry";

function createSurfaceDefinition(
  id: string,
  overrides: Partial<SurfaceVariantDefinition> = {},
): SurfaceVariantDefinition {
  return {
    modes: ["page"],
    title: "Test surface",
    description: "A local surface definition fixture.",
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: id },
      content: [{ type: "paragraph" }],
    }),
    ...overrides,
    id,
  };
}

describe("surface variant registry foundation", () => {
  it("normalizes a definition as a fresh value", () => {
    const definition = createSurfaceDefinition("isolated-normalization-test");

    const normalized = normalizeSurfaceDefinition(definition);

    expect(normalized).toMatchObject({ ...definition, nodeType: "surface" });
    expect(normalized).not.toBe(definition);
  });

  it("supplies a closed common settings schema when a definition has no narrower schema", () => {
    const normalized = normalizeSurfaceDefinition(
      createSurfaceDefinition("isolated-common-settings-schema-test"),
    );

    expect(
      normalized.settingsSchema.safeParse({
        verticalPosition: "middle",
        background: { color: "#ffffff" },
        header: { enabled: true },
        footer: { enabled: false },
      }).success,
    ).toBe(true);
    expect(
      normalized.settingsSchema.safeParse({
        ...SurfaceSettingsSchema.parse({}),
        variantSpecificSetting: true,
      }).success,
    ).toBe(false);
  });

  it("preserves a narrower variant settings schema as the semantic authority", () => {
    const settingsSchema = SurfaceSettingsSchema.extend({
      variantSpecificSetting: z.boolean(),
    }).strict();

    const normalized = normalizeSurfaceDefinition(
      createSurfaceDefinition("isolated-narrower-settings-schema-test", { settingsSchema }),
    );

    expect(normalized.settingsSchema).toBe(settingsSchema);
    expect(normalized.settingsSchema.safeParse({ variantSpecificSetting: true }).success).toBe(
      true,
    );
  });

  it("constructs an immutable registry in definition order", () => {
    const first = createSurfaceDefinition("isolated-registry-first-test", {
      defaultForModes: ["page"],
    });
    const second = createSurfaceDefinition("isolated-registry-second-test");

    const definitions = [first, second];
    const registry = createSurfaceVariantRegistry(definitions);

    definitions.reverse();
    definitions.push(createSurfaceDefinition("isolated-registry-late-mutation-test"));

    expect(registry.definitions.map((definition) => definition.id)).toEqual([first.id, second.id]);
    expect(registry.get(first.id)).toMatchObject({ id: first.id, nodeType: "surface" });
    expect(registry.get("missing")).toBeUndefined();
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.definitions)).toBe(true);
    expect(Object.isFrozen(registry.get(first.id))).toBe(true);
  });

  it("keeps registries isolated when they contain the same variant id", () => {
    const definitionId = "isolated-cross-registry-test";
    const firstRegistry = createSurfaceVariantRegistry([
      createSurfaceDefinition(definitionId, {
        title: "First registry",
        defaultForModes: ["page"],
      }),
    ]);
    const secondRegistry = createSurfaceVariantRegistry([
      createSurfaceDefinition(definitionId, {
        title: "Second registry",
        defaultForModes: ["page"],
      }),
    ]);

    expect(firstRegistry.get(definitionId)?.title).toBe("First registry");
    expect(secondRegistry.get(definitionId)?.title).toBe("Second registry");
    expect(firstRegistry.get(definitionId)).not.toBe(secondRegistry.get(definitionId));
  });

  it("snapshots and freezes definition-owned mutable data without freezing settings schemas", () => {
    const definitionId = "isolated-nested-definition-test";
    const modes: CourseMode[] = ["page"];
    const defaultForModes: CourseMode[] = ["page"];
    const previewChildren: SurfaceTemplatePreviewNode[] = [{ kind: "slot", role: "title" }];
    const proportions = [1];
    const catalogue: SurfaceCatalogueEntry = {
      section: "title",
      order: 10,
      preview: { kind: "row", children: previewChildren, proportions, gap: "small" },
    };
    const verticalContentPosition: NonNullable<
      SurfaceAlignmentDefinition["verticalContentPosition"]
    > = {
      behavior: "finite-direct-stack",
      default: "middle",
    };
    const alignment: SurfaceAlignmentDefinition = { verticalContentPosition };
    const fixedAttrs: Record<string, SurfaceStructureAttributeValue> = { textAlign: "left" };
    const fixedChildren: FixedSurfaceChild[] = [{ type: "paragraph", attrs: fixedAttrs }];
    const structurePolicy: SurfaceStructurePolicy = {
      fixedChildren,
      allowRootInsertion: false,
    };
    const settingsSchema = z.object({ enabled: z.boolean() });
    const definition = createSurfaceDefinition(definitionId, {
      modes,
      defaultForModes,
      catalogue,
      alignment,
      settingsSchema,
      structurePolicy,
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: definitionId, settings: { enabled: true } },
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      }),
    });

    const registry = createSurfaceVariantRegistry([definition]);
    const registered = registry.get(definitionId);

    modes.push("slideshow");
    defaultForModes[0] = "slideshow";
    catalogue.section = "image";
    catalogue.order = 99;
    previewChildren.push({ kind: "slot", role: "image" });
    proportions[0] = 99;
    verticalContentPosition.default = "bottom";
    fixedAttrs["textAlign"] = "right";
    fixedChildren.push({ type: "heading" });
    structurePolicy.allowRootInsertion = true;

    expect(registered).toMatchObject({
      modes: ["page"],
      defaultForModes: ["page"],
      catalogue: {
        section: "title",
        order: 10,
        preview: {
          kind: "row",
          children: [{ kind: "slot", role: "title" }],
          proportions: [1],
        },
      },
      alignment: { verticalContentPosition: { default: "middle" } },
      structurePolicy: {
        fixedChildren: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        allowRootInsertion: false,
      },
    });
    expect(registry.forMode("page").map(({ id }) => id)).toEqual([definitionId]);
    expect(registry.forMode("slideshow")).toEqual([]);
    expect(registry.defaultForMode("page")?.id).toBe(definitionId);
    expect(registry.defaultForMode("slideshow")).toBeUndefined();

    expect(Object.isFrozen(registered?.modes)).toBe(true);
    expect(Object.isFrozen(registered?.defaultForModes)).toBe(true);
    expect(Object.isFrozen(registered?.catalogue)).toBe(true);
    expect(Object.isFrozen(registered?.catalogue?.preview)).toBe(true);
    expect(
      Object.isFrozen(
        registered?.catalogue?.preview.kind === "row"
          ? registered.catalogue.preview.children
          : undefined,
      ),
    ).toBe(true);
    expect(
      Object.isFrozen(
        registered?.catalogue?.preview.kind === "row"
          ? registered.catalogue.preview.proportions
          : undefined,
      ),
    ).toBe(true);
    expect(Object.isFrozen(registered?.alignment)).toBe(true);
    expect(Object.isFrozen(registered?.alignment?.verticalContentPosition)).toBe(true);
    expect(Object.isFrozen(registered?.structurePolicy)).toBe(true);
    expect(Object.isFrozen(registered?.structurePolicy?.fixedChildren)).toBe(true);
    expect(Object.isFrozen(registered?.structurePolicy?.fixedChildren?.[0])).toBe(true);
    expect(Object.isFrozen(registered?.structurePolicy?.fixedChildren?.[0]?.attrs)).toBe(true);
    expect(registered?.settingsSchema).toBe(settingsSchema);
    expect(Object.isFrozen(settingsSchema)).toBe(false);
  });

  it("preserves mode order and resolves defaults", () => {
    const slideImage = createSurfaceDefinition("isolated-slide-image-test", {
      modes: ["slideshow"],
      catalogue: {
        section: "image",
        order: 20,
        preview: { kind: "slot", role: "image" },
      },
    });
    const pageDefault = createSurfaceDefinition("isolated-page-default-test", {
      defaultForModes: ["page"],
    });
    const slideTitle = createSurfaceDefinition("isolated-slide-title-test", {
      modes: ["slideshow"],
      defaultForModes: ["slideshow"],
      catalogue: {
        section: "title",
        order: 10,
        preview: { kind: "slot", role: "title" },
      },
    });

    const registry = createSurfaceVariantRegistry([slideImage, pageDefault, slideTitle]);

    expect(registry.forMode("slideshow").map(({ id }) => id)).toEqual([
      slideImage.id,
      slideTitle.id,
    ]);
    expect(registry.defaultForMode("page")?.id).toBe(pageDefault.id);
    expect(registry.createDefault({ mode: "page", surfaceId: "surface-1" })).toEqual(
      pageDefault.createSurface({ surfaceId: "surface-1" }),
    );
    expect(Object.isFrozen(registry.forMode("slideshow"))).toBe(true);
  });

  it("rejects a supported mode without a default definition", () => {
    const definition = createSurfaceDefinition("isolated-missing-default-test");

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      'Course mode "page" has no default surface definition.',
    );
  });

  it("rejects an empty definition id", () => {
    const definition = createSurfaceDefinition("", { defaultForModes: ["page"] });

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      'Surface definition ID "" must not be blank.',
    );
  });

  it("rejects a whitespace-only definition id", () => {
    const definition = createSurfaceDefinition("   ", { defaultForModes: ["page"] });

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      'Surface definition ID "   " must not be blank.',
    );
  });

  it("preserves the original value of a nonblank definition id", () => {
    const definition = createSurfaceDefinition("  isolated-preserved-id-test  ", {
      defaultForModes: ["page"],
    });

    const registry = createSurfaceVariantRegistry([definition]);

    expect(registry.definitions[0]?.id).toBe(definition.id);
    expect(registry.get(definition.id)?.id).toBe(definition.id);
  });

  it("rejects a factory that creates a non-surface node", () => {
    const definitionId = "isolated-non-surface-factory-test";
    const definition = createSurfaceDefinition(definitionId, {
      defaultForModes: ["page"],
      createSurface: ({ surfaceId }) => ({
        type: "paragraph",
        attrs: { id: surfaceId, variant: definitionId },
      }),
    });

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      `Surface definition "${definitionId}" must create a surface node.`,
    );
  });

  it("rejects a factory that does not preserve the requested surface instance id", () => {
    const definitionId = "isolated-factory-instance-id-test";
    const definition = createSurfaceDefinition(definitionId, {
      defaultForModes: ["page"],
      createSurface: () => ({
        type: "surface",
        attrs: { id: "wrong-surface-id", variant: definitionId },
        content: [{ type: "paragraph" }],
      }),
    });

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      `Surface definition "${definitionId}" must create the requested surface instance id.`,
    );
  });

  it("rejects a factory that creates a different persisted surface variant", () => {
    const definitionId = "isolated-factory-variant-id-test";
    const definition = createSurfaceDefinition(definitionId, {
      defaultForModes: ["page"],
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: "wrong-variant" },
        content: [{ type: "paragraph" }],
      }),
    });

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      `Surface definition "${definitionId}" must create its own persisted surface variant.`,
    );
  });

  it("rejects factory settings that do not satisfy the registered schema", () => {
    const definitionId = "isolated-invalid-factory-settings-test";
    const definition = createSurfaceDefinition(definitionId, {
      defaultForModes: ["page"],
      settingsSchema: z.object({ enabled: z.boolean() }).strict(),
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: definitionId, settings: { enabled: "yes" } },
        content: [{ type: "paragraph" }],
      }),
    });

    expect(() => createSurfaceVariantRegistry([definition])).toThrow(
      `Surface definition "${definitionId}" creates invalid default settings.`,
    );
  });

  it("rejects duplicate definition ids", () => {
    const definition = createSurfaceDefinition("isolated-duplicate-id-test");

    expect(() => createSurfaceVariantRegistry([definition, definition])).toThrow(
      `Surface definition "${definition.id}" is already registered.`,
    );
  });

  it("rejects multiple defaults for one mode", () => {
    const first = createSurfaceDefinition("isolated-default-first-test", {
      defaultForModes: ["page"],
    });
    const second = createSurfaceDefinition("isolated-default-second-test", {
      defaultForModes: ["page"],
    });

    expect(() => createSurfaceVariantRegistry([first, second])).toThrow(
      `Course mode "page" already has default surface "${first.id}".`,
    );
  });

  it("rejects duplicate catalogue positions", () => {
    const catalogue = {
      section: "content" as const,
      order: 10,
      preview: { kind: "slot" as const, role: "content" as const },
    };
    const first = createSurfaceDefinition("isolated-catalogue-first-test", { catalogue });
    const second = createSurfaceDefinition("isolated-catalogue-second-test", { catalogue });

    expect(() => createSurfaceVariantRegistry([first, second])).toThrow(
      `Surface catalogue position "content:10" is already registered by "${first.id}".`,
    );
  });
});
