import { visitTokenLeaves } from "./course-theme-preset";
import type {
  ResolvedCourseUiTokens,
  ScCourseCssProperties,
  ScCourseCssProperty,
} from "./course-ui-tokens";

export function projectCourseThemeCss(tokens: ResolvedCourseUiTokens): ScCourseCssProperties {
  const properties: Partial<Record<ScCourseCssProperty, string>> = {};

  for (const layer of [tokens.functional, tokens.component]) {
    visitTokenLeaves(layer, [], (path, value) => {
      properties[toCssProperty(path)] = value;
    });
  }

  return Object.freeze(properties) as ScCourseCssProperties;
}

function toCssProperty(path: string[]): ScCourseCssProperty {
  const name = path
    .join("-")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
  return `--sc-course-${name}`;
}
