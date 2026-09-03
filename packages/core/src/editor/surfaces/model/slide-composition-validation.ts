import type { ZodTypeAny } from "zod";
import { z } from "zod";

import type { FixedSurfaceChild, SurfaceVariantDefinition } from "./surface-variant-definition";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
} from "./policies/surface-fixed-structure";
import {
  SlideTitleVisibilitySchema,
  type SlideCompositionKind,
  type SlideCompositionMetadata,
  type SlideCompositionProportion,
  type SlideRegionRole,
  type SlideTitleMode,
  type SurfaceImageSlotRole,
} from "./slide-composition-schema";

type CanonicalCompositionPolicy = {
  readonly catalogueSection: "content" | "image";
  readonly title: SlideTitleMode;
  readonly regions: readonly SlideRegionRole[];
  readonly imageSlots: readonly SurfaceImageSlotRole[];
  readonly orientation: boolean;
  readonly proportionDefault?: SlideCompositionProportion;
};

function compositionPolicy(
  catalogueSection: CanonicalCompositionPolicy["catalogueSection"],
  title: SlideTitleMode,
  regions: readonly SlideRegionRole[],
  imageSlots: readonly SurfaceImageSlotRole[],
  orientation = false,
  proportionDefault?: SlideCompositionProportion,
): CanonicalCompositionPolicy {
  return {
    catalogueSection,
    title,
    regions,
    imageSlots,
    orientation,
    ...(proportionDefault ? { proportionDefault } : {}),
  };
}

export const CANONICAL_COMPOSITION_POLICIES: Readonly<
  Record<SlideCompositionKind, CanonicalCompositionPolicy>
> = {
  content: compositionPolicy("content", "optional-default-on", ["main"], []),
  "two-columns": compositionPolicy(
    "content",
    "optional-default-on",
    ["primary", "secondary"],
    [],
    true,
    "equal",
  ),
  "three-columns": compositionPolicy(
    "content",
    "optional-default-on",
    ["primary", "secondary", "tertiary"],
    [],
  ),
  "two-stacked": compositionPolicy(
    "content",
    "optional-default-on",
    ["primary", "secondary"],
    [],
    true,
    "equal",
  ),
  "side-title": compositionPolicy("content", "required", ["main"], [], true),
  "centred-stage": compositionPolicy("content", "optional-default-on", ["main"], []),
  editorial: compositionPolicy(
    "content",
    "optional-default-on",
    ["primary", "secondary", "tertiary"],
    [],
    true,
  ),
  "image-content-split": compositionPolicy(
    "image",
    "optional-default-on",
    ["main"],
    ["primary"],
    true,
    "equal",
  ),
  "image-content-stacked": compositionPolicy(
    "image",
    "optional-default-on",
    ["main"],
    ["primary"],
    true,
    "equal",
  ),
  "full-bleed-image": compositionPolicy("image", "optional-default-off", [], []),
  "image-backdrop-panel": compositionPolicy(
    "image",
    "optional-default-on",
    ["main"],
    [],
    true,
    "one-third-two-thirds",
  ),
  diptych: compositionPolicy("image", "optional-default-on", [], ["primary", "secondary"]),
  triptych: compositionPolicy(
    "image",
    "optional-default-on",
    [],
    ["primary", "secondary", "tertiary"],
  ),
};

export function validateCanonicalComposition(slideComposition: SlideCompositionMetadata): void {
  const compositionPolicy = CANONICAL_COMPOSITION_POLICIES[slideComposition.id];
  const expectedTitleMode = compositionPolicy.title;
  if (slideComposition.title !== expectedTitleMode) {
    throw new Error(
      `Slide composition "${slideComposition.id}" requires title mode "${expectedTitleMode}".`,
    );
  }

  const expectedRegionRoles = compositionPolicy.regions;
  if (!orderedValuesEqual(slideComposition.regions, expectedRegionRoles)) {
    throw new Error(
      `Slide composition "${slideComposition.id}" requires region roles [${expectedRegionRoles.join(
        ", ",
      )}].`,
    );
  }

  const expectedImageSlotRoles = compositionPolicy.imageSlots;
  if (!orderedValuesEqual(slideComposition.imageSlots, expectedImageSlotRoles)) {
    throw new Error(
      `Slide composition "${slideComposition.id}" requires image slot roles [${expectedImageSlotRoles.join(
        ", ",
      )}].`,
    );
  }
}

