import { useSyncExternalStore } from "react";

import type { ScaffoldColorMode } from "@/theme/model";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export interface ScaffoldLearnerColorModeProps {
  hostColorMode?: ScaffoldColorMode;
}

export function useLearnerColorMode(hostColorMode?: ScaffoldColorMode): ScaffoldColorMode {
  const browserColorMode = useSyncExternalStore(
    subscribeToBrowserColorMode,
    readBrowserColorMode,
    (): ScaffoldColorMode => "light",
  );

  return hostColorMode === "light" || hostColorMode === "dark" ? hostColorMode : browserColorMode;
}

function subscribeToBrowserColorMode(onStoreChange: () => void): () => void {
  const mediaQuery = getDarkModeMediaQuery();
  if (!mediaQuery) return () => {};

  try {
    mediaQuery.addEventListener("change", onStoreChange);
    return () => {
      try {
        mediaQuery.removeEventListener("change", onStoreChange);
      } catch {
        // Browser preference observation is optional.
      }
    };
  } catch {
    return () => {};
  }
}

function readBrowserColorMode(): ScaffoldColorMode {
  return getDarkModeMediaQuery()?.matches ? "dark" : "light";
}

function getDarkModeMediaQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(DARK_MODE_QUERY) : null;
  } catch {
    return null;
  }
}
