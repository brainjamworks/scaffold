import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  isRegisteredSlideCompositionSurfaceDefinition,
  SlideCompositionKindSchema,
  SlideCompositionOrientationSchema,
  SlideCompositionMetadataSchema,
  SlideCompositionProportionSchema,
  SlideRegionRoleSchema,
  SlideTitleModeSchema,
  SlideTitleVisibilitySchema,
  SurfaceImageSlotRoleSchema,
  type DefineSlideCompositionSurfaceInput,
  type SlideCompositionKind,
  type SlideCompositionProportion,
  type SlideRegionRole,
  type SlideTitleMode,
  type SurfaceImageSlotRole,
} from "./slide-composition-definition";
import { slideContentSurfaceDefinition } from "./templates/slide-content";

const ContentCompositionSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
}).strict();

let nextFixtureCatalogueOrder = 10_000;

function createContentCompositionDefinition(
  definitionId: string,
  catalogueOrder = nextFixtureCatalogueOrder++,
): DefineSlideCompositionSurfaceInput {
  return {
    id: definitionId,
    title: "Test content slideComposition",
    description: "A local definition used to prove the closed slide composition seam.",
    catalogue: {
      section: "content",
      order: catalogueOrder,
      preview: { kind: "slot", role: "content" },
    },
    slideComposition: {
      id: "content",
      title: "optional-default-on",
      regions: ["main"],
      imageSlots: [],
    },
    settingsSchema: ContentCompositionSettingsSchema,
    structurePolicy: {
      fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
      allowRootInsertion: false,
    },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: definitionId,
        settings: { slideTitle: { enabled: true } },
      },
      content: [
        { type: "slide_title" },
        {
          type: "region",
          attrs: { role: "main" },
          content: [{ type: "paragraph" }],
        },
      ],
    }),
  };
}

function createTwoColumnsCompositionDefinition(
  definitionId: string,
  orientationSchema: z.ZodTypeAny = SlideCompositionOrientationSchema,
  proportionSchema: z.ZodTypeAny = SlideCompositionProportionSchema,
): DefineSlideCompositionSurfaceInput {
  const settingsSchema = SurfaceSettingsSchema.extend({
    slideTitle: SlideTitleVisibilitySchema,
    orientation: orientationSchema,
    proportion: proportionSchema,
  }).strict();

  return {
    id: definitionId,
    title: "Test two columns slideComposition",
    description: "A local reversible slide composition definition.",
    catalogue: {
      section: "content",
      order: nextFixtureCatalogueOrder++,
      preview: {
        kind: "row",
        children: [
          { kind: "slot", role: "content" },
          { kind: "slot", role: "content" },
        ],
        proportions: [1, 1],
        gap: "medium",
      },
    },
    slideComposition: {
      id: "two-columns",
      title: "optional-default-on",
      regions: ["primary", "secondary"],
      imageSlots: [],
      orientation: { default: "default", options: ["default", "reversed"] },
      proportion: {
        default: "equal",
        options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
      },
    },
    settingsSchema,
    structurePolicy: {
      fixedChildren: [
        { type: "slide_title" },
        { type: "region", attrs: { role: "primary" } },
        { type: "region", attrs: { role: "secondary" } },
      ],
      allowRootInsertion: false,
    },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: definitionId,
        settings: {
          slideTitle: { enabled: true },
          orientation: "default",
          proportion: "equal",
        },
      },
      content: [
        { type: "slide_title" },
        { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
        { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
      ],
    }),
  };
}

type CanonicalCompositionCase = {
  readonly id: SlideCompositionKind;
  readonly section: "content" | "image";
  readonly order: number;
  readonly title: SlideTitleMode;
  readonly regions: readonly SlideRegionRole[];
  readonly imageSlots: readonly SurfaceImageSlotRole[];
  readonly orientation: boolean;
  readonly proportionDefault?: SlideCompositionProportion;
};

function canonicalCase(
  id: SlideCompositionKind,
  section: CanonicalCompositionCase["section"],
  order: number,
  title: SlideTitleMode,
  regions: readonly SlideRegionRole[],
  imageSlots: readonly SurfaceImageSlotRole[],
  orientation = false,
  proportionDefault?: SlideCompositionProportion,
): CanonicalCompositionCase {
  return {
    id,
    section,
    order,
    title,
    regions,
    imageSlots,
    orientation,
    ...(proportionDefault ? { proportionDefault } : {}),
  };
}

