import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";

import type { ScaffoldColorMode } from "@/theme/state/color-mode";

import "./AppThemeProvider.css";

export type AppThemeProviderProps = Readonly<{
  appearance: ScaffoldColorMode;
  children: ReactNode;
}>;

export function AppThemeProvider({ appearance, children }: AppThemeProviderProps) {
  return (
    <Theme
      accentColor="indigo"
      appearance={appearance}
      asChild
      className="sc-app"
      data-scaffold-color-mode={appearance}
      grayColor="slate"
      hasBackground={false}
      panelBackground="solid"
      radius="medium"
      scaling="100%"
      style={{ colorScheme: appearance }}
    >
      {children}
    </Theme>
  );
}
