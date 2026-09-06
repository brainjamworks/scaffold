import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
} from "@/host/contracts";
import type { ScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { useAuthoringColorMode } from "@/theme/state/authoring-color-mode";
import { Button } from "@/ui/components/Button/Button";
import { AppShellState } from "@/ui/components/app/AppShellState/AppShellState";
import { Wordmark } from "@/ui/components/app/Mark/Mark";
import { AuthoringColorModeButton } from "@/editor/shell/chrome/AuthoringColorModeButton";

import {
  DocumentCreationGate,
  type DocumentCreationRequest,
  type DocumentCreationState,
} from "./DocumentCreationGate";
import type { ScaffoldAuthoringAppProps } from "./ScaffoldAuthoringApp";
import "./ScaffoldAuthoringEntry.css";

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
  application: ScaffoldApplication;
  artifact: ScaffoldAuthoringArtifact | null;
  services: ScaffoldAuthoringEntryHostServices;
}

export function ScaffoldAuthoringEntry({
  application,
  artifact,
  productAccess,
  services,
  ...appProps
}: ScaffoldAuthoringEntryProps) {
  const [createdArtifactState, setCreatedArtifactState] = useState<{
    source: ScaffoldAuthoringArtifact | null;
    result: Awaited<ReturnType<ArtifactCreationCapability["createAndPersistAuthoringArtifact"]>>;
  } | null>(null);
  const [creationState, setCreationState] = useState<DocumentCreationState>("idle");
  const [readyCapability, setReadyCapability] = useState<ReadyAuthoringCapability | null>(null);
  const [failedCapability, setFailedCapability] = useState<FailedCapability | null>(null);
  const creationPendingRef = useRef(false);
  const activeCreation =
    artifact === null && createdArtifactState?.source === artifact
      ? createdArtifactState.result.isOk()
        ? createdArtifactState.result.value
        : null
      : null;
  const activeArtifact = artifact ?? activeCreation?.artifact ?? null;

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
    (request: DocumentCreationRequest) => {
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
      const creationCapabilityPromise = loadArtifactCreationCapability().catch(() => {
        throw new CapabilityLoadError("artifact_creation");
      });
      const creationPromise = Promise.all([readyPromise, creationCapabilityPromise])
        .then(([readyAuthoring, { createAndPersistAuthoringArtifact }]) =>
          createAndPersistAuthoringArtifact({
            ...request,
            productAccess,
            services,
            authoringEnvironment: readyAuthoring.createScaffoldAuthoringAppEnvironment(application),
          }),
        )
        .then((result) => {
          if (result.isErr()) {
            setCreationState("error");
            return result;
          }
          setCreatedArtifactState({
            source: artifact,
            result,
          });
          return result;
        });

      void Promise.all([readyPromise, creationPromise])
        .then(([, result]) => {
          if (result.isOk()) setCreationState("idle");
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
    [application, artifact, productAccess, services],
  );

  if (failedCapability) {
    return (
      <ScaffoldAuthoringEntryAppSurface>
        <ScaffoldAuthoringCapabilityUnavailable capability={failedCapability} />
      </ScaffoldAuthoringEntryAppSurface>
    );
  }

  if (!activeArtifact) {
    return (
      <ScaffoldAuthoringEntryAppSurface>
        <DocumentCreationGate onCreate={handleCreateDocument} state={creationState} />
      </ScaffoldAuthoringEntryAppSurface>
    );
  }

  if (!readyCapability) {
    return (
      <ScaffoldAuthoringEntryAppSurface>
        <AppShellState kind="loading" title="Opening editor" />
      </ScaffoldAuthoringEntryAppSurface>
    );
  }

  const { ScaffoldAuthoringAppForEntry } = readyCapability;
  return (
    <ScaffoldAuthoringAppForEntry
      {...appProps}
      application={application}
      artifact={activeArtifact}
      initialSavedArtifactRevision={activeCreation?.artifactRevision ?? null}
      productAccess={productAccess}
      services={services}
    />
  );
}

function ScaffoldAuthoringEntryAppSurface({ children }: { children: ReactNode }) {
  const { mode, toggleMode } = useAuthoringColorMode();
  return (
    <AppThemeProvider appearance={mode}>
      <div className="sc-scaffold-authoring-entry-surface">
        <header className="sc-scaffold-authoring-entry-surface__header">
          <Wordmark markSize={28} surface={mode} />
          <AuthoringColorModeButton mode={mode} onToggle={toggleMode} />
        </header>
        {children}
      </div>
    </AppThemeProvider>
  );
}

function ScaffoldAuthoringCapabilityUnavailable({ capability }: { capability: FailedCapability }) {
  const title =
    capability === "ready_authoring"
      ? "The editor couldn’t load"
      : "Document creation couldn’t load";
  return (
    <AppShellState
      action={
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      }
      description="Reload this page to try again."
      kind="error"
      title={title}
    />
  );
}
