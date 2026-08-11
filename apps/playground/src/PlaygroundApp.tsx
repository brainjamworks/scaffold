import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ScaffoldAuthoringEntry,
  type ScaffoldAuthoringHeaderActionsContext,
} from "@scaffold/core/authoring";
import { createScaffoldApplication } from "@scaffold/core/extensions";
import type { ScaffoldAuthoringArtifact } from "@scaffold/core/ports";

import { browserMediaPort } from "./ports/browserMediaPort";
import { browserPersistencePort } from "./ports/browserPersistencePort";
import { requestPersistentStorage } from "./ports/browserStorageDb";
import { createBrowserLearnerPublicationPort } from "./ports/createBrowserLearnerPublicationPort";
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
const scaffoldApplication = createScaffoldApplication();
const freeProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

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
  const learnerPublicationPort = useMemo(
    () => createBrowserLearnerPublicationPort(artifactId),
    [artifactId],
  );
  const authoringServices = useMemo(
    () => ({
      artifactPersistence: browserPersistencePort,
      artifactCreation: {
        createArtifactMetadata: async () => ({
          id: artifactId,
          requiresScaffoldPlus: false,
          title: DEFAULT_TITLE,
        }),
      },
      learnerPublication: learnerPublicationPort,
      media: browserMediaPort,
    }),
    [artifactId, learnerPublicationPort],
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
      application={scaffoldApplication}
      artifact={artifact}
      productAccess={freeProductAccess}
      services={authoringServices}
      headerActions={(context) => (
        <>
          {headerExtras}
          <button
            type="button"
            className="sc-playground-publish-button"
            disabled={!canPublish(context.publishState)}
            onClick={() => {
              void context.publishNow();
            }}
          >
            Publish
          </button>
          <span className="sc-playground-publication-state" aria-live="polite">
            {publicationStateCopy(context.publishState)}
          </span>
        </>
      )}
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

function canPublish(state: ScaffoldAuthoringHeaderActionsContext["publishState"]): boolean {
  return ![
    "loading",
    "publishing",
    "unsaved",
    "invalid",
    "unavailable-content",
    "requires-scaffold-plus",
    "unsupported-core-format",
    "projection-warning",
    "payload-too-large",
  ].includes(state);
}

function publicationStateCopy(
  state: ScaffoldAuthoringHeaderActionsContext["publishState"],
): string {
  switch (state) {
    case "loading":
      return "Loading publication status";
    case "not-published":
      return "Not published";
    case "published":
      return "Published";
    case "unpublished":
      return "Unpublished changes";
    case "unsaved":
      return "Save before publishing";
    case "publishing":
      return "Publishing…";
    case "invalid":
      return "Fix invalid content before publishing";
    case "unavailable-content":
      return "Unavailable content cannot be published";
    case "requires-scaffold-plus":
      return "Scaffold Plus is required to publish";
    case "unsupported-core-format":
      return "This document format cannot be published";
    case "projection-warning":
      return "Resolve projection warnings before publishing";
    case "payload-too-large":
      return "Publication is too large";
    case "stale-artifact-revision":
      return "Save changed; publish the latest revision";
    case "forbidden":
      return "Publishing is not permitted";
    case "invalid-payload":
    case "error":
      return "Publish failed";
  }
}
