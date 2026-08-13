import { useLayoutEffect, type ReactNode } from "react";

import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import { registerOverlayHostOwner } from "@/editor/interactions/dom/overlay-ownership";
import { useOverlayBoundary, type OverlayBoundaryKind } from "@/ui/overlays/portal-host-context";

export interface AuthoringOverlayBoundaryProps {
  children: ReactNode;
  collisionBoundary?: Element | null;
  container?: Element | null;
  kind?: OverlayBoundaryKind;
  ownerRoot: Element | null;
}

export function AuthoringOverlayOwnership({
  children,
  ownerRoot,
}: Pick<AuthoringOverlayBoundaryProps, "children" | "ownerRoot">) {
  const resolution = useOverlayBoundary();

  useLayoutEffect(() => {
    if (ownerRoot === null || resolution.status !== "ready") return;
    return registerOverlayHostOwner(ownerRoot, resolution.environment.host);
  }, [ownerRoot, resolution]);

  return children;
}

export function AuthoringOverlayBoundary({
  children,
  collisionBoundary,
  container,
  kind = "contained",
  ownerRoot,
}: AuthoringOverlayBoundaryProps) {
  const physicalContainer =
    ownerRoot === null ? null : container === undefined ? ownerRoot : container;
  const resolvedCollisionBoundary = collisionBoundary === undefined ? ownerRoot : collisionBoundary;

  return (
    <OverlayBoundary
      collisionBoundary={resolvedCollisionBoundary}
      container={physicalContainer}
      kind={kind}
    >
      <AuthoringOverlayOwnership ownerRoot={ownerRoot}>{children}</AuthoringOverlayOwnership>
    </OverlayBoundary>
  );
}
