import { useCallback, useState } from "react";

import type { ScaffoldColorMode } from "@/theme/model";

export const AUTHORING_COLOR_MODE_STORAGE_KEY = "scaffold.authoring.color-mode.v1";

export interface AuthoringColorModeState {
  mode: ScaffoldColorMode;
  toggleMode: () => void;
}

export function useAuthoringColorMode(): AuthoringColorModeState {
  const [mode, setMode] = useState<ScaffoldColorMode>(readInitialColorMode);
  const toggleMode = useCallback(() => {
    const nextMode = mode === "light" ? "dark" : "light";
    setMode(nextMode);
    writeStoredColorMode(nextMode);
  }, [mode]);

  return { mode, toggleMode };
}

function readInitialColorMode(): ScaffoldColorMode {
  const storedMode = readStoredColorMode();
  if (storedMode) return storedMode;

  try {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function readStoredColorMode(): ScaffoldColorMode | null {
  try {
    const value = window.localStorage.getItem(AUTHORING_COLOR_MODE_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredColorMode(mode: ScaffoldColorMode): void {
  try {
    window.localStorage.setItem(AUTHORING_COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // The active in-memory preference remains valid when storage is unavailable.
  }
}
