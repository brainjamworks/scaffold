import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  AuthorPreviewSessionController,
  type AuthorPreviewSnapshot,
  type CreateAuthorPreviewSessionControllerInput,
} from "./author-preview-session-controller";
import type { AuthoringDocumentBinding } from "./use-authoring-document";

export type AuthorPreviewBinding =
  | { readonly status: "initializing" }
  | {
      readonly status: "ready";
      readonly session: AuthorPreviewSessionController;
      readonly snapshot: AuthorPreviewSnapshot;
    };

export interface UseAuthorPreviewInput {
  readonly document: Pick<AuthoringDocumentBinding, "getSnapshot" | "subscribe">;
  readonly prepare: CreateAuthorPreviewSessionControllerInput["prepare"];
}

interface PreviewOwnerState {
  readonly document: UseAuthorPreviewInput["document"];
  readonly session: AuthorPreviewSessionController;
}

const NO_SNAPSHOT = null;
const subscribeToInitializingOwner = () => () => undefined;
const getInitializingSnapshot = () => NO_SNAPSHOT;

export function useAuthorPreview({
  document,
  prepare,
}: UseAuthorPreviewInput): AuthorPreviewBinding {
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const [ownerState, setOwnerState] = useState<PreviewOwnerState | null>(null);
  const session = ownerState?.document === document ? ownerState.session : null;

  useEffect(() => {
    const nextSession = new AuthorPreviewSessionController({
      prepare: (input, retainedServices) => prepareRef.current(input, retainedServices),
    });
    const unsubscribeDocument = document.subscribe(() => {
      nextSession.observeDocument(document.getSnapshot());
    });
    nextSession.observeDocument(document.getSnapshot());
    setOwnerState({ document, session: nextSession });
    return () => {
      unsubscribeDocument();
      nextSession.dispose();
    };
  }, [document]);

  const subscribe = useCallback(
    (listener: () => void) => session?.subscribe(listener) ?? subscribeToInitializingOwner(),
    [session],
  );
  const getSnapshot = useCallback(
    () => session?.getSnapshot() ?? getInitializingSnapshot(),
    [session],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return session && snapshot ? { status: "ready", session, snapshot } : { status: "initializing" };
}
