import { MoonIcon as Moon, SunIcon as Sun } from "@phosphor-icons/react";

import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { AuthoringHeaderIconButton } from "./AuthoringHeaderIconButton";

export interface AuthoringColorModeButtonProps {
  mode: ScaffoldColorMode;
  onToggle: () => void;
}

/** Shared App-shell control for switching Scaffold's authoring colour mode. */
export function AuthoringColorModeButton({ mode, onToggle }: AuthoringColorModeButtonProps) {
  const nextMode = mode === "light" ? "dark" : "light";

  return (
    <AuthoringHeaderIconButton
      aria-label={`Switch authoring application to ${nextMode} mode`}
      aria-pressed={mode === "dark"}
      onClick={onToggle}
      tooltip={`Use ${nextMode} mode`}
    >
      {mode === "light" ? <Moon aria-hidden size={iconSm} /> : <Sun aria-hidden size={iconSm} />}
    </AuthoringHeaderIconButton>
  );
}
