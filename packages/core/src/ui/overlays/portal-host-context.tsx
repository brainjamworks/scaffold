import { createContext, useContext, type ReactNode } from "react";

export type OverlayBoundaryKind = "viewport" | "contained";

export type OverlayPositionStrategy = "fixed" | "absolute";

export type OverlayBoundaryResolution =
  | { status: "unscoped" }
  | { status: "pending" }
  | {
      status: "ready";
      environment: OverlayBoundaryEnvironment;
    };

export interface OverlayBoundaryEnvironment {
  host: HTMLElement;
  collisionBoundary: Element | null;
  kind: OverlayBoundaryKind;
  ownerDocument: Document;
  ownerWindow: Window;
  strategy: OverlayPositionStrategy;
}

interface OverlayBoundaryResolutionProviderProps {
  resolution: OverlayBoundaryResolution;
  children: ReactNode;
}

export const unscopedOverlayBoundaryResolution = { status: "unscoped" } as const;
export const pendingOverlayBoundaryResolution = { status: "pending" } as const;

const OverlayBoundaryContext = createContext<OverlayBoundaryResolution>(
  unscopedOverlayBoundaryResolution,
);

export function OverlayBoundaryResolutionProvider({
  resolution,
  children,
}: OverlayBoundaryResolutionProviderProps) {
  return <OverlayBoundaryContext value={resolution}>{children}</OverlayBoundaryContext>;
}

export function useOverlayBoundary(): OverlayBoundaryResolution {
  return useContext(OverlayBoundaryContext);
}