export function validateCompositionCapabilities(slideComposition: SlideCompositionMetadata): void {
  const compositionPolicy = CANONICAL_COMPOSITION_POLICIES[slideComposition.id];
  const supportsOrientation = compositionPolicy.orientation;
  if (!supportsOrientation && slideComposition.orientation !== undefined) {
    throw new Error(`Slide composition "${slideComposition.id}" does not support orientation.`);
  }
  if (supportsOrientation && slideComposition.orientation === undefined) {
    throw new Error(`Slide composition "${slideComposition.id}" requires orientation metadata.`);
  }

  const expectedProportionDefault = compositionPolicy.proportionDefault;
  if (expectedProportionDefault === undefined && slideComposition.proportion !== undefined) {
    throw new Error(`Slide composition "${slideComposition.id}" does not support proportion.`);
  }
  if (expectedProportionDefault !== undefined && slideComposition.proportion === undefined) {
    throw new Error(`Slide composition "${slideComposition.id}" requires proportion metadata.`);
  }
  if (
    expectedProportionDefault !== undefined &&
    slideComposition.proportion?.default !== expectedProportionDefault
  ) {
    throw new Error(
      `Slide composition "${slideComposition.id}" must default proportion to "${expectedProportionDefault}".`,
    );
  }
}

export function createCompositionSettingsProbe(
  slideComposition: SlideCompositionMetadata,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  if (slideComposition.title !== "required") {
    settings["slideTitle"] = {
      enabled: slideComposition.title === "optional-default-on",
    };
  }
  if (slideComposition.orientation !== undefined) {
    settings["orientation"] = slideComposition.orientation.default;
  }
  if (slideComposition.proportion !== undefined) {
    settings["proportion"] = slideComposition.proportion.default;
  }
  if (slideComposition.imageSlots.length > 0) {
    settings["images"] = Object.fromEntries(slideComposition.imageSlots.map((role) => [role, {}]));
  }

  return settings;
}

export function validateCompositionDefaults(
  definitionId: string,
  slideComposition: SlideCompositionMetadata,
  settings: unknown,
): asserts settings is Record<string, unknown> {
  if (!isRecord(settings)) {
    throw new Error(
      `Slide composition definition "${definitionId}" settings must parse to an object.`,
    );
  }

  if (slideComposition.title === "required") {
    if (Object.hasOwn(settings, "slideTitle")) {
      throw new Error(
        `Slide composition definition "${definitionId}" with a required title cannot expose slideTitle settings.`,
      );
    }
  } else {
    const expectedEnabled = slideComposition.title === "optional-default-on";
    const titleSettings = SlideTitleVisibilitySchema.safeParse(settings["slideTitle"]);
    if (!titleSettings.success || titleSettings.data.enabled !== expectedEnabled) {
      throw new Error(
        `Slide composition definition "${definitionId}" must default slideTitle.enabled to ${expectedEnabled}.`,
      );
    }
  }

  if (
    slideComposition.orientation !== undefined &&
    settings["orientation"] !== slideComposition.orientation.default
  ) {
    throw new Error(
      `Slide composition definition "${definitionId}" orientation default does not match its parsed settings.`,
    );
  }
  if (slideComposition.orientation === undefined && Object.hasOwn(settings, "orientation")) {
    throw new Error(
      `Slide composition definition "${definitionId}" cannot persist orientation without declaring the capability.`,
    );
  }

  if (
    slideComposition.proportion !== undefined &&
    settings["proportion"] !== slideComposition.proportion.default
  ) {
    throw new Error(
      `Slide composition definition "${definitionId}" proportion default does not match its parsed settings.`,
    );
  }
  if (slideComposition.proportion === undefined && Object.hasOwn(settings, "proportion")) {
    throw new Error(
      `Slide composition definition "${definitionId}" cannot persist proportion without declaring the capability.`,
    );
  }

  if (slideComposition.imageSlots.length === 0) {
    if (Object.hasOwn(settings, "images")) {
      throw new Error(
        `Slide composition definition "${definitionId}" cannot persist images without declaring image slots.`,
      );
    }
    return;
  }

  const images = settings["images"];
  const imageKeys = isRecord(images) ? Object.keys(images).sort() : [];
  const expectedImageKeys = [...slideComposition.imageSlots].sort();
  if (
    imageKeys.length !== expectedImageKeys.length ||
    imageKeys.some((key, index) => key !== expectedImageKeys[index])
  ) {
    throw new Error(
      `Slide composition definition "${definitionId}" image defaults do not match its declared image slots.`,
    );
  }
}

