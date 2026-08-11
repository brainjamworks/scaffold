import {
  ScaffoldAuthoringEntry,
  type ScaffoldAuthoringHeaderActionsContext,
} from "@scaffold/core/authoring";
import type { ScaffoldAuthoringArtifact } from "@scaffold/core/ports";
import { createScaffoldApplication } from "@scaffold/core/extensions";
import { useMemo } from "react";

import type { ScaffoldXBlockInnerInitPayload } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";
import {
  createXBlockAuthoringHostServices,
  createXBlockPreviewLearnerServices,
} from "./authoring-ports";
import { notifyXBlockDone, notifyXBlockSaveEnd, notifyXBlockSaveStart } from "./xblock-host";

const scaffoldApplication = createScaffoldApplication();
const freeProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

interface XBlockStudioAppProps {
  data: ScaffoldXBlockInnerInitPayload;
  bridge: XBlockInnerBridge;
}

export function XBlockStudioApp({ data, bridge }: XBlockStudioAppProps) {
  if (data.artifactAccess.status !== "supported" || !data.artifact || !data.publicationStatus) {
    throw new Error(
      "Supported XBlock Studio payload must include an artifact and publication status.",
    );
  }
  const artifact: ScaffoldAuthoringArtifact | null =
    data.artifact.content === null ? null : { ...data.artifact, content: data.artifact.content };
  const authoringServices = useMemo(
    () =>
      createXBlockAuthoringHostServices(bridge, {
        publicationStatus: data.publicationStatus!,
        resolvedMedia: data.resolvedMedia,
      }),
    [bridge, data.publicationStatus, data.resolvedMedia],
  );
  const previewServices = useMemo(
    () =>
      createXBlockPreviewLearnerServices(bridge, {
        resolvedMedia: data.resolvedMedia,
      }),
    [bridge, data.resolvedMedia],
  );

  return (
    <div className="sc-xblock-root sc-xblock-studio-shell">
      <ScaffoldAuthoringEntry
        application={scaffoldApplication}
        artifact={artifact}
        productAccess={freeProductAccess}
        services={authoringServices}
        createPreviewServices={() => previewServices}
        className="sc-xblock-authoring-app"
        headerActions={(context) => (
          <XBlockStudioActions
            busy={context.saveState === "saving"}
            publishState={context.publishState}
            onSave={() => {
              void saveWithHostNotification(bridge, context.saveNow);
            }}
            onDone={() => {
              void saveWithHostNotification(bridge, context.saveNow).then(async (saved) => {
                if (saved) await notifyXBlockDone(bridge);
              });
            }}
            onPublish={() => {
              void context.publishNow();
            }}
          />
        )}
        scrollModel="contained"
        mainClassName="sc-xblock-editor-scroll"
      />
    </div>
  );
}

async function saveWithHostNotification(
  bridge: XBlockInnerBridge,
  saveNow: ScaffoldAuthoringHeaderActionsContext["saveNow"],
): Promise<boolean> {
  await notifyXBlockSaveStart(bridge);
  try {
    return await saveNow();
  } finally {
    await notifyXBlockSaveEnd(bridge);
  }
}

function XBlockStudioActions({
  busy,
  publishState,
  onSave,
  onDone,
  onPublish,
}: {
  busy: boolean;
  publishState: ScaffoldAuthoringHeaderActionsContext["publishState"];
  onSave: () => void;
  onDone: () => void;
  onPublish: () => void;
}) {
  const publishDisabled =
    busy ||
    [
      "loading",
      "publishing",
      "unsaved",
      "invalid",
      "unavailable-content",
      "requires-scaffold-plus",
      "unsupported-core-format",
      "projection-warning",
      "payload-too-large",
    ].includes(publishState);
  return (
    <>
      <button
        type="button"
        className="sc-xblock-header-action sc-xblock-header-action--secondary"
        disabled={busy}
        onClick={onSave}
      >
        Save
      </button>
      <button
        type="button"
        className="sc-xblock-header-action sc-xblock-header-action--primary"
        disabled={publishDisabled}
        onClick={onPublish}
      >
        Publish
      </button>
      <span className="sc-xblock-publication-state" aria-live="polite">
        {xblockPublicationStateCopy(publishState)}
      </span>
      <button
        type="button"
        className="sc-xblock-header-action sc-xblock-header-action--primary"
        disabled={busy}
        onClick={onDone}
      >
        Done
      </button>
    </>
  );
}

function xblockPublicationStateCopy(
  state: ScaffoldAuthoringHeaderActionsContext["publishState"],
): string {
  if (state === "not-published") return "Not published";
  if (state === "published") return "Published";
  if (state === "unpublished") return "Unpublished changes";
  if (state === "unsaved") return "Save before publishing";
  if (state === "publishing") return "Publishing…";
  if (state === "loading") return "Loading publication status";
  if (state === "forbidden") return "Publishing is not permitted";
  if (state === "stale-artifact-revision") return "Save changed; publish the latest revision";
  if (state === "invalid") return "Fix invalid content before publishing";
  return "Publish failed";
}
