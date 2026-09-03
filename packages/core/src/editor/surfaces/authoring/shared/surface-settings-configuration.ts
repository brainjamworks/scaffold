import {
  SortAscendingIcon as SortAscending,
  SortDescendingIcon as SortDescending,
} from "@phosphor-icons/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import {
  defineConfiguration,
  type ConfigurationControlDescriptor,
  type ConfigurationDefinition,
  type ConfigurationSheetSection,
} from "@/editor/configuration/definition";
import { SurfaceSettingsSchema } from "@/schemas/course-document";

import type { RegisteredSlideCompositionSurfaceDefinition } from "../../model/slide-composition-definition";
import type {
  SlideCompositionOrientation,
  SlideCompositionProportion,
  SurfaceImageSlotRole,
} from "../../model/slide-composition-schema";
import { DEFAULT_SURFACE_SETTINGS } from "../../model/surface-settings";
import { applySurfaceSettings } from "../commands/surface-settings-command";

const SURFACE_SETTINGS_DRAFT_ID = EmbeddedNodeIdSchema.parse("settings0001");

const COMMON_SURFACE_CONTROLS = [
  {
    kind: "color",
    name: "background.color",
    label: "Background colour",
    pickerLabel: "Background",
    labelSuffix: "background",
    resetLabel: "Reset to default",
    resetAriaLabel: "Use default background colour",
    customHint: "Enter a background hex colour, for example #ffffff.",
    placement: {
      quickMenu: { order: 10 },
    },
  },
  {
    kind: "image",
    mediaStorage: "url",
    positioning: "crop",
    name: "background",
    label: "Background image",
    description: "Choose an image to fill the surface background.",
    chooseLabel: "Choose background image",
    changeLabel: "Replace image",
    removeLabel: "Remove image",
    emptyLabel: "Choose background image",
    previewLabel: "Current image",
    pickerTitle: "Choose background image",
    altLabel: "Image description",
    altPlaceholder: "Optional image description",
    placement: {
      sheet: { section: "background", order: 10 },
    },
  },
  {
    kind: "boolean",
    name: "header.enabled",
    label: "Show header",
    description: "Adds a small editable region at the top of the surface.",
    presentation: "switch",
    placement: {
      sheet: { section: "regions", order: 10 },
    },
  },
  {
    kind: "boolean",
    name: "footer.enabled",
    label: "Show footer",
    description: "Adds a small editable region at the bottom of the surface.",
    presentation: "switch",
    placement: {
      sheet: { section: "regions", order: 20 },
    },
  },
] as const satisfies readonly ConfigurationControlDescriptor[];

const COMMON_SURFACE_SHEET_SECTIONS = [
  {
    id: "background",
    title: "Background",
  },
  {
    id: "regions",
    title: "Header and footer",
  },
] as const satisfies readonly ConfigurationSheetSection[];

const SLIDE_COMPOSITION_ORIENTATION_LABELS = {
  default: "Default",
  reversed: "Reversed",
} as const satisfies Record<SlideCompositionOrientation, string>;

const SLIDE_COMPOSITION_PROPORTION_LABELS = {
  equal: "1:1",
  "one-third-two-thirds": "1:2",
  "two-thirds-one-third": "2:1",
} as const satisfies Record<SlideCompositionProportion, string>;

const SURFACE_IMAGE_ROLE_LABELS = {
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
} as const satisfies Record<SurfaceImageSlotRole, string>;

interface SurfaceSettingsConfigurationInput {
  controls?: readonly ConfigurationControlDescriptor[];
  createInitialDraft?: () => unknown;
  defaultOpenSections?: readonly string[];
  description?: string;
  schema?: ConfigurationDefinition["schema"];
  sections?: readonly ConfigurationSheetSection[];
  title?: string;
}

