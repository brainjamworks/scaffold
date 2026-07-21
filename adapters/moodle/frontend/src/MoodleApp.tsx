import { useEffect, useMemo, useState } from "react";

import {
  AssessmentLearnerSnapshotSchema,
  LearnerActivitySnapshotSchema,
} from "@scaffold/contracts";
import { ScaffoldAuthoringEntry } from "@scaffold/core/authoring";
import { ContentRuntimeHost } from "@scaffold/core/runtime";
import { ScaffoldArtifactSchema, prepareScaffoldArtifactForAuthoring } from "@scaffold/core/format";

import { moodleCall, parseJsonField, type MoodleAjaxResponse } from "./api";
import { createMoodleAuthoringHostServices } from "./authoring-ports";
import type { MoodleApplicationConfig, MoodlePayload } from "./types";

interface PayloadResponse extends MoodleAjaxResponse {
  artifactJson?: unknown;
  assessmentSnapshotJson?: unknown;
  learnerActivitySnapshotJson?: unknown;
}

interface MoodleAppProps {
  config: MoodleApplicationConfig;
}

type MoodleReadyArtifact = Extract<
  ReturnType<typeof prepareScaffoldArtifactForAuthoring>,
  { status: "ready" }
>["artifact"];
export function MoodleApp({ config }: MoodleAppProps) {
  const [payload, setPayload] = useState<MoodlePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const surface = config.surface;

  useEffect(() => {
    let cancelled = false;

    async function loadPayload() {
      try {
        const response = await moodleCall<PayloadResponse>("mod_scaffold_get_payload", {
          cmid: config.cmid,
          purpose: surface,
        });
        if (cancelled) return;
        const artifact = parseJsonField(response.artifactJson, null);
        const parsedArtifact = ScaffoldArtifactSchema.safeParse(artifact);
        if (!parsedArtifact.success) {
          throw new Error(parsedArtifact.error.message);
        }
        const assessmentSnapshot =
          surface === "learner"
            ? AssessmentLearnerSnapshotSchema.parse(
                parseJsonField(response.assessmentSnapshotJson, null),
              )
            : undefined;
        const learnerActivitySnapshot =
          surface === "learner"
            ? LearnerActivitySnapshotSchema.parse(
                parseJsonField(response.learnerActivitySnapshotJson, null),
              )
            : undefined;
        setPayload({
          artifact: parsedArtifact.data,
          ...(assessmentSnapshot === undefined ? {} : { assessmentSnapshot }),
          ...(learnerActivitySnapshot === undefined ? {} : { learnerActivitySnapshot }),
        });
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Scaffold content could not be loaded.",
        );
      }
    }

    void loadPayload();

    return () => {
      cancelled = true;
    };
  }, [config.cmid, surface]);

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
  const prepared = useMemo(
    () => prepareScaffoldArtifactForAuthoring(payload.artifact),
    [payload.artifact],
  );
  if (prepared.status === "error") {
    return (
      <div className="sc-moodle-root sc-moodle-error" role="alert">
        <strong>Scaffold document could not be loaded.</strong>
        <span>{prepared.message}</span>
      </div>
    );
  }

  if (config.surface === "learner") {
    if (prepared.status === "uninitialized") {
      return (
        <div className="sc-moodle-root sc-moodle-error" role="alert">
          <strong>Scaffold document could not be loaded.</strong>
          <span>Scaffold content has not been created yet.</span>
        </div>
      );
    }

    return (
      <div className="sc-moodle-root sc-moodle-student-shell">
        <ContentRuntimeHost
          artifactId={payload.artifact.id}
          initialAssessmentSnapshot={payload.assessmentSnapshot}
          initialLearnerActivitySnapshot={payload.learnerActivitySnapshot}
          initialContent={prepared.artifact.content}
        />
      </div>
    );
  }

  return (
    <MoodleAuthoringApp
      artifact={prepared.status === "uninitialized" ? null : prepared.artifact}
      cmid={config.cmid}
      metadata={{ id: payload.artifact.id, title: payload.artifact.title }}
      returnUrl={config.returnUrl}
    />
  );
}

interface MoodleAuthoringAppProps {
  artifact: MoodleReadyArtifact | null;
  cmid: number;
  metadata: { id: string; title: string };
  returnUrl: string;
}

function MoodleAuthoringApp({ artifact, cmid, metadata, returnUrl }: MoodleAuthoringAppProps) {
  const services = useMemo(
    () => createMoodleAuthoringHostServices(cmid, metadata),
    [cmid, metadata],
  );

  const entry = (
    <ScaffoldAuthoringEntry
      artifact={artifact}
      services={services}
      className="sc-moodle-root sc-moodle-author-shell"
      mainClassName="sc-moodle-editor-scroll"
      scrollModel="contained"
      headerActions={() => <MoodleReturnLink returnUrl={returnUrl} />}
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
