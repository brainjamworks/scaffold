import { useSyncExternalStore } from "react";

export type GallerySelectionOrigin =
  | "learner"
  | "semantic-activation"
  | "control-command"
  | "reconciliation"
  | "lightbox";

export interface GallerySelectionChange {
  readonly previousActiveId: string | null;
  readonly activeId: string | null;
  readonly origin: GallerySelectionOrigin;
}

type SelectionChangeListener = (change: GallerySelectionChange) => void;
type StateListener = () => void;

export interface GalleryRuntimeController {
  readonly getActiveId: () => string | null;
  readonly setActiveId: (activeId: string | null, origin: GallerySelectionOrigin) => void;
  readonly subscribe: (listener: StateListener) => () => void;
  readonly subscribeToChanges: (listener: SelectionChangeListener) => () => void;
}

export function createGalleryRuntimeController(
  initialActiveId: string | null,
): GalleryRuntimeController {
  let activeId = initialActiveId;
  const stateListeners = new Set<StateListener>();
  const changeListeners = new Set<SelectionChangeListener>();
  const setActiveId: GalleryRuntimeController["setActiveId"] = (nextActiveId, origin) => {
    if (nextActiveId === activeId) return;
    const previousActiveId = activeId;
    activeId = nextActiveId;
    for (const listener of [...stateListeners]) listener();
    const change = Object.freeze({ previousActiveId, activeId, origin });
    for (const listener of [...changeListeners]) listener(change);
  };
  const subscribe: GalleryRuntimeController["subscribe"] = (listener) => {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  };
  const subscribeToChanges: GalleryRuntimeController["subscribeToChanges"] = (listener) => {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  };

  return Object.freeze({
    getActiveId: () => activeId,
    setActiveId,
    subscribe,
    subscribeToChanges,
  });
}

export function useGalleryActiveId(controller: GalleryRuntimeController): string | null {
  return useSyncExternalStore(controller.subscribe, controller.getActiveId, controller.getActiveId);
}
