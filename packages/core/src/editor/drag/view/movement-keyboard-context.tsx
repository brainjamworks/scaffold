import { createContext, useContext, type ReactNode } from "react";

import type { KeyboardMovementDirection } from "../prosemirror/commands";

export interface MovementKeyboardContextValue {
  moveContained: (sourcePos: number, direction: KeyboardMovementDirection) => void;
}

const MovementKeyboardContext = createContext<MovementKeyboardContextValue | null>(null);

export function MovementKeyboardProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MovementKeyboardContextValue;
}) {
  return (
    <MovementKeyboardContext.Provider value={value}>{children}</MovementKeyboardContext.Provider>
  );
}

export function useMovementKeyboardContext(): MovementKeyboardContextValue | null {
  return useContext(MovementKeyboardContext);
}
