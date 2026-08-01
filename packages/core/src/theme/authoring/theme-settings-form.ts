import {
  CourseThemeAuthorPaletteSchema,
  type CourseThemeAuthorPalette,
  type CourseThemePaletteSlot,
} from "@scaffold/contracts";
import { useEffect, useRef, type FocusEventHandler } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";

import type {
  SettingsFormDefinition,
  SettingsSheetColorFieldDescriptor,
  SettingsSheetSelectFieldDescriptor,
} from "@/editor/configuration/settings-sheet";
import {
  COURSE_THEME_NUMERIC_BOUNDS,
  CourseThemeDesignSchema,
  CourseThemeTypographySchema,
  type CourseThemeDesign,
  type CourseThemeTypography,
  type CourseThemeValues,
  type PersistedCourseTheme,
} from "@/schemas/course-document";
import {
  materialiseCoursePalette,
  type CourseThemePresetDefinition,
  type ScaffoldColorMode,
  type ThemeCatalogue,
} from "@/theme/model";
import type { ColorOption } from "@/ui/components/ColorPicker/color-options";

import type { CourseThemePaletteSection } from "./course-theme-commands";

export type CourseThemeActionId =
  | "derive-dark"
  | "reset-creative"
  | "reset-design"
  | "reset-foundation"
  | "reset-links"
  | "reset-theme"
  | "reset-typography";

export type CourseThemeFormValues = CourseThemeAuthorPalette &
  CourseThemeDesign & {
    presetId: string;
    headingFontId: string;
    bodyFontId: string;
    codeFontId: string;
    headingWeight: string;
    bodyWeight: string;
    typeScale: number;
    bodyLineHeight: number;
    headingLineHeight: number;
    headingLetterSpacing: number;
    uppercaseHeadings: boolean;
  };

interface CourseThemeDefinitionInput {
  catalogue: ThemeCatalogue;
  editable: boolean;
  mode: ScaffoldColorMode;
  preset: CourseThemePresetDefinition;
  resetThemeEnabled: boolean;
  values: CourseThemeValues;
}

interface AuthorColourSection {
  id: CourseThemePaletteSection;
  title: string;
  description: string;
  resetActionId: CourseThemeActionId;
  resetAriaLabel: string;
  slots: ReadonlyArray<{ slot: CourseThemePaletteSlot; label: string }>;
}

export const COURSE_THEME_PALETTE_SLOTS = [
  "background",
  "surface",
  "bodyText",
  "headingText",
  "primary",
  "secondary",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "link",
] as const satisfies readonly CourseThemePaletteSlot[];

const AUTHOR_COLOUR_SECTIONS: readonly AuthorColourSection[] = [
  {
    id: "foundation",
    title: "Foundation colours",
    description: "The course canvas and its main reading colours.",
    resetActionId: "reset-foundation",
    resetAriaLabel: "Reset foundation colours",
    slots: [
      { slot: "background", label: "Background" },
      { slot: "surface", label: "Surface" },
      { slot: "bodyText", label: "Body text" },
      { slot: "headingText", label: "Heading text" },
    ],
  },
  {
    id: "creative",
    title: "Creative palette",
    description: "Brand and accent colours used to derive components, states and charts.",
    resetActionId: "reset-creative",
    resetAriaLabel: "Reset creative palette colours",
    slots: [
      { slot: "primary", label: "Primary" },
      { slot: "secondary", label: "Secondary" },
      { slot: "accent1", label: "Accent 1" },
      { slot: "accent2", label: "Accent 2" },
      { slot: "accent3", label: "Accent 3" },
      { slot: "accent4", label: "Accent 4" },
    ],
  },
  {
    id: "link",
    title: "Links",
    description: "The colour used for linked text and interactive references.",
    resetActionId: "reset-links",
    resetAriaLabel: "Reset links colours",
    slots: [{ slot: "link", label: "Link" }],
  },
];

const HEADING_WEIGHTS = [400, 500, 600, 700, 800] as const;
const BODY_WEIGHTS = [400, 500, 600, 700] as const;

export const COURSE_THEME_BLUR_FIELDS: ReadonlyArray<FieldPath<CourseThemeFormValues>> = [
  "typeScale",
  "bodyLineHeight",
  "headingLineHeight",
  "headingLetterSpacing",
  "roundness",
  "stroke",
];

const TYPOGRAPHY_FIELDS = new Set<string>([
  "headingFontId",
  "bodyFontId",
  "codeFontId",
  "headingWeight",
  "bodyWeight",
  "typeScale",
  "bodyLineHeight",
  "headingLineHeight",
  "headingLetterSpacing",
  "uppercaseHeadings",
]);

