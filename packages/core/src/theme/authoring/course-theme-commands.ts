import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { CourseThemeRef } from "@scaffold/contracts";

import {
  PersistedCourseThemeSchema,
  type CourseThemeNonColourAuthorOverrides,
  type PersistedCourseTheme,
} from "@/schemas/course-document";
import type { CourseColourSystemRegistry } from "@/theme/course/colour-systems/registry";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import type {
  CourseDesignThemeRegistry,
  CourseDesignThemeRevision,
} from "@/theme/course/designs/registry";
import { builtInThemeFonts } from "@/theme/model/built-in-fonts";

type CourseTypographyOverrides = NonNullable<
  CourseThemeNonColourAuthorOverrides["typography"]
>;
type CourseDesignOverrides = NonNullable<CourseThemeNonColourAuthorOverrides["design"]>;

export function setCourseTypographyOverride<Field extends keyof CourseTypographyOverrides>(
  editor: Editor,
  field: Field,
  value: NonNullable<CourseTypographyOverrides[Field]>,
  designs: CourseDesignThemeRegistry,
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme) return false;
  const design = designs.get(theme.design);
  if (!design || !Object.hasOwn(design.authorDefaults.typography, field)) return false;

  const candidate = prepareCourseTheme(
    {
      ...theme,
      overrides: {
        ...theme.overrides,
        typography: { ...theme.overrides.typography, [field]: value },
      },
    },
    design,
  );
  return candidate ? writeCourseTheme(editor, candidate) : false;
}

export function setCourseDesignOverride<Field extends keyof CourseDesignOverrides>(
  editor: Editor,
  field: Field,
  value: NonNullable<CourseDesignOverrides[Field]>,
  designs: CourseDesignThemeRegistry,
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme) return false;
  const design = designs.get(theme.design);
  if (!design || !Object.hasOwn(design.authorDefaults.design, field)) return false;

  const candidate = prepareCourseTheme(
    {
      ...theme,
      overrides: {
        ...theme.overrides,
        design: { ...theme.overrides.design, [field]: value },
      },
    },
    design,
  );
  return candidate ? writeCourseTheme(editor, candidate) : false;
}

export function resetCourseThemeOverride(
  editor: Editor,
  section: "typography",
  field: keyof CourseTypographyOverrides,
  designs: CourseDesignThemeRegistry,
): boolean;
export function resetCourseThemeOverride(
  editor: Editor,
  section: "design",
  field: keyof CourseDesignOverrides,
  designs: CourseDesignThemeRegistry,
): boolean;
export function resetCourseThemeOverride(
  editor: Editor,
  section: "typography" | "design",
  field: string,
  designs: CourseDesignThemeRegistry,
): boolean {
  const theme = readCourseTheme(editor);
  if (!theme) return false;
  const design = designs.get(theme.design);
  const defaults = design?.authorDefaults[section];
  const currentSection = theme.overrides[section];
  if (
    !design ||
    !defaults ||
    !Object.hasOwn(defaults, field) ||
    !currentSection ||
    !Object.hasOwn(currentSection, field)
  ) {
    return false;
  }

  const nextSection = { ...currentSection };
  Reflect.deleteProperty(nextSection, field);
  const overrides = { ...theme.overrides };
  if (Object.keys(nextSection).length === 0) Reflect.deleteProperty(overrides, section);
  else Reflect.set(overrides, section, nextSection);

  const candidate = prepareCourseTheme({ ...theme, overrides }, design);
  return candidate ? writeCourseTheme(editor, candidate) : false;
}

export function resetCourseThemeOverrideSection(
  editor: Editor,
  section: keyof CourseThemeNonColourAuthorOverrides,
  designs: CourseDesignThemeRegistry,
): boolean {
  if (section !== "typography" && section !== "design") return false;
  const theme = readCourseTheme(editor);
  if (!theme?.overrides[section]) return false;
  const design = designs.get(theme.design);
  if (!design) return false;

  const overrides = { ...theme.overrides };
  Reflect.deleteProperty(overrides, section);
  const candidate = prepareCourseTheme({ ...theme, overrides }, design);
  return candidate ? writeCourseTheme(editor, candidate) : false;
}

export function selectCourseDesign(
  editor: Editor,
  reference: CourseThemeRef,
  designs: CourseDesignThemeRegistry,
  colourSystems: CourseColourSystemRegistry,
): boolean {
  const design = designs.get(reference);
  if (!design || !colourSystems.get(design.defaultColourSystem)) return false;
  const theme = readCourseTheme(editor);
  if (!theme) return false;

  const candidate = prepareCourseTheme(
    {
      schemaVersion: 1,
      design: { id: design.id, revision: design.revision },
      colourSystem: {
        id: design.defaultColourSystem.id,
        revision: design.defaultColourSystem.revision,
      },
      overrides: theme.overrides,
    },
    design,
  );
  return candidate ? writeCourseTheme(editor, candidate) : false;
}

export function selectCourseColourSystem(
  editor: Editor,
  reference: CourseThemeRef,
  registry: CourseColourSystemRegistry,
): boolean {
  const colourSystem = registry.get(reference);
  if (!colourSystem) return false;
  const theme = readCourseTheme(editor);
  if (!theme || !hasValidExplicitFontOverrides(theme.overrides)) return false;

  return writeCourseTheme(editor, {
    schemaVersion: 1,
    design: theme.design,
    colourSystem: { id: colourSystem.id, revision: colourSystem.revision },
    overrides: theme.overrides,
  });
}

