import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";

import type { InteractionOwnerSnapshot } from "../model/interaction-owner-state";
import type {
  InteractionCommands,
  InteractionStore,
  InteractionStoreState,
} from "./interaction-store";

const InteractionContext = createContext<InteractionStore | null>(null);

export interface InteractionProviderProps {
  children?: ReactNode;
  store: InteractionStore;
}

export function InteractionProvider({ children, store }: InteractionProviderProps) {
  return <InteractionContext.Provider value={store}>{children}</InteractionContext.Provider>;
}

export function useInteractionStore(): InteractionStore {
  const store = useContext(InteractionContext);

  if (!store) {
    throw new Error("Interaction hooks must be used inside an InteractionProvider.");
  }

  return store;
}

export function useInteractionSelector<Selected>(
  selector: (state: InteractionStoreState) => Selected,
): Selected {
  return useStore(useInteractionStore(), selector);
}

export function useInteractionSnapshot(): InteractionOwnerSnapshot {
  return useInteractionSelector((state) => state.snapshot);
}

export function useInteractionCommands(): InteractionCommands {
  return useInteractionSelector((state) => state.commands);
}
