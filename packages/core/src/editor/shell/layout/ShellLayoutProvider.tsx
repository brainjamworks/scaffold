import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";

import type {
  ShellLayoutActions,
  ShellLayoutState,
  ShellLayoutStore,
} from "./shell-layout-store";

export const ShellLayoutContext = createContext<ShellLayoutStore | null>(null);

export interface ShellLayoutProviderProps {
  children?: ReactNode;
  store: ShellLayoutStore;
}

export function ShellLayoutProvider({ children, store }: ShellLayoutProviderProps) {
  return <ShellLayoutContext.Provider value={store}>{children}</ShellLayoutContext.Provider>;
}

export function useShellLayoutStore(): ShellLayoutStore {
  const store = useContext(ShellLayoutContext);

  if (!store) {
    throw new Error("Shell layout hooks must be used inside a ShellLayoutProvider.");
  }

  return store;
}

export function useShellLayout<Selected>(
  selector: (state: ShellLayoutState & ShellLayoutActions) => Selected,
): Selected {
  return useStore(useShellLayoutStore(), selector);
}
