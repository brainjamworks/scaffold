import type { SizeOptions } from "@floating-ui/dom";
import { useMemo } from "react";

import {
  useOverlayBoundary,
  type OverlayPositionStrategy,
} from "@/ui/overlays/portal-host-context";

export interface AuthoringOverlayEnvironment {
  appendTo: HTMLElement;
  collisionBoundary: Element | null;
  size: SizeOptions;
  strategy: OverlayPositionStrategy;
}

interface AuthoringOverlaySizeVariablesInput {
  availableHeight: number;
  availableWidth: number;
  floating: HTMLElement;
  referenceHeight: number;
  referenceWidth: number;
}

export function applyAuthoringOverlaySizeVariables({
  availableHeight,
  availableWidth,
  floating,
  referenceHeight,
  referenceWidth,
}: AuthoringOverlaySizeVariablesInput): void {
  floating.style.setProperty("--sc-overlay-available-inline-size", `${availableWidth}px`);
  floating.style.setProperty("--sc-overlay-available-block-size", `${availableHeight}px`);
  floating.style.setProperty("--sc-overlay-anchor-inline-size", `${referenceWidth}px`);
  floating.style.setProperty("--sc-overlay-anchor-block-size", `${referenceHeight}px`);
}

const authoringOverlaySize: SizeOptions = {
  apply: ({ availableHeight, availableWidth, elements, rects }) => {
    applyAuthoringOverlaySizeVariables({
      availableHeight,
      availableWidth,
      floating: elements.floating,
      referenceHeight: rects.reference.height,
      referenceWidth: rects.reference.width,
    });
  },
};

export function authoringOverlayMiddlewareOptions(environment: AuthoringOverlayEnvironment) {
  const { collisionBoundary, size } = environment;
  if (collisionBoundary === null) {
    return {
      flip: true as const,
      shift: { padding: 8 },
      size,
    };
  }

  return {
    flip: { boundary: collisionBoundary },
    shift: { boundary: collisionBoundary, padding: 8 },
    size: { ...size, boundary: collisionBoundary, padding: 8 },
  };
}

export function useAuthoringOverlayEnvironment(
  resolveDirectHost: () => HTMLElement | null,
): AuthoringOverlayEnvironment | null {
  const resolution = useOverlayBoundary();

  return useMemo(() => {
    if (resolution.status === "pending") return null;
    if (resolution.status === "ready") {
      return {
        appendTo: resolution.environment.host,
        collisionBoundary: resolution.environment.collisionBoundary,
        size: authoringOverlaySize,
        strategy: resolution.environment.strategy,
      };
    }

    const directHost = resolveDirectHost();
    if (directHost === null) return null;
    return {
      appendTo: directHost,
      collisionBoundary: null,
      size: authoringOverlaySize,
      strategy: "absolute",
    };
  }, [resolution, resolveDirectHost]);
}