const CANONICAL_COMPOSITIONS: readonly CanonicalCompositionCase[] = [
  canonicalCase("content", "content", 2010, "optional-default-on", ["main"], []),
  canonicalCase(
    "two-columns",
    "content",
    2020,
    "optional-default-on",
    ["primary", "secondary"],
    [],
    true,
    "equal",
  ),
  canonicalCase(
    "three-columns",
    "content",
    2030,
    "optional-default-on",
    ["primary", "secondary", "tertiary"],
    [],
  ),
  canonicalCase(
    "two-stacked",
    "content",
    2040,
    "optional-default-on",
    ["primary", "secondary"],
    [],
    true,
    "equal",
  ),
  canonicalCase("side-title", "content", 2050, "required", ["main"], [], true),
  canonicalCase("centred-stage", "content", 2060, "optional-default-on", ["main"], []),
  canonicalCase(
    "editorial",
    "content",
    2070,
    "optional-default-on",
    ["primary", "secondary", "tertiary"],
    [],
    true,
  ),
  canonicalCase(
    "image-content-split",
    "image",
    2110,
    "optional-default-on",
    ["main"],
    ["primary"],
    true,
    "equal",
  ),
  canonicalCase(
    "image-content-stacked",
    "image",
    2120,
    "optional-default-on",
    ["main"],
    ["primary"],
    true,
    "equal",
  ),
  canonicalCase("full-bleed-image", "image", 2130, "optional-default-off", [], []),
  canonicalCase(
    "image-backdrop-panel",
    "image",
    2140,
    "optional-default-on",
    ["main"],
    [],
    true,
    "one-third-two-thirds",
  ),
  canonicalCase("diptych", "image", 2150, "optional-default-on", [], ["primary", "secondary"]),
  canonicalCase(
    "triptych",
    "image",
    2160,
    "optional-default-on",
    [],
    ["primary", "secondary", "tertiary"],
  ),
];

function createCanonicalCompositionDefinition(
  expected: CanonicalCompositionCase,
  definitionId = `slide-composition-definition-canonical-${expected.id}-test`,
): DefineSlideCompositionSurfaceInput {
  const settingsShape: Record<string, z.ZodTypeAny> = {
    ...SurfaceSettingsSchema.shape,
  };
  const settings: Record<string, unknown> = {};

  if (expected.title !== "required") {
    settingsShape["slideTitle"] = SlideTitleVisibilitySchema;
    settings["slideTitle"] = { enabled: expected.title === "optional-default-on" };
  }
  if (expected.orientation) {
    settingsShape["orientation"] = SlideCompositionOrientationSchema;
    settings["orientation"] = "default";
  }
  if (expected.proportionDefault) {
    settingsShape["proportion"] = SlideCompositionProportionSchema;
    settings["proportion"] = expected.proportionDefault;
  }
  if (expected.imageSlots.length > 0) {
    const imageShape: Record<string, z.ZodTypeAny> = {};
    const images: Record<string, unknown> = {};
    for (const role of expected.imageSlots) {
      imageShape[role] = z.object({}).strict();
      images[role] = {};
    }
    settingsShape["images"] = z.object(imageShape).strict();
    settings["images"] = images;
  }

  return {
    id: definitionId,
    title: `Test ${expected.id} slideComposition`,
    description: "A local definition from the accepted composition inventory.",
    catalogue: {
      section: expected.section,
      order: expected.order,
      preview: { kind: "slot", role: expected.section },
    },
    slideComposition: {
      id: expected.id,
      title: expected.title,
      regions: expected.regions,
      imageSlots: expected.imageSlots,
      ...(expected.orientation
        ? { orientation: { default: "default", options: ["default", "reversed"] } }
        : {}),
      ...(expected.proportionDefault
        ? {
            proportion: {
              default: expected.proportionDefault,
              options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
            },
          }
        : {}),
    },
    settingsSchema: z.object(settingsShape).strict(),
    structurePolicy: {
      fixedChildren: [
        { type: "slide_title" },
        ...expected.regions.map((role) => ({ type: "region", attrs: { role } })),
      ],
      allowRootInsertion: false,
    },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: definitionId, settings },
      content: [
        { type: "slide_title" },
        ...expected.regions.map((role) => ({
          type: "region",
          attrs: { role },
          content: [{ type: "paragraph" }],
        })),
      ],
    }),
  };
}

