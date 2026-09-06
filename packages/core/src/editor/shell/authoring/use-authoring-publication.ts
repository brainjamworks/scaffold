import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { ArtifactRevision, LearnerPublicationPort } from "@/host/ports";

import {
  createAuthoringPublicationController,
  type AuthoringPublicationController,
  type AuthoringPublicationDocument,
  type AuthoringPublicationSaving,
  type AuthoringPublicationSnapshot,
  type CreateAuthoringPublicationControllerInput,
} from "./authoring-publication-controller";

export type AuthoringPublicationBinding =
  | { readonly status: "initializing" }
  | {
      readonly status: "ready";
      readonly controller: AuthoringPublicationController;
      readonly snapshot: AuthoringPublicationSnapshot;
    };

export interface UseAuthoringPublicationInput {
  readonly document: AuthoringPublicationDocument;
  readonly saving: AuthoringPublicationSaving | null;
  readonly publication: LearnerPublicationPort;
  readonly initialSavedArtifactRevision: ArtifactRevision | null;
  readonly prepareLearnerContent: CreateAuthoringPublicationControllerInput["prepareLearnerContent"];
  readonly buildCompilationSnapshot: CreateAuthoringPublicationControllerInput["buildCompilationSnapshot"];
}

interface PublicationOwnerState extends Omit<UseAuthoringPublicationInput, "saving"> {
  readonly saving: AuthoringPublicationSaving;
  readonly controller: AuthoringPublicationController;
}

const NO_SNAPSHOT = null;
const subscribeToInitializingOwner = () => () => undefined;
const getInitializingSnapshot = () => NO_SNAPSHOT;

export function useAuthoringPublication({
  buildCompilationSnapshot,
  document,
  initialSavedArtifactRevision,
  prepareLearnerContent,
  publication,
  saving,
}: UseAuthoringPublicationInput): AuthoringPublicationBinding {
  const [ownerState, setOwnerState] = useState<PublicationOwnerState | null>(null);
  const controller =
    saving &&
    ownerState?.document === document &&
    ownerState.saving === saving &&
    ownerState.publication === publication &&
    ownerState.initialSavedArtifactRevision === initialSavedArtifactRevision &&
    ownerState.prepareLearnerContent === prepareLearnerContent &&
    ownerState.buildCompilationSnapshot === buildCompilationSnapshot
      ? ownerState.controller
      : null;

  useEffect(() => {
    if (!saving) return;
    const nextController = createAuthoringPublicationController({
      document,
      saving,
      publication,
      initialSavedArtifactRevision,
      prepareLearnerContent,
      buildCompilationSnapshot,
    });
    setOwnerState({
      document,
      saving,
      publication,
      initialSavedArtifactRevision,
      prepareLearnerContent,
      buildCompilationSnapshot,
      controller: nextController,
    });
    void nextController.loadStatus();
    return () => nextController.dispose();
  }, [
    buildCompilationSnapshot,
    document,
    initialSavedArtifactRevision,
    prepareLearnerContent,
    publication,
    saving,
  ]);

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