export function validateSettingsSchemaCapabilities(
  definitionId: string,
  slideComposition: SlideCompositionMetadata,
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
): void {
  if (slideComposition.title === "required") {
    assertSchemaOmitsSetting(definitionId, settingsSchema, settings, "slideTitle", {
      enabled: true,
    });
  } else {
    for (const enabled of [true, false]) {
      const parsed = parseSettingsProbe(settingsSchema, settings, "slideTitle", { enabled });
      const titleSettings = parsed
        ? SlideTitleVisibilitySchema.safeParse(parsed["slideTitle"])
        : null;
      if (!titleSettings?.success || titleSettings.data.enabled !== enabled) {
        throw new Error(
          `Slide composition definition "${definitionId}" settings schema must accept slideTitle.enabled=${enabled}.`,
        );
      }
    }
    assertSchemaRejectsSetting(definitionId, settingsSchema, settings, "slideTitle", {
      enabled: "invalid",
    });
  }

  validateScalarCapabilitySchema(
    definitionId,
    settingsSchema,
    settings,
    "orientation",
    slideComposition.orientation?.options,
    "reversed",
  );
  validateScalarCapabilitySchema(
    definitionId,
    settingsSchema,
    settings,
    "proportion",
    slideComposition.proportion?.options,
    "equal",
  );

  if (slideComposition.imageSlots.length === 0) {
    assertSchemaOmitsSetting(definitionId, settingsSchema, settings, "images", { primary: {} });
  } else {
    validateImageRoleSchema(definitionId, slideComposition.imageSlots, settingsSchema, settings);
  }

  assertSchemaOmitsSetting(
    definitionId,
    settingsSchema,
    settings,
    "compositionId",
    "duplicate-structural-identity",
    "forbidden",
  );
}

