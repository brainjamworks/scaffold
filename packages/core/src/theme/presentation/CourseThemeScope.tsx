import type { CSSProperties, ReactNode } from "react";

import { createScaffoldDefaultTheme } from "@/theme/model/built-in-presets";
import { createThemeCatalogue } from "@/theme/model/theme-catalogue";
import { resolveCourseTheme, type ResolvedCourseTheme } from "@/theme/model/resolve-course-theme";

export interface CourseThemeScopeProps {
  children: ReactNode;
  resolvedTheme?: ResolvedCourseTheme | undefined;
}

export const DEFAULT_RESOLVED_COURSE_THEME = resolveCourseTheme({
  theme: createScaffoldDefaultTheme(),
  catalogue: createThemeCatalogue(),
  mode: "light",
});

export function CourseThemeScope({
  children,
  resolvedTheme = DEFAULT_RESOLVED_COURSE_THEME,
}: CourseThemeScopeProps) {
  const scopeStyle: CSSProperties = {
    ...resolvedTheme.cssTokens,
    colorScheme: resolvedTheme.mode,
  };

  return (
    <div
      className="sc-course-theme-scope"
      data-testid="course-theme-scope"
      data-course-color-mode={resolvedTheme.mode}
      data-course-theme-available={String(resolvedTheme.available)}
      data-effective-course-theme={resolvedTheme.effectivePresetId}
      style={scopeStyle}
    >
      {children}
    </div>
  );
}
