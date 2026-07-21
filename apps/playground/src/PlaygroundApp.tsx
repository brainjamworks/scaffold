import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ScaffoldAuthoringEntry } from "@scaffold/core/authoring";
import type { ScaffoldAuthoringArtifact } from "@scaffold/core/ports";

import { browserMediaPort } from "./ports/browserMediaPort";
import { browserPersistencePort } from "./ports/browserPersistencePort";
import { requestPersistentStorage } from "./ports/browserStorageDb";
import { LOCAL_ARTIFACT_ID } from "./ports/local-artifact-id";
import "./PlaygroundApp.css";

/**
 * Browser-local Scaffold playground.
 *
 * One single-document, IndexedDB-backed editor surface deployed to
 * playground.scaffold.ac. Adapters provide their own host ports and
 * lifecycle actions instead of importing this application.
 */

const DEFAULT_TITLE = "Untitled";

type LocalAssessmentPortModule = typeof import("./ports/createLocalAssessmentPort");

let localAssessmentPortModulePromise: Promise<LocalAssessmentPortModule> | null = null;

function loadLocalAssessmentPortModule(): Promise<LocalAssessmentPortModule> {
  localAssessmentPortModulePromise ??= import("./ports/createLocalAssessmentPort");
  return localAssessmentPortModulePromise;
}

export interface PlaygroundAppProps {
  /**
   * IndexedDB key the artifact is saved under. Defaults to one stable
   * single-document slot per playground origin.
   */
  artifactId?: string;
  /**
   * Extra header action slot rendered to the left of the built-in
   * Agent / Preview buttons. The playground uses this for its Reset
   * button.
   */
  headerExtras?: ReactNode;
}

export function PlaygroundApp({
  artifactId = LOCAL_ARTIFACT_ID,
  headerExtras,
}: PlaygroundAppProps) {
  const [artifact, setArtifact] = useState<ScaffoldAuthoringArtifact | null | undefined>(undefined);
  const [agentOpen, setAgentOpen] = useState(false);
  const authoringServices = useMemo(
    () => ({
      artifactPersistence: browserPersistencePort,
      artifactCreation: {
        createArtifactMetadata: async () => ({
          id: artifactId,
          title: DEFAULT_TITLE,
        }),
      },
      media: browserMediaPort,
    }),
    [artifactId],
  );

  useEffect(() => {
    let cancelled = false;
    setArtifact(undefined);

    void browserPersistencePort
      .loadArtifact(artifactId)
      .then((persisted) => {
        if (cancelled) return;
        setArtifact(persisted?.artifact ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setArtifact(null);
      });

    void requestPersistentStorage();

    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  if (artifact === undefined) {
    return <div role="status" className="sc-playground-loading" />;
  }

  return (
    <ScaffoldAuthoringEntry
      artifact={artifact}
      services={authoringServices}
      headerActions={() => headerExtras}
      agentOpen={agentOpen}
      onAgentOpenChange={setAgentOpen}
      onAgentClose={() => setAgentOpen(false)}
      createPreviewServices={async (previewContent) => {
        const { createLocalAssessmentPortFromProjection } = await loadLocalAssessmentPortModule();
        return {
          assessment: createLocalAssessmentPortFromProjection(() => previewContent),
          media: browserMediaPort,
        };
      }}
      className="sc-playground-authoring-app"
    />
  );
}