export function defineSurfaceSettingsConfiguration({
  controls = [],
  createInitialDraft = () => DEFAULT_SURFACE_SETTINGS,
  defaultOpenSections = [],
  description = "Configure presentation settings for this surface.",
  schema = SurfaceSettingsSchema,
  sections = [],
  title = "Surface settings",
}: SurfaceSettingsConfigurationInput = {}): ConfigurationDefinition {
  return defineConfiguration({
    attr: "settings",
    schema,
    createInitialDraft,
    apply: applySurfaceSettings,
    controls: [...COMMON_SURFACE_CONTROLS, ...controls],
    sheet: {
      title,
      description,
      defaultOpenSections: ["background", "regions", ...defaultOpenSections],
      sections: [...COMMON_SURFACE_SHEET_SECTIONS, ...sections],
    },
  });
}

export function defineSlideCompositionSettingsConfiguration(
  definition: RegisteredSlideCompositionSurfaceDefinition,
): ConfigurationDefinition {
  const controls: ConfigurationControlDescriptor[] = [];
  if (definition.slideComposition.title !== "required") {
    controls.push({
      kind: "boolean",
      name: "slideTitle.enabled",
      label: "Show slide title",
      description: "Show or hide the authored slide title without removing it.",
      presentation: "switch",
      placement: { sheet: { section: "composition", order: 10 } },
    });
  }
  if (definition.slideComposition.orientation) {
    controls.push({
      kind: "select",
      name: "orientation",
      label: "Orientation",
      options: definition.slideComposition.orientation.options.map((value) => ({
        value,
        label: SLIDE_COMPOSITION_ORIENTATION_LABELS[value],
        icon: value === "default" ? SortAscending : SortDescending,
      })),
      placement: { quickMenu: { presentation: "segmented", order: 40 } },
    });
  }
  if (definition.slideComposition.proportion) {
    controls.push({
      kind: "select",
      name: "proportion",
      label: "Proportion",
      options: definition.slideComposition.proportion.options.map((value) => ({
        value,
        label: SLIDE_COMPOSITION_PROPORTION_LABELS[value],
      })),
      placement: { quickMenu: { presentation: "segmented", order: 50 } },
    });
  }
  const imageControls = deriveSurfaceImageControls(definition);
  controls.push(...imageControls);

  const sections: ConfigurationSheetSection[] = [];
  const defaultOpenSections: string[] = [];
  if (definition.slideComposition.title !== "required") {
    sections.push({ id: "composition", title: "Composition" });
    defaultOpenSections.push("composition");
  }
  if (imageControls.length > 0) {
    sections.push({ id: "images", title: "Images" });
    defaultOpenSections.push("images");
  }

  return defineSurfaceSettingsConfiguration({
    schema: definition.settingsSchema,
    createInitialDraft: () =>
      definition.createSurface({ surfaceId: SURFACE_SETTINGS_DRAFT_ID }).attrs?.["settings"],
    controls,
    sections,
    defaultOpenSections,
    title: "Slide settings",
    description: "Configure presentation settings for this slide.",
  });
}

export function deriveSurfaceImageControls(definition: {
  readonly slideComposition: { readonly imageSlots: readonly SurfaceImageSlotRole[] };
}): ConfigurationControlDescriptor[] {
  return definition.slideComposition.imageSlots.map((role, index) => {
    const roleLabel = SURFACE_IMAGE_ROLE_LABELS[role];
    return {
      kind: "image",
      mediaStorage: "url",
      positioning: "crop",
      name: `images.${role}`,
      label: `${roleLabel} image`,
      description: `Choose and describe the ${role} image for this slide.`,
      chooseLabel: `Choose ${role} image`,
      changeLabel: "Replace image",
      removeLabel: "Remove image",
      emptyLabel: `Choose ${role} image`,
      previewLabel: `Current ${role} image`,
      pickerTitle: `Choose ${role} image`,
      altLabel: "Image description",
      altPlaceholder: "Optional image description",
      placement: { sheet: { section: "images", order: (index + 1) * 10 } },
    };
  });
}
