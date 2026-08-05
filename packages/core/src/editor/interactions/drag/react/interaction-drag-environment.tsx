import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import type { InteractionCoordinateSpace } from "../model/coordinate-space";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

export type DragEnvironmentPendingReason = "root" | "overlay-boundary" | "invalid";

export interface ReadyInteractionDragEnvironment {
  readonly coordinateSpace: InteractionCoordinateSpace;
  readonly coordinateRoot: HTMLElement;
  readonly overlayHost: HTMLElement;
  readonly collisionBoundary: HTMLElement;
  readonly ownerDocument: Document;
  readonly ownerWindow: Window;
  readonly positionStrategy: "fixed";
}

export type InteractionDragEnvironmentResolution =
  | Readonly<{ status: "unscoped" }>
  | Readonly<{ status: "pending"; reason: DragEnvironmentPendingReason }>
  | Readonly<{ status: "ready"; environment: ReadyInteractionDragEnvironment }>;

export interface InteractionDragEnvironmentProviderProps {
  readonly children: ReactNode;
  readonly coordinateRoot: HTMLElement | null;
  readonly coordinateSpace: InteractionCoordinateSpace | null;
}

const unscopedResolution = Object.freeze({ status: "unscoped" } as const);
const pendingRootResolution = Object.freeze({ status: "pending", reason: "root" } as const);
const pendingOverlayResolution = Object.freeze({
  status: "pending",
  reason: "overlay-boundary",
} as const);
const pendingInvalidResolution = Object.freeze({ status: "pending", reason: "invalid" } as const);

const InteractionDragEnvironmentContext =
  createContext<InteractionDragEnvironmentResolution>(unscopedResolution);

export function InteractionDragEnvironmentProvider({
  children,
  coordinateRoot,
  coordinateSpace,
}: InteractionDragEnvironmentProviderProps) {
  const overlayBoundary = useOverlayBoundary();
  const resolution = useMemo<InteractionDragEnvironmentResolution>(() => {
    if (!coordinateRoot || !coordinateSpace) return pendingRootResolution;
    if (overlayBoundary.status !== "ready") return pendingOverlayResolution;

    const ownerDocument = coordinateRoot.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const { environment: overlay } = overlayBoundary;
    const collisionBoundary = overlay.collisionBoundary;
    if (
      !ownerWindow ||
      !coordinateRoot.isConnected ||
      !isHTMLElementInWindow(coordinateRoot, ownerWindow) ||
      !isHTMLElementInWindow(overlay.host, ownerWindow) ||
      !isHTMLElementInWindow(collisionBoundary, ownerWindow) ||
      !overlay.host.isConnected ||
      !collisionBoundary.isConnected ||
      overlay.ownerDocument !== ownerDocument ||
      overlay.ownerWindow !== ownerWindow ||
      overlay.host.ownerDocument !== ownerDocument ||
      collisionBoundary.ownerDocument !== ownerDocument ||
      !coordinateSpaceMatchesRoot(coordinateSpace, coordinateRoot) ||
      coordinateSpace.measure() === null ||
      (coordinateSpace.kind === "scaled-canvas" && coordinateRoot.contains(overlay.host))
    ) {
      return pendingInvalidResolution;
    }

    return Object.freeze({
      status: "ready",
      environment: Object.freeze({
        coordinateSpace,
        coordinateRoot,
        overlayHost: overlay.host,
        collisionBoundary,
        ownerDocument,
        ownerWindow,
        positionStrategy: "fixed" as const,
      }),
    });
  }, [coordinateRoot, coordinateSpace, overlayBoundary]);

  useEffect(() => {
    if (!import.meta.env.DEV || resolution.status === "ready") return;
    if (resolution.status === "pending" && resolution.reason === "root") return;
    const reason = resolution.status === "unscoped" ? "unscoped" : resolution.reason;
    console.error(`Scaffold drag environment is unavailable: ${reason}.`);
  }, [resolution]);

  return (
    <InteractionDragEnvironmentContext value={resolution}>
      {children}
    </InteractionDragEnvironmentContext>
  );
}

export function useInteractionDragEnvironmentResolution(): InteractionDragEnvironmentResolution {
  return useContext(InteractionDragEnvironmentContext);
}

export function useReadyInteractionDragEnvironment(): ReadyInteractionDragEnvironment | null {
  const resolution = useInteractionDragEnvironmentResolution();

  useEffect(() => {
    if (import.meta.env.DEV && resolution.status === "unscoped") {
      console.error("Scaffold drag interaction requires an InteractionDragEnvironmentProvider.");
    }
  }, [resolution]);

  return resolution.status === "ready" ? resolution.environment : null;
}

function isHTMLElementInWindow(value: Element | null, ownerWindow: Window): value is HTMLElement {
  const OwnerHTMLElement = (ownerWindow as Window & typeof globalThis).HTMLElement;
  return value !== null && value instanceof OwnerHTMLElement;
}

function coordinateSpaceMatchesRoot(
  coordinateSpace: InteractionCoordinateSpace,
  coordinateRoot: HTMLElement,
): boolean {
  const domSpace = coordinateSpace as InteractionCoordinateSpace & {
    readonly ownerDocument?: Document;
    getRoot?: () => HTMLElement | null;
  };
  return (
    (domSpace.ownerDocument === undefined ||
      domSpace.ownerDocument === coordinateRoot.ownerDocument) &&
    (domSpace.getRoot === undefined || domSpace.getRoot() === coordinateRoot)
  );
}
