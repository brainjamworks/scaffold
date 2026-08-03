import type { PersistedCourseTheme } from "@scaffold/contracts";
import { Theme } from "@radix-ui/themes";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";

import type { ScaffoldColorMode } from "@/theme/state/color-mode";

import { builtInCourseColourSystemRegistry } from "./colour-systems/registry";
import { builtInCourseDesignThemeRegistry } from "./designs/registry";
import {
  resolveCourseTheme,
  type ResolvedCourseTheme,
  type UnavailableCourseTheme,
} from "./resolve-course-theme";

export type CourseThemeProviderProps = Readonly<{
  theme: PersistedCourseTheme;
  appearance: ScaffoldColorMode;
  children: ReactNode;
}>;

export type CourseThemePortalBoundaryProps = Readonly<{
  children: ReactNode;
}>;

const CourseThemeContext = createContext<ResolvedCourseTheme | undefined>(undefined);

export function CourseThemeProvider({ theme, appearance, children }: CourseThemeProviderProps) {
  const resolved = resolveCourseTheme({
    theme,
    appearance,
    designs: builtInCourseDesignThemeRegistry,
    colourSystems: builtInCourseColourSystemRegistry,
  });

  if (resolved.status === "unavailable") return <UnavailableCourseThemeStatus theme={resolved} />;

  return (
    <CourseThemeContext.Provider value={resolved}>
      <CourseThemeScope theme={resolved}>{children}</CourseThemeScope>
    </CourseThemeContext.Provider>
  );
}

export function CourseThemePortalBoundary({ children }: CourseThemePortalBoundaryProps) {
  const theme = useContext(CourseThemeContext);
  if (!theme) {
    throw new Error("CourseThemePortalBoundary must be used within a ready CourseThemeProvider");
  }

  return (
    <CourseThemeScope theme={theme} asChild>
      {children}
    </CourseThemeScope>
  );
}

export function useCourseTheme(): ResolvedCourseTheme {
  const theme = useContext(CourseThemeContext);
  if (!theme) throw new Error("useCourseTheme must be used within a ready CourseThemeProvider");
  return theme;
}

function CourseThemeScope({
  theme,
  asChild = false,
  children,
}: Readonly<{ theme: ResolvedCourseTheme; asChild?: boolean; children: ReactNode }>) {
  const style: CSSProperties = { ...theme.rootStyle };

  return (
    <Theme
      {...theme.radixThemeProps}
      asChild={asChild}
      className={theme.rootClassNames.join(" ")}
      style={style}
    >
      {children}
    </Theme>
  );
}

function UnavailableCourseThemeStatus({ theme }: Readonly<{ theme: UnavailableCourseTheme }>) {
  const reference = `${theme.reference.id}@${theme.reference.revision}`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-course-theme-status="unavailable"
      data-course-theme-missing={theme.missing}
      data-course-theme-reference={reference}
    >
      Course theme unavailable: {theme.missing} {reference}
    </div>
  );
}
