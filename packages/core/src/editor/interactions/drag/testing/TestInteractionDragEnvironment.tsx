import { useMemo, type ReactNode } from "react";

import {
  createScaledCanvasCoordinateSpace,
  createViewportCoordinateSpace,
} from "../dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "../react/interaction-drag-environment";
import {
  OverlayBoundaryResolutionProvider,
  type OverlayBoundaryResolution,
} from "@/ui/overlays/portal-host-context";

interface TestInteractionDragEnvironmentBaseProps {
  readonly children: ReactNode;
  readonly collisionBoundary: HTMLElement;
  readonly overlayHost: HTMLElement;
  readonly root: HTMLElement;
}

type TestInteractionDragEnvironmentProps = TestInteractionDragEnvironmentBaseProps &
  (
    | Readonly<{ coordinateKind: "viewport"; localSize?: never }>
    | Readonly<{
        coordinateKind: "scaled-canvas";
        localSize: Readonly<{ width: number; height: number }>;
      }>
  );

export function TestInteractionDragEnvironment({
  children,
  collisionBoundary,
  coordinateKind,
  overlayHost,
  root,
  ...props
}: TestInteractionDragEnvironmentProps) {
  const coordinateSpace = useMemo(
    () =>
      coordinateKind === "viewport"
        ? createViewportCoordinateSpace({
            getRoot: () => root,
            ownerDocument: root.ownerDocument,
          })
        : createScaledCanvasCoordinateSpace({
            getRoot: () => root,
            ownerDocument: root.ownerDocument,
            localSize: props.localSize,
          }),
    [coordinateKind, props.localSize, root],
  );
  const overlayResolution = useMemo<OverlayBoundaryResolution>(() => {
    const ownerDocument = overlayHost.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) return { status: "pending" };
    return {
      status: "ready",
      environment: {
        collisionBoundary,
        host: overlayHost,
        kind: "viewport",
        ownerDocument,
        ownerWindow,
        strategy: "fixed",
      },
    };
  }, [collisionBoundary, overlayHost]);

  return (
    <OverlayBoundaryResolutionProvider resolution={overlayResolution}>
      <InteractionDragEnvironmentProvider
        coordinateRoot={root}
        coordinateSpace={coordinateSpace}
      >
        {children}
      </InteractionDragEnvironmentProvider>
    </OverlayBoundaryResolutionProvider>
  );
}
