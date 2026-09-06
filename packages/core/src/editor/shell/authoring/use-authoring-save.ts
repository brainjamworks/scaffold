import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { ArtifactPersistencePort } from "@/host/ports";

import {
  createAuthoringSaveController,
  type AuthoringSaveController,
  type AuthoringSaveSnapshot,
} from "./authoring-save-controller";
import type { AuthoringDocumentBinding } from "./use-authoring-document";

export type AuthoringSaveBinding =
  | { readonly status: "initializing" }
  | {
      readonly status: "ready";
      readonly controller: AuthoringSaveController;
      readonly snapshot: AuthoringSaveSnapshot;
    };

export interface UseAuthoringSaveInput {
  readonly document: AuthoringDocumentBinding;
  readonly persistence: ArtifactPersistencePort;
}

interface SaveOwnerState extends UseAuthoringSaveInput {
  readonly controller: AuthoringSaveController;
}

const NO_SNAPSHOT = null;
const subscribeToInitializingOwner = () => () => undefined;
const getInitializingSnapshot = () => NO_SNAPSHOT;

export function useAuthoringSave({
  document,
  persistence,
}: UseAuthoringSaveInput): AuthoringSaveBinding {
  const [ownerState, setOwnerState] = useState<SaveOwnerState | null>(null);
  const controller =
    ownerState?.document === document && ownerState.persistence === persistence
      ? ownerState.controller
      : null;

  useEffect(() => {
    const nextController = createAuthoringSaveController(
      document.getSnapshot(),
      persistence,
      ({ localRevision, title }) => document.acknowledgeSavedTitle(localRevision, title),
    );
    const unsubscribeDocument = document.subscribe(() => {
      nextController.observeDocument(document.getSnapshot());
    });
    setOwnerState({ document, persistence, controller: nextController });
    return () => {
      unsubscribeDocument();
      nextController.dispose();
    };
  }, [document, persistence]);

  const subscribe = useCallback(
    (listener: () => void) => controller?.subscribe(listener) ?? subscribeToInitializingOwner(),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.getSnapshot() ?? getInitializingSnapshot(),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return controller && snapshot
    ? { status: "ready", controller, snapshot }
    : { status: "initializing" };
}
