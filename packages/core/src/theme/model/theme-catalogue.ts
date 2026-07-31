import { builtInThemePresets } from "./built-in-presets";
import { builtInThemeFonts } from "./built-in-fonts";
import {
  CourseThemeFontDefinitionSchema,
  CourseThemePresetDefinitionSchema,
  type CourseThemeFontDefinition,
  type CourseThemePresetDefinition,
  type CourseThemeFontWeight,
} from "./theme-extension-schema";

export type ThemeCatalogueIssueCode =
  | "invalid-preset"
  | "invalid-font"
  | "duplicate-preset-id"
  | "duplicate-font-id"
  | "reserved-id"
  | "missing-font"
  | "unsupported-font-weight";

export interface ThemeCatalogueIssue {
  code: ThemeCatalogueIssueCode;
  id: string | null;
  message: string;
}

export interface ThemeCatalogue {
  presets: readonly CourseThemePresetDefinition[];
  fonts: readonly CourseThemeFontDefinition[];
  issues: readonly ThemeCatalogueIssue[];
  defaultPreset: CourseThemePresetDefinition;
  getPreset(id: string): CourseThemePresetDefinition | null;
  getFont(id: string): CourseThemeFontDefinition | null;
  hasPreset(id: string): boolean;
}

export function createThemeCatalogue(extension?: unknown): ThemeCatalogue {
  const issues: ThemeCatalogueIssue[] = [];
  const fonts: CourseThemeFontDefinition[] = structuredClone([...builtInThemeFonts]);
  const fontIds = new Set(fonts.map(({ id }) => id));
  const rawFonts = readExtensionEntries(extension, "fonts", issues, "invalid-font");

  for (const rawFont of rawFonts) {
    const parsed = CourseThemeFontDefinitionSchema.safeParse(rawFont);
    if (!parsed.success) {
      issues.push(issue("invalid-font", readId(rawFont), "Font definition is invalid."));
      continue;
    }
    if (isReservedId(parsed.data.id)) {
      issues.push(issue("reserved-id", parsed.data.id, "The scaffold- ID prefix is reserved."));
      continue;
    }
    if (fontIds.has(parsed.data.id)) {
      issues.push(issue("duplicate-font-id", parsed.data.id, "Font ID is already defined."));
      continue;
    }
    fontIds.add(parsed.data.id);
    fonts.push(parsed.data);
  }

  const presets = CourseThemePresetDefinitionSchema.array().parse(
    structuredClone(builtInThemePresets),
  );
  const presetIds = new Set(presets.map(({ id }) => id));
  const rawPresets = readExtensionEntries(extension, "presets", issues, "invalid-preset");

  for (const rawPreset of rawPresets) {
    const parsed = CourseThemePresetDefinitionSchema.safeParse(rawPreset);
    if (!parsed.success) {
      issues.push(issue("invalid-preset", readId(rawPreset), "Preset definition is invalid."));
      continue;
    }
    if (isReservedId(parsed.data.id)) {
      issues.push(issue("reserved-id", parsed.data.id, "The scaffold- ID prefix is reserved."));
      continue;
    }
    if (presetIds.has(parsed.data.id)) {
      issues.push(issue("duplicate-preset-id", parsed.data.id, "Preset ID is already defined."));
      continue;
    }
    presetIds.add(parsed.data.id);

    const validationIssue = validatePresetFonts(parsed.data, fonts);
    if (validationIssue) {
      issues.push(validationIssue);
      continue;
    }
    presets.push(parsed.data);
  }

  const frozenFonts = deepFreeze(fonts);
  const frozenPresets = deepFreeze(presets);
  const presetById = new Map(frozenPresets.map((preset) => [preset.id, preset]));
  const fontById = new Map(frozenFonts.map((font) => [font.id, font]));
  const catalogue: ThemeCatalogue = {
    presets: frozenPresets,
    fonts: frozenFonts,
    issues: deepFreeze(issues),
    defaultPreset: frozenPresets[0]!,
    getPreset: (id) => presetById.get(id) ?? null,
    getFont: (id) => fontById.get(id) ?? null,
    hasPreset: (id) => presetById.has(id),
  };
  return Object.freeze(catalogue);
}

function validatePresetFonts(
  preset: CourseThemePresetDefinition,
  fonts: readonly CourseThemeFontDefinition[],
): ThemeCatalogueIssue | null {
  const fontsById = new Map(fonts.map((font) => [font.id, font]));
  const { typography } = preset.values;
  const referencedIds = [typography.headingFontId, typography.bodyFontId, typography.codeFontId];
  const missingId = referencedIds.find((id) => !fontsById.has(id));
  if (missingId) {
    return issue("missing-font", preset.id, `Preset references missing font "${missingId}".`);
  }

  const requestedWeights: readonly [string, CourseThemeFontWeight][] = [
    [typography.headingFontId, typography.headingWeight],
    [typography.bodyFontId, typography.bodyWeight],
  ];
  for (const [fontId, weight] of requestedWeights) {
    if (!fontsById.get(fontId)!.weights.includes(weight)) {
      return issue(
        "unsupported-font-weight",
        preset.id,
        `Font "${fontId}" does not support weight ${weight}.`,
      );
    }
  }
  return null;
}

function readExtensionEntries(
  extension: unknown,
  key: "fonts" | "presets",
  issues: ThemeCatalogueIssue[],
  code: "invalid-font" | "invalid-preset",
): readonly unknown[] {
  if (extension === undefined) return [];
  if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
    issues.push(issue(code, null, "Theme extension must be an object."));
    return [];
  }
  const value = (extension as Record<string, unknown>)[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(issue(code, null, `${key} must be an array.`));
    return [];
  }
  return value;
}

function readId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>)["id"];
  return typeof id === "string" && id.trim() ? id : null;
}

function isReservedId(id: string): boolean {
  return id.startsWith("scaffold-");
}

function issue(
  code: ThemeCatalogueIssueCode,
  id: string | null,
  message: string,
): ThemeCatalogueIssue {
  return { code, id, message };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