const DESIGN_FIELDS = new Set<string>(["roundness", "stroke", "shadow", "density"]);

export function courseThemeFormDefinition({
  catalogue,
  editable,
  mode,
  preset,
  resetThemeEnabled,
  values,
}: CourseThemeDefinitionInput): SettingsFormDefinition<CourseThemeActionId> {
  const derivedDark = derivedDarkPalette(values, preset);
  const disabled = editable ? {} : { disabledReason: "Choose an available preset to edit." };
  const palette = presetColourOptions(preset, mode);
  const colourSections = AUTHOR_COLOUR_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    description:
      section.id === "foundation"
        ? `Editing ${mode} colours for the current application mode.`
        : section.description,
    items: section.slots.map(({ slot, label }) =>
      colourFieldDescriptor({
        derivedDark,
        disabled,
        label,
        mode,
        palette,
        preset,
        slot,
        values,
      }),
    ),
    actions: [
      {
        id: section.resetActionId,
        label: `Reset ${section.title.toLowerCase()}`,
        ariaLabel: section.resetAriaLabel,
        disabled: !editable,
      },
    ],
  }));

  return {
    defaultOpenSections: ["presets", "foundation", "creative", "link", "typography", "design"],
    sections: [
      {
        id: "presets",
        title: "Presets",
        description: "Choose a complete starting point for the course presentation.",
        items: [presetFieldDescriptor(catalogue)],
      },
      ...colourSections,
      {
        id: "typography",
        title: "Typography",
        items: typographyFields(catalogue, values.typography, disabled),
        actions: [
          {
            id: "reset-typography",
            label: "Reset typography",
            ariaLabel: "Reset course typography",
            disabled: !editable,
          },
        ],
      },
      {
        id: "design",
        title: "Design",
        items: designFields(disabled),
        actions: [
          {
            id: "reset-design",
            label: "Reset design",
            ariaLabel: "Reset course design",
            disabled: !editable,
          },
        ],
      },
    ],
    footerActions: [
      ...(mode === "dark"
        ? [
            {
              id: "derive-dark" as const,
              label: "Use automatic dark colours",
              disabled: !editable,
            },
          ]
        : []),
      {
        id: "reset-theme",
        label: "Reset theme",
        ariaLabel: "Reset complete theme",
        disabled: !resetThemeEnabled,
      },
    ],
  };
}

export function toCourseThemeFormValues(
  theme: PersistedCourseTheme,
  values: CourseThemeValues,
  mode: ScaffoldColorMode,
): CourseThemeFormValues {
  const palette = mode === "light" ? values.colors.author.light : values.colors.author.dark.values;
  return {
    presetId: theme.preset.id,
    ...palette,
    ...values.typography,
    headingWeight: String(values.typography.headingWeight),
    bodyWeight: String(values.typography.bodyWeight),
    ...values.design,
  };
}

export function parseCourseThemePalette(
  draft: CourseThemeFormValues,
): CourseThemeAuthorPalette | undefined {
  const parsed = CourseThemeAuthorPaletteSchema.safeParse(
    Object.fromEntries(COURSE_THEME_PALETTE_SLOTS.map((slot) => [slot, draft[slot]])),
  );
  return parsed.success ? parsed.data : undefined;
}

export function parseCourseThemeTypography(
  draft: CourseThemeFormValues,
): CourseThemeTypography | undefined {
  const parsed = CourseThemeTypographySchema.safeParse({
    headingFontId: draft.headingFontId,
    bodyFontId: draft.bodyFontId,
    codeFontId: draft.codeFontId,
    headingWeight: Number(draft.headingWeight),
    bodyWeight: Number(draft.bodyWeight),
    typeScale: draft.typeScale,
    bodyLineHeight: draft.bodyLineHeight,
    headingLineHeight: draft.headingLineHeight,
    headingLetterSpacing: draft.headingLetterSpacing,
    uppercaseHeadings: draft.uppercaseHeadings,
  });
  return parsed.success ? parsed.data : undefined;
}

export function parseCourseThemeDesign(
  draft: CourseThemeFormValues,
): CourseThemeDesign | undefined {
  const parsed = CourseThemeDesignSchema.safeParse({
    roundness: draft.roundness,
    stroke: draft.stroke,
    shadow: draft.shadow,
    density: draft.density,
  });
  return parsed.success ? parsed.data : undefined;
}

export function isCourseThemePaletteField(name: string): name is CourseThemePaletteSlot {
  return COURSE_THEME_PALETTE_SLOTS.some((slot) => slot === name);
}

export function isCourseThemeTypographyField(name: string): boolean {
  return TYPOGRAPHY_FIELDS.has(name);
}

