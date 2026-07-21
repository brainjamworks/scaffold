import {
  autoUpdate,
  computePosition,
  flip,
  hide,
  offset as floatingOffset,
  shift,
  size,
  type Middleware,
  type OffsetOptions,
  type Placement,
  type Strategy,
  type VirtualElement,
} from "@floating-ui/dom";

import { applyAuthoringOverlaySizeVariables } from "./useAuthoringOverlayEnvironment";

export interface OverlayFloatingPositionerEnvironment {
  collisionBoundary: Element | null;
  container: HTMLElement;
  ownerDocument: Document;
  strategy: Strategy;
}

export interface OverlayFloatingReference {
  contextElement: Element;
  getBoundingClientRect: () => DOMRectReadOnly | null;
}

export interface OverlayFloatingPlacementInput {
  environment: OverlayFloatingPositionerEnvironment | null;
  reference: OverlayFloatingReference | null;
}

export interface OverlayFloatingPositioner {
  destroy: () => void;
  start: (input: OverlayFloatingPlacementInput) => void;
  update: (input: OverlayFloatingPlacementInput) => void;
}

export interface CreateOverlayFloatingPositionerInput {
  floatingElement: HTMLElement;
  offset?: OffsetOptions;
  placement?: Placement;
}

export function createOverlayFloatingPositioner({
  floatingElement,
  offset,
  placement = "bottom-start",
}: CreateOverlayFloatingPositionerInput): OverlayFloatingPositioner {
  let active = false;
  let destroyed = false;
  let currentInput: OverlayFloatingPlacementInput = { environment: null, reference: null };
  let cleanupAutoUpdate: (() => void) | null = null;
  let sessionEnvironment: OverlayFloatingPositionerEnvironment | null = null;
  let sessionContextElement: Element | null = null;
  let updateId = 0;

  const floatingReference: VirtualElement = {
    get contextElement() {
      return currentInput.reference?.contextElement ?? floatingElement;
    },
    getBoundingClientRect: () => currentInput.reference?.getBoundingClientRect() ?? new DOMRect(),
  };

  const stopPlacement = () => {
    updateId += 1;
    cleanupAutoUpdate?.();
    cleanupAutoUpdate = null;
    sessionEnvironment = null;
    sessionContextElement = null;
  };

  const hideFloatingElement = (strategy: Strategy) => {
    floatingElement.dataset.scaffoldOverlayPlaced = "false";
    floatingElement.dataset.scaffoldOverlayHidden = "true";
    floatingElement.style.left = "0px";
    floatingElement.style.pointerEvents = "none";
    floatingElement.style.position = strategy;
    floatingElement.style.top = "0px";
    floatingElement.style.visibility = "hidden";
  };

  const updatePosition = () => {
    const { environment, reference } = currentInput;
    if (environment === null || reference === null) return;

    updateId += 1;
    const currentUpdateId = updateId;
    const referenceRect = reference.getBoundingClientRect();
    if (referenceRect === null) {
      hideFloatingElement(environment.strategy);
      return;
    }

    void computePosition(floatingReference, floatingElement, {
      middleware: createOverlayFloatingMiddleware(environment.collisionBoundary, offset),
      placement,
      strategy: environment.strategy,
    }).then((position) => {
      if (destroyed || currentUpdateId !== updateId) return;

      const hidden = position.middlewareData.hide?.referenceHidden === true;
      floatingElement.dataset.scaffoldOverlayPlaced = "true";
      floatingElement.dataset.scaffoldOverlayHidden = String(hidden);
      floatingElement.style.left = `${position.x}px`;
      floatingElement.style.pointerEvents = hidden ? "none" : "auto";
      floatingElement.style.position = position.strategy;
      floatingElement.style.top = `${position.y}px`;
      floatingElement.style.visibility = hidden ? "hidden" : "visible";
    });
  };

  const reconcilePlacement = () => {
    if (!active || destroyed) return;

    const { environment, reference } = currentInput;
    if (
      environment === null ||
      reference === null ||
      !environment.container.isConnected ||
      environment.container.ownerDocument !== environment.ownerDocument ||
      reference.contextElement.ownerDocument !== environment.ownerDocument
    ) {
      stopPlacement();
      floatingElement.remove();
      hideFloatingElement(environment?.strategy ?? "absolute");
      return;
    }

    const sessionChanged =
      cleanupAutoUpdate === null ||
      sessionEnvironment?.container !== environment.container ||
      sessionEnvironment.collisionBoundary !== environment.collisionBoundary ||
      sessionEnvironment.ownerDocument !== environment.ownerDocument ||
      sessionEnvironment.strategy !== environment.strategy ||
      sessionContextElement !== reference.contextElement;

    if (!sessionChanged) {
      updatePosition();
      return;
    }

    stopPlacement();
    hideFloatingElement(environment.strategy);
    if (floatingElement.parentElement !== environment.container) {
      environment.container.append(floatingElement);
    }
    sessionEnvironment = environment;
    sessionContextElement = reference.contextElement;
    cleanupAutoUpdate = autoUpdate(floatingReference, floatingElement, updatePosition);
  };

  hideFloatingElement("absolute");

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      active = false;
      stopPlacement();
      floatingElement.remove();
      hideFloatingElement(currentInput.environment?.strategy ?? "absolute");
      currentInput = { environment: null, reference: null };
    },
    start: (input) => {
      if (destroyed) return;
      active = true;
      currentInput = input;
      reconcilePlacement();
    },
    update: (input) => {
      if (!active || destroyed) return;
      currentInput = input;
      reconcilePlacement();
    },
  };
}

function createOverlayFloatingMiddleware(
  collisionBoundary: Element | null,
  offset: OffsetOptions | undefined,
): Middleware[] {
  const overflowOptions =
    collisionBoundary === null ? { padding: 8 } : { boundary: collisionBoundary, padding: 8 };

  return [
    floatingOffset(offset ?? 0),
    flip(overflowOptions),
    shift(overflowOptions),
    size({
      ...overflowOptions,
      apply: ({ availableHeight, availableWidth, elements, rects }) => {
        applyAuthoringOverlaySizeVariables({
          availableHeight,
          availableWidth,
          floating: elements.floating,
          referenceHeight: rects.reference.height,
          referenceWidth: rects.reference.width,
        });
      },
    }),
    hide({ ...overflowOptions, strategy: "referenceHidden" }),
  ];
}
