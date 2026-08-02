import { deepFreeze, type CourseThemePresetRevision } from "../course-theme-preset";
import { SCAFFOLD_FLOW_V1 } from "./scaffold-flow/v1";

export interface BuiltInCourseThemeRegistry {
  presets: readonly CourseThemePresetRevision[];
  get(id: string, revision: string): CourseThemePresetRevision | null;
}

export function createBuiltInCourseThemeRegistry(
  presets: readonly CourseThemePresetRevision[],
): BuiltInCourseThemeRegistry {
  const presetByRevision = new Map<string, CourseThemePresetRevision>();

  for (const preset of presets) {
    const key = `${preset.id}@${preset.revision}`;
    if (presetByRevision.has(key)) {
      throw new Error(`Duplicate built-in Course theme revision "${key}"`);
    }
    presetByRevision.set(key, preset);
  }

  return Object.freeze({
    presets: deepFreeze([...presets]),
    get: (id: string, revision: string) => presetByRevision.get(`${id}@${revision}`) ?? null,
  });
}

export const builtInCourseThemeRegistry = createBuiltInCourseThemeRegistry([SCAFFOLD_FLOW_V1]);

export { SCAFFOLD_FLOW_V1 } from "./scaffold-flow/v1";