export function isCourseThemeDesignField(name: string): boolean {
  return DESIGN_FIELDS.has(name);
}

export function derivedDarkPalette(
  values: CourseThemeValues,
  preset: CourseThemePresetDefinition,
): CourseThemeAuthorPalette {
  return materialiseCoursePalette({
    recipe: preset.recipe,
    light: values.colors.author.light,
    dark: {
      values: values.colors.author.dark.values,
      sourceBySlot: Object.fromEntries(
        COURSE_THEME_PALETTE_SLOTS.map((slot) => [slot, "derived"]),
      ) as Record<CourseThemePaletteSlot, "derived">,
    },
  }).author.dark.values;
}

function presetFieldDescriptor(catalogue: ThemeCatalogue): SettingsSheetSelectFieldDescriptor {
  return {
    kind: "select",
    name: "presetId",
    label: "Course theme preset",
    presentation: "cards",
    options: catalogue.presets.map((preset) => ({
      value: preset.id,
      label: preset.label,
      ariaLabel: `Use ${preset.label} theme`,
      description: preset.description,
      swatches: [
        preset.values.colors.author.light.primary,
        preset.values.colors.author.light.secondary,
        preset.values.colors.author.light.accent1,
      ],
    })),
  };
}

function colourFieldDescriptor({
  derivedDark,
  disabled,
  label,
  mode,
  palette,
  preset,
  slot,
  values,
}: {
  derivedDark: CourseThemeAuthorPalette;
  disabled: { disabledReason?: string };
  label: string;
  mode: ScaffoldColorMode;
  palette: readonly ColorOption[];
  preset: CourseThemePresetDefinition;
  slot: CourseThemePaletteSlot;
  values: CourseThemeValues;
}): SettingsSheetColorFieldDescriptor {
  const source = values.colors.author.dark.sourceBySlot[slot];
  const presetPalette =
    mode === "light" ? preset.values.colors.author.light : preset.values.colors.author.dark.values;
  const resetValue = mode === "light" ? presetPalette[slot] : derivedDark[slot];

  return {
    kind: "color",
    name: slot,
    label,
    pickerLabel: label,
    labelSuffix: `course ${slot}`,
    palette,
    fallbackColor: presetPalette[slot],
    resetLabel: mode === "light" ? "Preset value" : "Use automatic colour",
    resetAriaLabel:
      mode === "light" ? `Reset ${label.toLowerCase()} colour` : `Use automatic ${slot} colour`,
    resetValue,
    customHint: "Enter a CSS colour, for example #161D77 or oklch(45% 0.18 270).",
    ...(mode === "dark"
      ? {
          status: {
            label: source === "custom" ? "Custom" : "Automatic",
            variant: source === "custom" ? ("info" as const) : ("neutral" as const),
          },
        }
      : {}),
    ...disabled,
  };
}

function presetColourOptions(
  preset: CourseThemePresetDefinition,
  mode: ScaffoldColorMode,
): readonly ColorOption[] {
  const palette =
    mode === "light" ? preset.values.colors.author.light : preset.values.colors.author.dark.values;
  const seen = new Set<string>();
  const options: ColorOption[] = [];

  for (const section of AUTHOR_COLOUR_SECTIONS) {
    for (const { slot, label } of section.slots) {
      const value = palette[slot];
      const normalised = value.trim().toLowerCase();
      if (seen.has(normalised)) continue;
      seen.add(normalised);
      options.push({ label, value });
    }
  }

  return options;
}

function typographyFields(
  catalogue: ThemeCatalogue,
  typography: CourseThemeTypography,
  disabled: { disabledReason?: string },
) {
  return [
    fontFieldDescriptor("headingFontId", "Heading font", catalogue, typography.headingFontId),
    fontFieldDescriptor("bodyFontId", "Body font", catalogue, typography.bodyFontId),
    fontFieldDescriptor("codeFontId", "Code font", catalogue, typography.codeFontId),
    {
      kind: "select" as const,
      name: "headingWeight",
      label: "Heading weight",
      options: HEADING_WEIGHTS.map((weight) => ({ label: String(weight), value: String(weight) })),
    },
    {
      kind: "select" as const,
      name: "bodyWeight",
      label: "Body weight",
      options: BODY_WEIGHTS.map((weight) => ({ label: String(weight), value: String(weight) })),
    },
    {
      kind: "number" as const,
      name: "typeScale",
      label: "Type scale",
      ...COURSE_THEME_NUMERIC_BOUNDS.typeScale,
      step: 0.05,
    },
    {
      kind: "number" as const,
      name: "bodyLineHeight",
      label: "Body line height",
      ...COURSE_THEME_NUMERIC_BOUNDS.bodyLineHeight,
      step: 0.05,
    },
    {
      kind: "number" as const,
      name: "headingLineHeight",
      label: "Heading line height",
      ...COURSE_THEME_NUMERIC_BOUNDS.headingLineHeight,
      step: 0.05,
    },
    {
      kind: "number" as const,
      name: "headingLetterSpacing",
      label: "Heading letter spacing",
      ...COURSE_THEME_NUMERIC_BOUNDS.headingLetterSpacing,
      step: 0.01,
    },
    {
      kind: "boolean" as const,
      name: "uppercaseHeadings",
      label: "Uppercase headings",
    },
  ].map((field) => ({ ...field, ...disabled }));
}