describe("slide composition definitions", () => {
  it("defines Content with parsed optional-title defaults", () => {
    expect(
      slideContentSurfaceDefinition.settingsSchema.parse({
        ...SurfaceSettingsSchema.parse({}),
        slideTitle: { enabled: true },
      }),
    ).toMatchObject({ slideTitle: { enabled: true } });
    expect(
      slideContentSurfaceDefinition.settingsSchema.safeParse({
        ...SurfaceSettingsSchema.parse({}),
        slideTitle: { enabled: "yes" },
      }).success,
    ).toBe(false);
  });

  it("exposes only the closed slide composition vocabulary", () => {
    expect(SlideTitleModeSchema.options).toEqual([
      "required",
      "optional-default-on",
      "optional-default-off",
    ]);
    expect(SlideCompositionOrientationSchema.options).toEqual(["default", "reversed"]);
    expect(SlideCompositionProportionSchema.options).toEqual([
      "equal",
      "one-third-two-thirds",
      "two-thirds-one-third",
    ]);
    expect(SlideCompositionKindSchema.options).toEqual([
      "content",
      "two-columns",
      "three-columns",
      "two-stacked",
      "side-title",
      "centred-stage",
      "editorial",
      "image-content-split",
      "image-content-stacked",
      "full-bleed-image",
      "image-backdrop-panel",
      "diptych",
      "triptych",
    ]);
    expect(SlideRegionRoleSchema.options).toEqual(["main", "primary", "secondary", "tertiary"]);
    expect(SurfaceImageSlotRoleSchema.options).toEqual(["primary", "secondary", "tertiary"]);

    expect(SlideTitleVisibilitySchema.parse({ enabled: true })).toEqual({ enabled: true });
    expect(
      SlideTitleVisibilitySchema.safeParse({ enabled: true, visibility: "duplicated" }).success,
    ).toBe(false);
  });

  it.each(CANONICAL_COMPOSITIONS)("declares the canonical $id composition contract", (expected) => {
    const registered = defineSlideCompositionSurface(
      createCanonicalCompositionDefinition(expected),
    );

    expect(registered.catalogue).toMatchObject({
      section: expected.section,
      order: expected.order,
    });
    expect(registered.slideComposition).toMatchObject({
      id: expected.id,
      title: expected.title,
      regions: expected.regions,
      imageSlots: expected.imageSlots,
    });
    expect(registered.createSurface({ surfaceId: expected.id }).attrs?.["settings"]).toEqual(
      registered.settingsSchema.parse(
        registered.createSurface({ surfaceId: expected.id }).attrs?.["settings"],
      ),
    );
  });

  it("returns one immutable slideshow definition with parsed defaults and a fixed signature", () => {
    const definitionId = "slide-composition-definition-valid-test";
    const definition = defineSlideCompositionSurface(
      createContentCompositionDefinition(definitionId),
    );

    expect(definition.nodeType).toBe("surface");
    expect(definition.modes).toEqual(["slideshow"]);
    expect(definition.slideComposition).toEqual({
      id: "content",
      title: "optional-default-on",
      regions: ["main"],
      imageSlots: [],
    });
    expect(definition.catalogue).toEqual({
      section: "content",
      order: 10_000,
      preview: { kind: "slot", role: "content" },
    });
    expect(definition.structurePolicy).toEqual({
      fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
      allowRootInsertion: false,
    });
    expect(definition.settingsSchema.parse({ slideTitle: { enabled: true } })).toEqual({
      slideTitle: { enabled: true },
    });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.slideComposition)).toBe(true);
    expect(Object.isFrozen(definition.slideComposition.regions)).toBe(true);
    expect(Object.isFrozen(definition.slideComposition.imageSlots)).toBe(true);
    expect(Object.isFrozen(definition.catalogue)).toBe(true);
    expect(Object.isFrozen(definition.structurePolicy)).toBe(true);
    expect(Object.isFrozen(definition.structurePolicy.fixedChildren)).toBe(true);
    expect(Object.isFrozen(definition.structurePolicy.fixedChildren[1]?.attrs)).toBe(true);
  });

  it("returns independent pure definitions for duplicate IDs", () => {
    const definitionId = "slide-composition-definition-duplicate-id-test";
    const first = defineSlideCompositionSurface(
      createContentCompositionDefinition(definitionId, 998),
    );
    const duplicate = createContentCompositionDefinition(definitionId, 997);
    duplicate.catalogue = {
      section: "content",
      order: 997,
      preview: duplicate.catalogue.preview,
    };

    const second = defineSlideCompositionSurface(duplicate);

    expect(second).not.toBe(first);
    expect(first.catalogue).toEqual({
      section: "content",
      order: 998,
      preview: { kind: "slot", role: "content" },
    });
    expect(second.catalogue).toEqual({
      section: "content",
      order: 997,
      preview: { kind: "slot", role: "content" },
    });
  });

  it("keeps the normalized factory isolated from input property reassignment", () => {
    const definitionId = "slide-composition-definition-factory-reassignment-test";
    const definition = createContentCompositionDefinition(definitionId, 993);
    const registered = defineSlideCompositionSurface(definition);
    definition.createSurface = ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: definitionId,
        settings: { slideTitle: { enabled: true } },
      },
      content: [{ type: "slide_title" }],
    });

    expect(
      registered
        .createSurface({ surfaceId: "factory-reassignment" })
        .content?.map(({ type }) => type),
    ).toEqual(["slide_title", "region"]);
  });

  it("rejects fixed-signature drift from a stateful normalized factory", () => {
    const definitionId = "slide-composition-definition-stateful-factory-drift-test";
    const definition = createContentCompositionDefinition(definitionId, 992);
    const createCanonicalSurface = definition.createSurface;
    let omitMainRegion = false;
    definition.createSurface = (input) => {
      const surface = createCanonicalSurface(input);
      return omitMainRegion ? { ...surface, content: [{ type: "slide_title" }] } : surface;
    };
    const registered = defineSlideCompositionSurface(definition);
    omitMainRegion = true;

    expect(() => registered.createSurface({ surfaceId: "stateful-factory-drift" })).toThrow(
      `Surface definition "${definitionId}" createSurface result does not match its declared fixedChildren signature.`,
    );
  });

  it("identifies complete slide composition declarations without registry state", () => {
    const definition = defineSlideCompositionSurface(
      createContentCompositionDefinition("slide-composition-definition-type-guard-test", 997),
    );

    expect(isRegisteredSlideCompositionSurfaceDefinition(definition)).toBe(true);
  });

  it("rejects capabilities and settings defaults that disagree with the composition", () => {
    const capabilityMismatch = createContentCompositionDefinition(
      "slide-composition-definition-capability-mismatch-test",
    );
    capabilityMismatch.slideComposition = {
      ...capabilityMismatch.slideComposition,
      orientation: { default: "default", options: ["default", "reversed"] },
    };

    expect(() => defineSlideCompositionSurface(capabilityMismatch)).toThrow(
      'Slide composition "content" does not support orientation.',
    );

    const proportionMismatch = createContentCompositionDefinition(
      "slide-composition-definition-proportion-mismatch-test",
    );
    proportionMismatch.slideComposition = {
      ...proportionMismatch.slideComposition,
      proportion: {
        default: "equal",
        options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
      },
    };

    expect(() => defineSlideCompositionSurface(proportionMismatch)).toThrow(
      'Slide composition "content" does not support proportion.',
    );

    const defaultMismatch = createContentCompositionDefinition(
      "slide-composition-definition-default-mismatch-test",
    );
    defaultMismatch.createSurface = ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: defaultMismatch.id,
        settings: { slideTitle: { enabled: false } },
      },
      content: [
        { type: "slide_title" },
        {
          type: "region",
          attrs: { role: "main" },
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(() => defineSlideCompositionSurface(defaultMismatch)).toThrow(
      'Slide composition definition "slide-composition-definition-default-mismatch-test" must default slideTitle.enabled to true.',
    );
  });

  it("rejects a passthrough settings schema that preserves undeclared capabilities", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-passthrough-capabilities-test",
    );
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
    }).passthrough();

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-passthrough-capabilities-test" settings schema preserves undeclared orientation.',
    );
  });

  it("rejects a settings schema that can persist a second slide composition identity", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-settings-slideComposition-id-test",
    );
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      compositionId: z.string().optional(),
    }).strict();

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-settings-slideComposition-id-test" settings schema preserves forbidden compositionId.',
    );
  });

  it("rejects an optional-title schema that cannot persist both visibility states", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-title-toggle-schema-test",
    );
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: z.object({ enabled: z.literal(true) }).strict(),
    }).strict();

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-title-toggle-schema-test" settings schema must accept slideTitle.enabled=false.',
    );
  });

  it("rejects an orientation schema that accepts only the default", () => {
    const definition = createTwoColumnsCompositionDefinition(
      "slide-composition-definition-orientation-options-test",
      z.literal("default"),
    );

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-orientation-options-test" settings schema must accept orientation="reversed".',
    );
  });

  it("rejects a definition whose closed schema cannot persist every declared option", () => {
    const definition = createTwoColumnsCompositionDefinition(
      "slide-composition-definition-closed-orientation-options-test",
    );
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      orientation: SlideCompositionOrientationSchema,
      proportion: SlideCompositionProportionSchema,
    })
      .strict()
      .transform((settings) =>
        settings.orientation === "reversed"
          ? { ...settings, compositionId: "transformed-slideComposition-identity" }
          : settings,
      );

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-closed-orientation-options-test" settings schema must accept orientation="reversed".',
    );
  });

  it("rejects a proportion schema that accepts only the default", () => {
    const definition = createTwoColumnsCompositionDefinition(
      "slide-composition-definition-proportion-options-test",
      SlideCompositionOrientationSchema,
      z.literal("equal"),
    );

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-proportion-options-test" settings schema must accept proportion="one-third-two-thirds".',
    );
  });

  it("rejects a schema that preserves an undeclared proportion", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-undeclared-proportion-test",
    );
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      proportion: SlideCompositionProportionSchema.optional(),
    }).strict();

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-undeclared-proportion-test" settings schema preserves undeclared proportion.',
    );
  });

  it("rejects an image schema that preserves undeclared logical roles", () => {
    const definitionId = "slide-composition-definition-image-role-schema-test";
    const settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      images: z.record(z.unknown()),
    }).strict();

    expect(() =>
      defineSlideCompositionSurface({
        id: definitionId,
        title: "Test diptych slideComposition",
        description: "A local definition with a permissive image-role map.",
        catalogue: {
          section: "image",
          order: 997,
          preview: {
            kind: "row",
            children: [
              { kind: "slot", role: "image" },
              { kind: "slot", role: "image" },
            ],
          },
        },
        slideComposition: {
          id: "diptych",
          title: "optional-default-on",
          regions: [],
          imageSlots: ["primary", "secondary"],
        },
        settingsSchema,
        structurePolicy: {
          fixedChildren: [{ type: "slide_title" }],
          allowRootInsertion: false,
        },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: {
            id: surfaceId,
            variant: definitionId,
            settings: {
              slideTitle: { enabled: true },
              images: { primary: {}, secondary: {} },
            },
          },
          content: [{ type: "slide_title" }],
        }),
      }),
    ).toThrow(
      'Slide composition definition "slide-composition-definition-image-role-schema-test" settings schema preserves undeclared image roles.',
    );
  });

  it("closes alternate undeclared slide composition settings on the normalized schema", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-alternate-undeclared-settings-test",
    );
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      orientation: z.literal("default").optional(),
      compositionId: z.literal("other-slideComposition").optional(),
    }).strict();

    const registered = defineSlideCompositionSurface(definition);

    expect(
      registered.settingsSchema.safeParse({
        slideTitle: { enabled: true },
        orientation: "default",
      }).success,
    ).toBe(false);
    expect(
      registered.settingsSchema.safeParse({
        slideTitle: { enabled: true },
        compositionId: "other-slideComposition",
      }).success,
    ).toBe(false);
  });

  it("closes extra declared-capability enum values on the normalized schema", () => {
    const definition = createTwoColumnsCompositionDefinition(
      "slide-composition-definition-extra-orientation-value-test",
      z.enum(["default", "reversed", "sideways"]),
    );

    const registered = defineSlideCompositionSurface(definition);

    expect(
      registered.settingsSchema.safeParse({
        slideTitle: { enabled: true },
        orientation: "sideways",
        proportion: "equal",
      }).success,
    ).toBe(false);
  });

  it("closes title visibility for a required-title composition", () => {
    const sideTitle = CANONICAL_COMPOSITIONS.find(({ id }) => id === "side-title");
    if (!sideTitle) throw new Error("Expected the canonical Side title composition case.");
    const definition = createCanonicalCompositionDefinition(
      sideTitle,
      "slide-composition-definition-required-title-domain-test",
    );
    definition.catalogue = {
      ...definition.catalogue,
      order: nextFixtureCatalogueOrder++,
    };
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: z
        .object({ enabled: z.literal(false) })
        .strict()
        .optional(),
      orientation: SlideCompositionOrientationSchema,
    }).strict();

    const registered = defineSlideCompositionSurface(definition);

    expect(
      registered.settingsSchema.safeParse({
        slideTitle: { enabled: false },
        orientation: "default",
      }).success,
    ).toBe(false);
  });

  it("closes additional known image roles on the normalized schema", () => {
    const diptych = CANONICAL_COMPOSITIONS.find(({ id }) => id === "diptych");
    if (!diptych) throw new Error("Expected the canonical Diptych composition case.");
    const definition = createCanonicalCompositionDefinition(
      diptych,
      "slide-composition-definition-known-extra-image-role-test",
    );
    definition.catalogue = {
      ...definition.catalogue,
      order: nextFixtureCatalogueOrder++,
    };
    const imageValueSchema = z.object({}).strict();
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      images: z
        .object({
          primary: imageValueSchema,
          secondary: imageValueSchema,
          tertiary: imageValueSchema.optional(),
        })
        .strict(),
    }).strict();

    const registered = defineSlideCompositionSurface(definition);

    expect(
      registered.settingsSchema.safeParse({
        slideTitle: { enabled: true },
        images: { primary: {}, secondary: {}, tertiary: {} },
      }).success,
    ).toBe(false);
  });

  it("returns parsed factory settings from the normalized createSurface seam", () => {
    const definitionId = "slide-composition-definition-parsed-factory-settings-test";
    const definition = createContentCompositionDefinition(definitionId, 996);
    definition.settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema.default({ enabled: true }),
    }).strict();
    definition.createSurface = ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: definitionId, settings: {} },
      content: [
        { type: "slide_title" },
        { type: "region", attrs: { role: "main" }, content: [{ type: "paragraph" }] },
      ],
    });

    const registered = defineSlideCompositionSurface(definition);

    expect(registered.createSurface({ surfaceId: "parsed-settings" }).attrs?.["settings"]).toEqual({
      slideTitle: { enabled: true },
    });
  });

  it("rejects region metadata that drifts from the fixed child signature", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-region-signature-mismatch-test",
    );
    definition.slideComposition = {
      ...definition.slideComposition,
      regions: ["secondary"],
    };

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition definition "slide-composition-definition-region-signature-mismatch-test" fixedChildren do not match its declared title and region roles.',
    );
  });

  it("rejects metadata that is not canonical for the selected composition", () => {
    const titleMismatch = createContentCompositionDefinition(
      "slide-composition-definition-title-mode-mismatch-test",
    );
    titleMismatch.slideComposition = {
      ...titleMismatch.slideComposition,
      title: "required",
    };
    titleMismatch.settingsSchema = SurfaceSettingsSchema.strict();
    titleMismatch.createSurface = ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: titleMismatch.id,
        settings: {},
      },
      content: [
        { type: "slide_title" },
        {
          type: "region",
          attrs: { role: "main" },
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(() => defineSlideCompositionSurface(titleMismatch)).toThrow(
      'Slide composition "content" requires title mode "optional-default-on".',
    );

    const roleMismatch = createContentCompositionDefinition(
      "slide-composition-definition-composition-role-mismatch-test",
    );
    roleMismatch.slideComposition = {
      ...roleMismatch.slideComposition,
      regions: ["secondary"],
    };
    roleMismatch.structurePolicy = {
      fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "secondary" } }],
      allowRootInsertion: false,
    };
    roleMismatch.createSurface = ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: roleMismatch.id,
        settings: { slideTitle: { enabled: true } },
      },
      content: [
        { type: "slide_title" },
        {
          type: "region",
          attrs: { role: "secondary" },
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(() => defineSlideCompositionSurface(roleMismatch)).toThrow(
      'Slide composition "content" requires region roles [main].',
    );
  });

  it("rejects duplicate logical region and image roles", () => {
    const duplicateRegions = {
      id: "two-columns",
      title: "optional-default-on",
      regions: ["primary", "primary"],
      imageSlots: [],
      orientation: { default: "default", options: ["default", "reversed"] },
      proportion: {
        default: "equal",
        options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
      },
    };
    const duplicateImages = {
      id: "diptych",
      title: "optional-default-on",
      regions: [],
      imageSlots: ["primary", "primary"],
    };

    expect(SlideCompositionMetadataSchema.safeParse(duplicateRegions).success).toBe(false);
    expect(SlideCompositionMetadataSchema.safeParse(duplicateImages).success).toBe(false);
  });

  it("requires parsed image defaults to contain exactly the declared logical slots", () => {
    const definitionId = "slide-composition-definition-image-default-mismatch-test";
    const settingsSchema = SurfaceSettingsSchema.extend({
      slideTitle: SlideTitleVisibilitySchema,
      images: z.record(z.unknown()),
    }).strict();

    expect(() =>
      defineSlideCompositionSurface({
        id: definitionId,
        title: "Test diptych slideComposition",
        description: "A local definition with incomplete image defaults.",
        catalogue: {
          section: "image",
          order: 999,
          preview: {
            kind: "row",
            children: [
              { kind: "slot", role: "image" },
              { kind: "slot", role: "image" },
            ],
          },
        },
        slideComposition: {
          id: "diptych",
          title: "optional-default-on",
          regions: [],
          imageSlots: ["primary", "secondary"],
        },
        settingsSchema,
        structurePolicy: {
          fixedChildren: [{ type: "slide_title" }],
          allowRootInsertion: false,
        },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: {
            id: surfaceId,
            variant: definitionId,
            settings: {
              slideTitle: { enabled: true },
              images: { primary: {} },
            },
          },
          content: [{ type: "slide_title" }],
        }),
      }),
    ).toThrow(
      'Slide composition definition "slide-composition-definition-image-default-mismatch-test" image defaults do not match its declared image slots.',
    );
  });

  it("rejects catalogue metadata that disagrees with the closed composition", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-catalogue-section-mismatch-test",
    );
    definition.catalogue = {
      section: "image",
      order: 999,
      preview: definition.catalogue.preview,
    };

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      'Slide composition "content" must be catalogued in the "content" section.',
    );
  });

  it("preserves the Phase 2-owned catalogue preview without validating a parallel grammar", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-future-catalogue-preview-test",
      995,
    );
    const preview = { kind: "slot", role: "content" };
    Object.assign(definition.catalogue, { preview });

    const registered = defineSlideCompositionSurface(definition);

    expect(registered.catalogue).toEqual({
      section: "content",
      order: 995,
      preview,
    });
  });

  it("rejects catalogue metadata outside the current and Phase 2-owned fields", () => {
    const definition = createContentCompositionDefinition(
      "slide-composition-definition-extra-catalogue-metadata-test",
    );
    Object.assign(definition.catalogue, { compositionId: "duplicate-structural-identity" });

    expect(() => defineSlideCompositionSurface(definition)).toThrow(/Unrecognized key/);
  });

  it("rejects extra slide composition metadata before returning a declaration", () => {
    const definitionId = "slide-composition-definition-extra-metadata-test";
    const definition = createContentCompositionDefinition(definitionId, 994);
    const slideCompositionWithDuplicateIdentity = {
      ...definition.slideComposition,
      compositionId: "duplicate-structural-identity",
    };
    definition.slideComposition = slideCompositionWithDuplicateIdentity;

    expect(() => defineSlideCompositionSurface(definition)).toThrow(/Unrecognized key/);
  });

  it("rejects a createSurface result that drifts from the fixed signature", () => {
    const definitionId = "slide-composition-definition-factory-mismatch-test";
    const definition = createContentCompositionDefinition(definitionId, 994);
    definition.createSurface = ({ surfaceId }) => ({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: definitionId,
        settings: { slideTitle: { enabled: true } },
      },
      content: [{ type: "slide_title" }],
    });

    expect(() => defineSlideCompositionSurface(definition)).toThrow(
      `Surface definition "${definitionId}" createSurface result does not match its declared fixedChildren signature.`,
    );
  });
});
