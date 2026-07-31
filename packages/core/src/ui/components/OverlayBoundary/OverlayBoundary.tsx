import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";

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
  hostClassName?: string;
  hostColorScheme?: "light" | "dark";
  hostCssVariables?: Readonly<Record<string, string>>;
  kind: OverlayBoundaryKind;
  children: ReactNode;
}

function strategyForKind(kind: OverlayBoundaryKind): OverlayPositionStrategy {
  return kind === "viewport" ? "fixed" : "absolute";
}

export function OverlayBoundary({
  container,
  collisionBoundary,
  hostClassName,
  hostColorScheme,
  hostCssVariables,
  kind,
  children,
}: OverlayBoundaryProps) {
  const [ownedHost, setOwnedHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (container === null || !container.isConnected) {
      setOwnedHost(null);
      return;
    }

    const { ownerDocument } = container;
    if (ownerDocument.defaultView === null) {
      setOwnedHost(null);
      return;
    }

    const host = ownerDocument.createElement("div");
    host.className = "sc-overlay-boundary-host";
    host.dataset.scaffoldOverlayHost = "";
    host.dataset.kind = kind;
    host.style.inset = "0";
    host.style.overflow = "clip";
    host.style.pointerEvents = "none";
    host.style.position = strategyForKind(kind);
    if (kind === "viewport") host.style.zIndex = String(zIndex.overlayHost);
    container.append(host);
    setOwnedHost(host);

    return () => {
      host.remove();
    };
  }, [container, kind]);

  useLayoutEffect(() => {
    if (ownedHost === null) return;

    if (hostClassName) ownedHost.classList.add(hostClassName);
    if (hostColorScheme) ownedHost.style.colorScheme = hostColorScheme;
    for (const [property, value] of Object.entries(hostCssVariables ?? {})) {
      ownedHost.style.setProperty(property, value);
    }

    return () => {
      if (hostClassName) ownedHost.classList.remove(hostClassName);
      if (hostColorScheme) ownedHost.style.removeProperty("color-scheme");
      for (const property of Object.keys(hostCssVariables ?? {})) {
        ownedHost.style.removeProperty(property);
      }
    };
  }, [hostClassName, hostColorScheme, hostCssVariables, ownedHost]);

  const resolution = useMemo<OverlayBoundaryResolution>(() => {
    if (
      container === null ||
      ownedHost === null ||
      ownedHost.parentElement !== container ||
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
    <OverlayBoundaryResolutionProvider resolution={resolution}>
      {children}
    </OverlayBoundaryResolutionProvider>
  );
}