function designFields(disabled: { disabledReason?: string }) {
  return [
    {
      kind: "number" as const,
      name: "roundness",
      label: "Roundness",
      ...COURSE_THEME_NUMERIC_BOUNDS.roundness,
      step: 0.05,
    },
    {
      kind: "number" as const,
      name: "stroke",
      label: "Stroke",
      ...COURSE_THEME_NUMERIC_BOUNDS.stroke,
      step: 0.25,
    },
    {
      kind: "select" as const,
      name: "shadow",
      label: "Shadow",
      options: [
        { label: "None", value: "none" },
        { label: "Soft", value: "soft" },
        { label: "Defined", value: "defined" },
      ],
    },
    {
      kind: "select" as const,
      name: "density",
      label: "Density",
      options: [
        { label: "Compact", value: "compact" },
        { label: "Comfortable", value: "comfortable" },
        { label: "Spacious", value: "spacious" },
      ],
    },
  ].map((field) => ({ ...field, ...disabled }));
}

function fontFieldDescriptor(
  name: "bodyFontId" | "codeFontId" | "headingFontId",
  label: string,
  catalogue: ThemeCatalogue,
  value: string,
): SettingsSheetSelectFieldDescriptor {
  const unavailable = !catalogue.getFont(value);
  return {
    kind: "select",
    name,
    label,
    options: [
      ...(unavailable ? [{ label: `Unavailable (${value})`, value }] : []),
      ...catalogue.fonts.map((font) => ({ label: font.label, value: font.id })),
    ],
    ...(unavailable ? { status: { label: "Unavailable", variant: "warning" } as const } : {}),
  };
}

interface LiveThemeSettingsFormOptions<TFieldValues extends FieldValues> {
  values: TFieldValues;
  onCommit: (values: TFieldValues, name: FieldPath<TFieldValues>) => boolean;
  commitOnBlur?: readonly FieldPath<TFieldValues>[];
}

interface LiveThemeSettingsForm<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  onBlur: FocusEventHandler<HTMLElement>;
}

/**
 * Bridges shared settings controls to the Theme sheet's live command model.
 * Descriptors remain presentation-only; the Theme owner validates each field
 * family and decides which document command to run for an accepted edit.
 */
export function useLiveThemeSettingsForm<TFieldValues extends FieldValues>({
  values,
  onCommit,
  commitOnBlur = [],
}: LiveThemeSettingsFormOptions<TFieldValues>): LiveThemeSettingsForm<TFieldValues> {
  const form = useForm<TFieldValues>({
    defaultValues: values as DefaultValues<TFieldValues>,
  });
  const valuesRef = useRef(values);
  const onCommitRef = useRef(onCommit);
  const commitOnBlurRef = useRef(new Set<FieldPath<TFieldValues>>(commitOnBlur));

  valuesRef.current = values;
  onCommitRef.current = onCommit;
  commitOnBlurRef.current = new Set(commitOnBlur);

  useEffect(() => {
    if (!sameFlatValues(form.getValues(), values)) form.reset(values);
  }, [form, values]);

  useEffect(() => {
    const subscription = form.watch((draft, { name, type }) => {
      if (!name) return;

      const waitsForBlur = commitOnBlurRef.current.has(name);
      if (waitsForBlur || type !== "change") return;

      onCommitRef.current(draft as TFieldValues, name);
    });

    return subscription.unsubscribe;
  }, [form]);

  const onBlur: FocusEventHandler<HTMLElement> = (event) => {
    const name = (event.target as HTMLInputElement).name as FieldPath<TFieldValues> | undefined;
    if (!name || !commitOnBlurRef.current.has(name)) return;

    if (!onCommitRef.current(form.getValues(), name)) {
      form.setValue(name, valueAtPath(valuesRef.current, name) as never);
    }
  };

  return { form, onBlur };
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function sameFlatValues(left: FieldValues, right: FieldValues): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
}
