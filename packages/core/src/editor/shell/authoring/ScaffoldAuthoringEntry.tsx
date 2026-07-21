import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
} from "@/host/contracts";

import {
  DocumentCreationGate,
  type DocumentCreationMode,
  type DocumentCreationState,
} from "./DocumentCreationGate";
import type { ScaffoldAuthoringAppProps } from "./ScaffoldAuthoringApp";

type ReadyAuthoringCapability = typeof import("./ScaffoldAuthoringApp");
type ArtifactCreationCapability = typeof import("./createAndPersistAuthoringArtifact");

let readyAuthoringCapabilityPromise: Promise<ReadyAuthoringCapability> | null = null;
let artifactCreationCapabilityPromise: Promise<ArtifactCreationCapability> | null = null;

function loadReadyAuthoringCapability(): Promise<ReadyAuthoringCapability> {
  readyAuthoringCapabilityPromise ??= import("./ScaffoldAuthoringApp");
  return readyAuthoringCapabilityPromise;
}

function loadArtifactCreationCapability(): Promise<ArtifactCreationCapability> {
  artifactCreationCapabilityPromise ??= import("./createAndPersistAuthoringArtifact");
  return artifactCreationCapabilityPromise;
}

type FailedCapability = "ready_authoring" | "artifact_creation";

class CapabilityLoadError extends Error {
  constructor(readonly capability: FailedCapability) {
    super(`Scaffold ${capability} capability could not be loaded.`);
  }
}

export interface ScaffoldAuthoringEntryProps extends Omit<
  ScaffoldAuthoringAppProps,
  "artifact" | "services"
> {
  artifact: ScaffoldAuthoringArtifact | null;
  services: ScaffoldAuthoringEntryHostServices;
}

export function ScaffoldAuthoringEntry({
  artifact,
  services,
  ...appProps
}: ScaffoldAuthoringEntryProps) {
  const [createdArtifactState, setCreatedArtifactState] = useState<{
    source: ScaffoldAuthoringArtifact | null;
    artifact: ScaffoldAuthoringArtifact;
  } | null>(null);
  const [creationState, setCreationState] = useState<DocumentCreationState>("idle");
  const [readyCapability, setReadyCapability] = useState<ReadyAuthoringCapability | null>(null);
  const [failedCapability, setFailedCapability] = useState<FailedCapability | null>(null);
  const creationPendingRef = useRef(false);
  const activeArtifact =
    artifact ?? (createdArtifactState?.source === artifact ? createdArtifactState.artifact : null);

  useEffect(() => {
    if (!activeArtifact || readyCapability || failedCapability) return;
    let cancelled = false;
    void loadReadyAuthoringCapability()
      .then((capability) => {
        if (!cancelled) setReadyCapability(capability);
      })
      .catch(() => {
        if (!cancelled) setFailedCapability("ready_authoring");
      });
    return () => {
      cancelled = true;
    };
  }, [activeArtifact, failedCapability, readyCapability]);

  const handleCreateDocument = useCallback(
    (mode: DocumentCreationMode) => {
      if (creationPendingRef.current) return;
      creationPendingRef.current = true;
      setCreationState("creating");
      setFailedCapability(null);

      const readyPromise = loadReadyAuthoringCapability()
        .then((capability) => {
          setReadyCapability(capability);
          return capability;
        })
        .catch(() => {
          throw new CapabilityLoadError("ready_authoring");
        });
      const creationPromise = loadArtifactCreationCapability()
        .catch(() => {
          throw new CapabilityLoadError("artifact_creation");
        })
        .then(({ createAndPersistAuthoringArtifact }) =>
          createAndPersistAuthoringArtifact({ mode, services }),
        )
        .then((savedArtifact) => {
          setCreatedArtifactState({
            source: artifact,
            artifact: savedArtifact,
          });
          return savedArtifact;
        });

      void Promise.all([readyPromise, creationPromise])
        .then(() => {
          setCreationState("idle");
        })
        .catch((error: unknown) => {
          if (error instanceof CapabilityLoadError) {
            setFailedCapability(error.capability);
            return;
          }
          setCreationState("error");
        })
        .finally(() => {
          creationPendingRef.current = false;
        });
    },
    [artifact, services],
  );

  if (failedCapability) {
    return <ScaffoldAuthoringCapabilityUnavailable capability={failedCapability} />;
  }

  if (!activeArtifact) {
    return <DocumentCreationGate onCreate={handleCreateDocument} state={creationState} />;
  }

  if (!readyCapability) {
    return <div role="status">Opening editor...</div>;
  }

  const { ScaffoldAuthoringApp } = readyCapability;
  return <ScaffoldAuthoringApp {...appProps} artifact={activeArtifact} services={services} />;
}

function ScaffoldAuthoringCapabilityUnavailable({ capability }: { capability: FailedCapability }) {
  const capabilityLabel = capability === "ready_authoring" ? "editor" : "document creation";
  return (
    <div role="alert">
      <strong>Scaffold {capabilityLabel} could not be loaded.</strong>
      <span>Reload this page to try again.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