export function resetCourseTheme(editor: Editor): boolean {
  if (!readCourseTheme(editor)) return false;
  stopCollaborativeHistoryCapture(editor);
  return writeCourseTheme(editor, createDefaultPersistedCourseTheme(), true);
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

function prepareCourseTheme(
  candidate: unknown,
  design: CourseDesignThemeRevision,
): PersistedCourseTheme | null {
  const parsed = PersistedCourseThemeSchema.safeParse(candidate);
  if (
    !parsed.success ||
    parsed.data.design.id !== design.id ||
    parsed.data.design.revision !== design.revision ||
    !hasValidEffectiveFonts(parsed.data.overrides, design)
  ) {
    return null;
  }

  return {
    ...parsed.data,
    overrides: normalizeOverrides(parsed.data.overrides, design),
  };
}

function normalizeOverrides(
  source: CourseThemeNonColourAuthorOverrides,
  design: CourseDesignThemeRevision,
): CourseThemeNonColourAuthorOverrides {
  const overrides: CourseThemeNonColourAuthorOverrides = {};
  if (source.typography) {
    const typography = { ...source.typography };
    for (const field of Object.keys(typography)) {
      if (
        Reflect.get(typography, field) === Reflect.get(design.authorDefaults.typography, field)
      ) {
        Reflect.deleteProperty(typography, field);
      }
    }
    if (Object.keys(typography).length > 0) overrides.typography = typography;
  }
  if (source.design) {
    const designOverrides = { ...source.design };
    for (const field of Object.keys(designOverrides)) {
      if (
        Reflect.get(designOverrides, field) === Reflect.get(design.authorDefaults.design, field)
      ) {
        Reflect.deleteProperty(designOverrides, field);
      }
    }
    if (Object.keys(designOverrides).length > 0) overrides.design = designOverrides;
  }
  return overrides;
}

function hasValidEffectiveFonts(
  overrides: CourseThemeNonColourAuthorOverrides,
  design: CourseDesignThemeRevision,
): boolean {
  const typography = overrides.typography;
  const defaultFont = findBuiltInFont(
    typography?.defaultFontId ?? design.authorDefaults.typography.defaultFontId,
  );
  const headingFont = findBuiltInFont(
    typography?.headingFontId ?? design.authorDefaults.typography.headingFontId,
  );
  const codeFont = findBuiltInFont(
    typography?.codeFontId ?? design.authorDefaults.typography.codeFontId,
  );
  if (
    !defaultFont ||
    !headingFont ||
    !codeFont ||
    (defaultFont.category !== "sans" && defaultFont.category !== "serif") ||
    (headingFont.category !== "sans" && headingFont.category !== "serif") ||
    codeFont.category !== "mono"
  ) {
    return false;
  }

  const bodyWeight = typography?.bodyWeight ?? design.authorDefaults.typography.bodyWeight;
  const headingWeight =
    typography?.headingWeight ?? design.authorDefaults.typography.headingWeight;
  return (
    fontSupportsWeight(defaultFont, bodyWeight) &&
    fontSupportsWeight(headingFont, headingWeight)
  );
}

function hasValidExplicitFontOverrides(
  overrides: CourseThemeNonColourAuthorOverrides,
): boolean {
  const typography = overrides.typography;
  if (!typography) return true;

  const defaultFont = typography.defaultFontId
    ? findBuiltInFont(typography.defaultFontId)
    : undefined;
  const headingFont = typography.headingFontId
    ? findBuiltInFont(typography.headingFontId)
    : undefined;
  const codeFont = typography.codeFontId ? findBuiltInFont(typography.codeFontId) : undefined;
  if (
    (typography.defaultFontId &&
      (!defaultFont ||
        (defaultFont.category !== "sans" && defaultFont.category !== "serif"))) ||
    (typography.headingFontId &&
      (!headingFont ||
        (headingFont.category !== "sans" && headingFont.category !== "serif"))) ||
    (typography.codeFontId && (!codeFont || codeFont.category !== "mono")) ||
    (defaultFont &&
      typography.bodyWeight !== undefined &&
      !fontSupportsWeight(defaultFont, typography.bodyWeight)) ||
    (headingFont &&
      typography.headingWeight !== undefined &&
      !fontSupportsWeight(headingFont, typography.headingWeight))
  ) {
    return false;
  }
  return true;
}

function findBuiltInFont(fontId: string): (typeof builtInThemeFonts)[number] | undefined {
  return builtInThemeFonts.find((font) => font.id === fontId);
}

function fontSupportsWeight(font: (typeof builtInThemeFonts)[number], weight: number): boolean {
  return font.weights.some((supportedWeight) => supportedWeight === weight);
}

function readCourseTheme(editor: Editor): PersistedCourseTheme | null {
  const courseDocument = editor.state.doc.firstChild;
  if (courseDocument?.type.name !== "courseDocument") return null;
  const parsed = PersistedCourseThemeSchema.safeParse(courseDocument.attrs["theme"]);
  return parsed.success ? parsed.data : null;
}

function writeCourseTheme(
  editor: Editor,
  theme: PersistedCourseTheme,
  startsNewHistoryGroup = false,
): boolean {
  const parsed = PersistedCourseThemeSchema.safeParse(theme);
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