export function createClosedSlideCompositionSettingsSchema(
  definitionId: string,
  slideComposition: SlideCompositionMetadata,
  settingsSchema: ZodTypeAny,
): ZodTypeAny {
  return settingsSchema.superRefine((settings, context) => {
    if (!isRecord(settings)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Slide composition definition "${definitionId}" settings must parse to an object.`,
      });
      return;
    }

    const addCapabilityIssue = (key: string, message: string): void => {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: [key],
      });
    };

    if (slideComposition.title === "required") {
      if (Object.hasOwn(settings, "slideTitle")) {
        addCapabilityIssue(
          "slideTitle",
          `Slide composition definition "${definitionId}" cannot persist slideTitle for a required title.`,
        );
      }
    } else if (!SlideTitleVisibilitySchema.safeParse(settings["slideTitle"]).success) {
      addCapabilityIssue(
        "slideTitle",
        `Slide composition definition "${definitionId}" must persist valid slideTitle settings.`,
      );
    }

    if (slideComposition.orientation) {
      const orientation = settings["orientation"];
      if (!slideComposition.orientation.options.some((option) => option === orientation)) {
        addCapabilityIssue(
          "orientation",
          `Slide composition definition "${definitionId}" must persist a declared orientation option.`,
        );
      }
    } else if (Object.hasOwn(settings, "orientation")) {
      addCapabilityIssue(
        "orientation",
        `Slide composition definition "${definitionId}" cannot persist undeclared orientation.`,
      );
    }

    if (slideComposition.proportion) {
      const proportion = settings["proportion"];
      if (!slideComposition.proportion.options.some((option) => option === proportion)) {
        addCapabilityIssue(
          "proportion",
          `Slide composition definition "${definitionId}" must persist a declared proportion option.`,
        );
      }
    } else if (Object.hasOwn(settings, "proportion")) {
      addCapabilityIssue(
        "proportion",
        `Slide composition definition "${definitionId}" cannot persist undeclared proportion.`,
      );
    }

    if (slideComposition.imageSlots.length > 0) {
      if (!hasExactImageRoles(settings["images"], slideComposition.imageSlots)) {
        addCapabilityIssue(
          "images",
          `Slide composition definition "${definitionId}" must persist exactly its declared image roles.`,
        );
      }
    } else if (Object.hasOwn(settings, "images")) {
      addCapabilityIssue(
        "images",
        `Slide composition definition "${definitionId}" cannot persist undeclared images.`,
      );
    }

    if (Object.hasOwn(settings, "compositionId")) {
      addCapabilityIssue(
        "compositionId",
        `Slide composition definition "${definitionId}" cannot persist a settings-level compositionId.`,
      );
    }
  });
}

function assertSchemaAcceptsScalarSetting(
  definitionId: string,
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
  key: "orientation" | "proportion",
  value: string,
): void {
  const parsed = parseSettingsProbe(settingsSchema, settings, key, value);
  if (parsed?.[key] !== value) {
    throw new Error(
      `Slide composition definition "${definitionId}" settings schema must accept ${key}="${value}".`,
    );
  }
}

function validateScalarCapabilitySchema(
  definitionId: string,
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
  key: "orientation" | "proportion",
  options: readonly string[] | undefined,
  undeclaredProbe: string,
): void {
  if (!options) {
    assertSchemaOmitsSetting(definitionId, settingsSchema, settings, key, undeclaredProbe);
    return;
  }

  for (const value of options) {
    assertSchemaAcceptsScalarSetting(definitionId, settingsSchema, settings, key, value);
  }
  assertSchemaRejectsSetting(definitionId, settingsSchema, settings, key, "invalid");
}

function assertSchemaOmitsSetting(
  definitionId: string,
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
  key: "images" | "compositionId" | "orientation" | "proportion" | "slideTitle",
  value: unknown,
  qualifier = "undeclared",
): void {
  const parsed = parseSettingsProbe(settingsSchema, settings, key, value);
  if (parsed && Object.hasOwn(parsed, key)) {
    throw new Error(
      `Slide composition definition "${definitionId}" settings schema preserves ${qualifier} ${key}.`,
    );
  }
}

function assertSchemaRejectsSetting(
  definitionId: string,
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
  key: "orientation" | "proportion" | "slideTitle",
  value: unknown,
): void {
  if (settingsSchema.safeParse({ ...settings, [key]: value }).success) {
    throw new Error(
      `Slide composition definition "${definitionId}" settings schema accepts invalid ${key}.`,
    );
  }
}

function validateImageRoleSchema(
  definitionId: string,
  imageSlots: readonly SurfaceImageSlotRole[],
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
): void {
  const images = settings["images"];
  if (!isRecord(images)) {
    throw new Error(
      `Slide composition definition "${definitionId}" image defaults do not match its declared image slots.`,
    );
  }

  const extraRoleResult = parseSettingsProbe(settingsSchema, settings, "images", {
    ...images,
    __undeclared__: {},
  });
  if (extraRoleResult && !hasExactImageRoles(extraRoleResult["images"], imageSlots)) {
    throw new Error(
      `Slide composition definition "${definitionId}" settings schema preserves undeclared image roles.`,
    );
  }

  for (const role of imageSlots) {
    const missingRoleImages = { ...images };
    delete missingRoleImages[role];
    const missingRoleResult = parseSettingsProbe(
      settingsSchema,
      settings,
      "images",
      missingRoleImages,
    );
    if (missingRoleResult && !hasExactImageRoles(missingRoleResult["images"], imageSlots)) {
      throw new Error(
        `Slide composition definition "${definitionId}" settings schema can omit declared image role "${role}".`,
      );
    }
  }
}

function hasExactImageRoles(
  images: unknown,
  expectedRoles: readonly SurfaceImageSlotRole[],
): boolean {
  if (!isRecord(images)) return false;
  const actualKeys = Object.keys(images).sort();
  const expectedKeys = [...expectedRoles].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function parseSettingsProbe(
  settingsSchema: ZodTypeAny,
  settings: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> | null {
  const result = settingsSchema.safeParse({ ...settings, [key]: value });
  return result.success && isRecord(result.data) ? result.data : null;
}

export function createParsedSlideCompositionSurface(
  definitionId: string,
  createSurface: SurfaceVariantDefinition["createSurface"],
  settingsSchema: ZodTypeAny,
  input: Parameters<SurfaceVariantDefinition["createSurface"]>[0],
) {
  const surface = createSurface(input);
  if (surface.type !== "surface") {
    throw new Error(`Slide composition definition "${definitionId}" must create a surface node.`);
  }
  if (surface.attrs?.["id"] !== input.surfaceId) {
    throw new Error(
      `Slide composition definition "${definitionId}" must create the requested surface instance id.`,
    );
  }
  if (surface.attrs?.["variant"] !== definitionId) {
    throw new Error(
      `Slide composition definition "${definitionId}" must create its own persisted surface variant.`,
    );
  }
  const settingsResult = settingsSchema.safeParse(surface.attrs?.["settings"] ?? {});
  if (!settingsResult.success) {
    throw new Error(
      `Slide composition definition "${definitionId}" createSurface settings do not match its settings schema.`,
    );
  }

  return {
    ...surface,
    attrs: {
      ...surface.attrs,
      settings: settingsResult.data,
    },
  };
}

export function assertCreateSurfaceMatchesFixedChildren(
  definitionId: string,
  surface: ReturnType<SurfaceVariantDefinition["createSurface"]>,
  fixedChildren: readonly FixedSurfaceChild[],
): void {
  const match = matchFixedSurfaceChildren(
    snapshotSurfaceStructureChildrenFromJSON(surface),
    fixedChildren,
  );
  if (!match.exact) {
    throw new Error(
      `Surface definition "${definitionId}" createSurface result does not match its declared fixedChildren signature.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedValuesEqual<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}
