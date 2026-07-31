import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { CourseThemeCssColor, CourseThemePaletteSlot } from "@scaffold/contracts";

import { PersistedCourseThemeSchema, type PersistedCourseTheme } from "@/schemas/course-document";
import { materialiseCoursePalette, type CourseThemePresetDefinition } from "@/theme/model";

export type CourseThemePaletteSection = "foundation" | "creative" | "link";

const PALETTE_SECTION_SLOTS = {
  foundation: ["background", "surface", "bodyText", "headingText"],
  creative: ["primary", "secondary", "accent1", "accent2", "accent3", "accent4"],
  link: ["link"],
} as const satisfies Record<CourseThemePaletteSection, readonly CourseThemePaletteSlot[]>;

export function selectCoursePreset(editor: Editor, preset: CourseThemePresetDefinition): boolean {
  return replaceCourseTheme(editor, {
    schemaVersion: 1,
    preset: {
      id: preset.id,
      revision: preset.revision,
    },
    values: structuredClone(preset.values),
  });
}

export function resetCourseTheme(editor: Editor, preset: CourseThemePresetDefinition): boolean {
  stopCollaborativeHistoryCapture(editor);
  return replaceCourseTheme(
    editor,
    {
      schemaVersion: 1,
      preset: {
        id: preset.id,
        revision: preset.revision,
      },
      values: structuredClone(preset.values),
    },
    true,
  );
}

export function updateCourseTheme(editor: Editor, theme: PersistedCourseTheme): boolean {
  return replaceCourseTheme(editor, theme);
}

export function updateCourseThemePaletteSlot(
  editor: Editor,
  preset: CourseThemePresetDefinition,
  variant: "light" | "dark",
  slot: CourseThemePaletteSlot,
  color: CourseThemeCssColor,
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme?.values) return false;
  const nextTheme = structuredClone(theme);
  const values = nextTheme.values;
  if (!values) return false;

  if (variant === "light") {
    values.colors.author.light[slot] = color;
  } else {
    values.colors.author.dark.values[slot] = color;
    values.colors.author.dark.sourceBySlot[slot] = "custom";
  }

  materialiseThemeColors(values, preset);
  return replaceCourseTheme(editor, nextTheme);
}

export function resetCourseThemePaletteSection(
  editor: Editor,
  preset: CourseThemePresetDefinition,
  section: CourseThemePaletteSection,
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme?.values) return false;
  const nextTheme = structuredClone(theme);
  const values = nextTheme.values;
  if (!values) return false;

  for (const slot of PALETTE_SECTION_SLOTS[section]) {
    values.colors.author.light[slot] = preset.values.colors.author.light[slot];
    values.colors.author.dark.values[slot] = preset.values.colors.author.dark.values[slot];
    values.colors.author.dark.sourceBySlot[slot] = "derived";
  }
  materialiseThemeColors(values, preset);
  stopCollaborativeHistoryCapture(editor);
  return replaceCourseTheme(editor, nextTheme, true);
}

export function resetCourseThemeDarkDerivation(
  editor: Editor,
  preset: CourseThemePresetDefinition,
  slot?: CourseThemePaletteSlot,
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme?.values) return false;
  const nextTheme = structuredClone(theme);
  const values = nextTheme.values;
  if (!values) return false;

  const slots = slot
    ? [slot]
    : (Object.keys(values.colors.author.dark.sourceBySlot) as CourseThemePaletteSlot[]);
  for (const paletteSlot of slots) {
    values.colors.author.dark.sourceBySlot[paletteSlot] = "derived";
  }
  materialiseThemeColors(values, preset);
  stopCollaborativeHistoryCapture(editor);
  return replaceCourseTheme(editor, nextTheme, true);
}

export function resetCourseThemeSection(
  editor: Editor,
  preset: CourseThemePresetDefinition,
  section: "colors" | "typography" | "design",
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme?.values) return false;
  const nextTheme = structuredClone(theme);
  const values = nextTheme.values;
  if (!values) return false;
  switch (section) {
    case "colors":
      values.colors = structuredClone(preset.values.colors);
      break;
    case "typography":
      values.typography = structuredClone(preset.values.typography);
      break;
    case "design":
      values.design = structuredClone(preset.values.design);
      break;
  }
  stopCollaborativeHistoryCapture(editor);
  return replaceCourseTheme(editor, nextTheme, true);
}

function stopCollaborativeHistoryCapture(editor: Editor): void {
  for (const plugin of editor.state.plugins) {
    const pluginKey = plugin.spec.key as { key: string } | undefined;
    if (!pluginKey?.key.startsWith("y-undo$")) continue;
    const pluginState = plugin.getState(editor.state) as
      | { undoManager?: { stopCapturing: () => void } }
      | undefined;
    pluginState?.undoManager?.stopCapturing();
    return;
  }
}

function materialiseThemeColors(
  values: NonNullable<PersistedCourseTheme["values"]>,
  preset: CourseThemePresetDefinition,
): void {
  const materialised = materialiseCoursePalette({
    recipe: preset.recipe,
    light: values.colors.author.light,
    dark: values.colors.author.dark,
  });
  values.colors = materialised;
}

function readCourseTheme(editor: Editor): PersistedCourseTheme | null {
  const parsed = PersistedCourseThemeSchema.safeParse(editor.state.doc.firstChild?.attrs["theme"]);
  return parsed.success ? parsed.data : null;
}

function replaceCourseTheme(
  editor: Editor,
  theme: PersistedCourseTheme,
  startsNewHistoryGroup = false,
): boolean {
  const parsed = PersistedCourseThemeSchema.safeParse(structuredClone(theme));
  const courseDocument = editor.state.doc.firstChild;
  if (!parsed.success || courseDocument?.type.name !== "courseDocument") return false;

  let transaction = editor.state.tr.setNodeMarkup(0, undefined, {
    ...courseDocument.attrs,
    theme: parsed.data,
  });
  if (startsNewHistoryGroup) transaction = closeHistory(transaction);
  editor.view.dispatch(transaction);
  return true;
}
