import { useLayoutEffect, type ReactNode } from "react";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { registerOverlayHostOwner } from "@/editor/interactions/dom/overlay-ownership";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

export interface AuthoringOverlayBoundaryProps {
  children: ReactNode;
  container?: Element | null;
  ownerRoot: Element | null;
}

function AuthoringOverlayHostRegistration({ children, ownerRoot }: AuthoringOverlayBoundaryProps) {
  const resolution = useOverlayBoundary();

  useLayoutEffect(() => {
    if (ownerRoot === null || resolution.status !== "ready") return;
    return registerOverlayHostOwner(ownerRoot, resolution.environment.host);
  }, [ownerRoot, resolution]);

  return children;
}

export function AuthoringOverlayBoundary({
  children,
  container,
  ownerRoot,
}: AuthoringOverlayBoundaryProps) {
  const physicalContainer =
    ownerRoot === null ? null : container === undefined ? ownerRoot : container;

  return (
    <OverlayBoundary collisionBoundary={ownerRoot} container={physicalContainer} kind="contained">
      <AuthoringOverlayHostRegistration ownerRoot={ownerRoot}>
        {children}
      </AuthoringOverlayHostRegistration>
    </OverlayBoundary>
  );
}
