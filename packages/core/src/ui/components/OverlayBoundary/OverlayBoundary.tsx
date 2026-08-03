import {
  Fragment,
  useMemo,
  useState,
  type ComponentType,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { zIndex } from "@/ui/overlays/z-index";

import {
  OverlayBoundaryResolutionProvider,
  pendingOverlayBoundaryResolution,
  type OverlayBoundaryEnvironment,
  type OverlayBoundaryKind,
  type OverlayBoundaryResolution,
  type OverlayPositionStrategy,
} from "@/ui/overlays/portal-host-context";

import "./OverlayBoundary.css";

export interface OverlayBoundaryProps {
  container: Element | null;
  collisionBoundary?: Element | null;
  hostBoundary?: ComponentType<PropsWithChildren>;
  kind: OverlayBoundaryKind;
  children: ReactNode;
}

function strategyForKind(kind: OverlayBoundaryKind): OverlayPositionStrategy {
  return kind === "viewport" ? "fixed" : "absolute";
}

export function OverlayBoundary({
  container,
  collisionBoundary,
  hostBoundary: HostBoundary = Fragment,
  kind,
  children,
}: OverlayBoundaryProps) {
  const [ownedHost, setOwnedHost] = useState<HTMLElement | null>(null);

  const resolution = useMemo<OverlayBoundaryResolution>(() => {
    if (
      container === null ||
      ownedHost === null ||
      !container.contains(ownedHost) ||
      !ownedHost.isConnected
    ) {
      return pendingOverlayBoundaryResolution;
    }

    const { ownerDocument } = container;
    const ownerWindow = ownerDocument.defaultView;
    if (ownerWindow === null) return pendingOverlayBoundaryResolution;

    const environment: OverlayBoundaryEnvironment = {
      host: ownedHost,
      collisionBoundary:
        collisionBoundary === undefined
          ? kind === "contained"
            ? container
            : null
          : collisionBoundary,
      kind,
      ownerDocument,
      ownerWindow,
      strategy: strategyForKind(kind),
    };

    return { status: "ready", environment };
  }, [collisionBoundary, container, kind, ownedHost]);

  return (
    <>
      <OverlayBoundaryResolutionProvider resolution={resolution}>
        {children}
      </OverlayBoundaryResolutionProvider>
      {container !== null && container.isConnected && container.ownerDocument.defaultView !== null
        ? createPortal(
            <HostBoundary>
              <div
                ref={setOwnedHost}
                className="sc-overlay-boundary-host"
                data-scaffold-overlay-host=""
                data-kind={kind}
                style={{
                  inset: 0,
                  overflow: "clip",
                  pointerEvents: "none",
                  position: strategyForKind(kind),
                  ...(kind === "viewport" ? { zIndex: zIndex.overlayHost } : {}),
                }}
              />
            </HostBoundary>,
            container,
          )
        : null}
    </>
  );
}
