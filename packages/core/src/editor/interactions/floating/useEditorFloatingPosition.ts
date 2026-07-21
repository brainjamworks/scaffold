import {
  autoUpdate,
  computePosition,
  offset as floatingOffset,
  type Middleware,
  type OffsetOptions,
  type Placement,
  type Strategy,
} from "@floating-ui/dom";
import { useLayoutEffect, useMemo, type CSSProperties } from "react";

import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

import {
  resolveFloatingAnchorReference,
  resolveFloatingAnchorSnapshot,
  type FloatingAnchor,
} from "./floating-anchor";

export interface EditorFloatingPosition {
  hidden: boolean;
  placement: Placement;
  strategy: Strategy;
  style: CSSProperties;
  x: number;
  y: number;
}

export interface UseEditorFloatingPositionInput {
  anchor: FloatingAnchor | null;
  floatingElement: HTMLElement | null;
  offset?: OffsetOptions;
  open: boolean;
  placement?: Placement;
  strategy?: Strategy;
}

export function useEditorFloatingPosition({
  anchor,
  floatingElement,
  offset,
  open,
  placement = "bottom",
  strategy = "absolute",
}: UseEditorFloatingPositionInput): void {
  const boundaryResolution = useOverlayBoundary();
  const boundaryEnvironment =
    boundaryResolution.status === "ready" ? boundaryResolution.environment : null;
  const placementStrategy = boundaryEnvironment?.strategy ?? strategy;
  const middleware = useMemo((): Middleware[] => [floatingOffset(offset ?? 0)], [offset]);

  useLayoutEffect(() => {
    if (!floatingElement) return;

    if (!open || boundaryResolution.status === "pending") {
      hideEditorFloatingElement(floatingElement, placementStrategy);
      return;
    }

    const reference = resolveFloatingAnchorReference(anchor);
    if (!reference) {
      hideEditorFloatingElement(floatingElement, placementStrategy);
      return;
    }

    let cancelled = false;
    let updateId = 0;
    hideEditorFloatingElement(floatingElement, placementStrategy);

    const updatePosition = () => {
      updateId += 1;
      const currentUpdateId = updateId;
      const snapshot = resolveFloatingAnchorSnapshot(anchor);
      if (!snapshot) {
        hideEditorFloatingElement(floatingElement, placementStrategy);
        return;
      }

      void computePosition(snapshot.reference, floatingElement, {
        middleware,
        placement,
        strategy: placementStrategy,
      }).then((nextPosition) => {
        if (cancelled || currentUpdateId !== updateId) return;
        applyEditorFloatingPositionStyle(
          floatingElement,
          editorFloatingPositionFromResult(nextPosition),
        );
      });
    };

    const cleanupAutoUpdate = autoUpdate(reference, floatingElement, updatePosition);

    return () => {
      cancelled = true;
      cleanupAutoUpdate();
    };
  }, [
    anchor,
    boundaryEnvironment?.host,
    boundaryResolution.status,
    floatingElement,
    middleware,
    open,
    placement,
    placementStrategy,
  ]);
}

function editorFloatingPositionFromResult(input: {
  placement: Placement;
  strategy: Strategy;
  x: number;
  y: number;
}): EditorFloatingPosition {
  return {
    hidden: false,
    placement: input.placement,
    strategy: input.strategy,
    style: {
      left: input.x,
      position: input.strategy,
      top: input.y,
    },
    x: input.x,
    y: input.y,
  };
}

function applyEditorFloatingPositionStyle(
  floatingElement: HTMLElement,
  position: EditorFloatingPosition,
): void {
  floatingElement.style.position = position.strategy;
  floatingElement.style.left = `${position.x}px`;
  floatingElement.style.top = `${position.y}px`;
  setEditorFloatingElementState(floatingElement, true, position.hidden);
}

function hideEditorFloatingElement(floatingElement: HTMLElement, strategy: Strategy): void {
  floatingElement.style.position = strategy;
  floatingElement.style.left = "0px";
  floatingElement.style.top = "0px";
  setEditorFloatingElementState(floatingElement, false, true);
}

function setEditorFloatingElementState(
  floatingElement: HTMLElement,
  placed: boolean,
  hidden: boolean,
): void {
  floatingElement.dataset.scaffoldOverlayPlaced = String(placed);
  floatingElement.dataset.scaffoldOverlayHidden = String(hidden);
  floatingElement.style.pointerEvents = hidden ? "none" : "auto";
  floatingElement.style.visibility = hidden ? "hidden" : "visible";
}
