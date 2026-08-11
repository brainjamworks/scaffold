import { useMemo } from "react";

import { ScaffoldAuthoringEntry } from "@scaffold/core/authoring";
import { createScaffoldApplication } from "@scaffold/core/extensions";
import type { LearnerPublicationStatus, ScaffoldAuthoringArtifact } from "@scaffold/core/ports";
import type { ScaffoldArtifact } from "@scaffold/core/format";

import { createMoodleAuthoringHostServices } from "./authoring-ports";
import { MoodleLearnerApp } from "./MoodleLearnerApp";
import { useMoodlePayload } from "./moodle-payload";
import type { MoodleApplicationConfig, MoodleArtifactAccess, MoodlePayload } from "./types";

const scaffoldApplication = createScaffoldApplication();
const freeProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

interface MoodleAppProps {
  config: MoodleApplicationConfig;
}

export function MoodleApp({ config }: MoodleAppProps) {
  const { payload, loadError } = useMoodlePayload(config);

  if (loadError) {
    return (
      <div className="sc-moodle-root sc-moodle-error" role="alert">
        <strong>Scaffold content could not be loaded.</strong>
        <span>{loadError}</span>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="sc-moodle-root sc-moodle-loading" aria-live="polite">
        Loading Scaffold...
      </div>
    );
  }

  return <LoadedMoodleApp config={config} payload={payload} />;
}

interface LoadedMoodleAppProps {
  config: MoodleApplicationConfig;
  payload: MoodlePayload;
}

function LoadedMoodleApp({ config, payload }: LoadedMoodleAppProps) {
  if (config.surface === "learner") {
    if (!payload.learnerPublication) {
      return (
        <div className="sc-moodle-root sc-moodle-error" role="alert">
          <strong>Scaffold document could not be loaded.</strong>
          <span>Learner publication is unavailable.</span>
        </div>
      );
    }
    return (
      <MoodleLearnerApp
        artifact={payload.artifactAccess.artifact}
        cmid={config.cmid}
        productAccess={freeProductAccess}
        publication={payload.learnerPublication}
        wwwroot={config.wwwroot}
        {...(payload.assessmentSnapshot === undefined
          ? {}
          : { assessmentSnapshot: payload.assessmentSnapshot })}
        {...(payload.learnerActivitySnapshot === undefined
          ? {}
          : { learnerActivitySnapshot: payload.learnerActivitySnapshot })}
      />
    );
  }

  if (payload.artifactAccess.status !== "supported") {
    return <MoodleArtifactUnavailable status={payload.artifactAccess.status} />;
  }

  return <LoadedMoodleAuthoringApp config={config} payload={payload} />;
}

function LoadedMoodleAuthoringApp({
  config,
  payload,
}: {
  config: Extract<MoodleApplicationConfig, { surface: "authoring" }>;
  payload: MoodlePayload;
}) {
  if (!payload.artifact || !payload.publicationStatus) {
    throw new Error("Supported authoring payload must include an artifact and publication status.");
  }

  return (
    <MoodleAuthoringApp
      artifact={toAuthoringArtifact(payload.artifact)}
      cmid={config.cmid}
      metadata={{ id: payload.artifact.id, title: payload.artifact.title }}
      publicationStatus={payload.publicationStatus}
      returnUrl={config.returnUrl}
    />
  );
}

interface MoodleAuthoringAppProps {
  artifact: ScaffoldAuthoringArtifact | null;
  cmid: number;
  metadata: { id: string; title: string };
  publicationStatus: LearnerPublicationStatus;
  returnUrl: string;
}

function toAuthoringArtifact(artifact: ScaffoldArtifact): ScaffoldAuthoringArtifact | null {
  return artifact.content === null ? null : { ...artifact, content: artifact.content };
}

function MoodleAuthoringApp({
  artifact,
  cmid,
  metadata,
  publicationStatus,
  returnUrl,
}: MoodleAuthoringAppProps) {
  const services = useMemo(
    () => createMoodleAuthoringHostServices(cmid, metadata, publicationStatus),
    [cmid, metadata, publicationStatus],
  );

  const entry = (
    <ScaffoldAuthoringEntry
      application={scaffoldApplication}
      artifact={artifact}
      productAccess={freeProductAccess}
      services={services}
      className="sc-moodle-root sc-moodle-author-shell"
      mainClassName="sc-moodle-editor-scroll"
      scrollModel="contained"
      hostHeaderActions={() => ({
        beforePublish: <MoodleReturnLink returnUrl={returnUrl} />,
      })}
    />
  );

  if (artifact) {
    return entry;
  }

  return (
    <div className="sc-moodle-author-host">
      <nav className="sc-moodle-author-nav" aria-label="Scaffold authoring">
        <MoodleReturnLink returnUrl={returnUrl} />
      </nav>
      {entry}
    </div>
  );
}

function MoodleArtifactUnavailable({
  status,
}: {
  status: Exclude<MoodleArtifactAccess["status"], "supported">;
}) {
  const message =
    status === "requires-scaffold-plus"
      ? "This course requires Scaffold Plus."
      : status === "unsupported-core-format"
        ? "This course was created by a newer version of Scaffold."
        : "The Scaffold document is invalid.";

  return (
    <div className="sc-moodle-root sc-moodle-error" role="alert">
      <strong>Scaffold content could not be opened.</strong>
      <span>{message}</span>
    </div>
  );
}

function MoodleReturnLink({ returnUrl }: { returnUrl: string }) {
  return (
    <a
      className="sc-scaffold-authoring-action sc-moodle-return-link"
      href={returnUrl}
      target="_top"
    >
      <span className="sc-moodle-return-icon" aria-hidden="true">
        ←
      </span>
      Back to activity
    </a>
  );
}
