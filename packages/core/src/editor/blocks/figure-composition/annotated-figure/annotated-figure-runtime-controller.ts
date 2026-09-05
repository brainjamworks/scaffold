import { useSyncExternalStore } from "react";

export type AnnotatedFigureOpenOrigin =
  | "learner"
  | "semantic-activation"
  | "control-command"
  | "reconciliation";

export interface AnnotatedFigureOpenChange {
  readonly previousAnnotationId: string | null;
  readonly annotationId: string | null;
  readonly origin: AnnotatedFigureOpenOrigin;
}

type OpenChangeListener = (change: AnnotatedFigureOpenChange) => void;
type StateListener = () => void;

export interface AnnotatedFigureRuntimeController {
  readonly cancelPendingLearnerClose: () => void;
  readonly getOpenAnnotationId: () => string | null;
  readonly hasLearnerOpenedAnnotation: (annotationId: string) => boolean;
  readonly requestLearnerClose: (annotationId: string) => void;
  readonly setOpenAnnotationId: (
    annotationId: string | null,
    origin: AnnotatedFigureOpenOrigin,
  ) => void;
  readonly subscribe: (listener: StateListener) => () => void;
  readonly subscribeToChanges: (listener: OpenChangeListener) => () => void;
}

export function createAnnotatedFigureRuntimeController(): AnnotatedFigureRuntimeController {
  let openAnnotationId: string | null = null;
  const learnerOpenedAnnotationIds = new Set<string>();
  let pendingLearnerClose: ReturnType<typeof setTimeout> | null = null;
  const stateListeners = new Set<StateListener>();
  const changeListeners = new Set<OpenChangeListener>();
  const cancelPendingLearnerClose = () => {
    if (pendingLearnerClose === null) return;
    clearTimeout(pendingLearnerClose);
    pendingLearnerClose = null;
  };
  const setOpenAnnotationId: AnnotatedFigureRuntimeController["setOpenAnnotationId"] = (
    annotationId,
    origin,
  ) => {
    cancelPendingLearnerClose();
    if (annotationId === openAnnotationId) return;
    const previousAnnotationId = openAnnotationId;
    openAnnotationId = annotationId;
    if (origin === "learner" && annotationId !== null) {
      learnerOpenedAnnotationIds.add(annotationId);
    }
    for (const listener of [...stateListeners]) listener();
    const change = Object.freeze({ previousAnnotationId, annotationId, origin });
    for (const listener of [...changeListeners]) listener(change);
  };

  return Object.freeze({
    cancelPendingLearnerClose,
    getOpenAnnotationId: () => openAnnotationId,
    hasLearnerOpenedAnnotation: (annotationId: string) =>
      learnerOpenedAnnotationIds.has(annotationId),
    requestLearnerClose(annotationId: string) {
      if (pendingLearnerClose !== null) clearTimeout(pendingLearnerClose);
      pendingLearnerClose = setTimeout(() => {
        pendingLearnerClose = null;
        if (openAnnotationId === annotationId) {
          setOpenAnnotationId(null, "learner");
        }
      }, 0);
    },
    setOpenAnnotationId,
    subscribe(listener: StateListener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    subscribeToChanges(listener: OpenChangeListener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  });
}

export function useAnnotatedFigureOpenAnnotationId(
  controller: AnnotatedFigureRuntimeController,
): string | null {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getOpenAnnotationId,
    controller.getOpenAnnotationId,
  );
}
