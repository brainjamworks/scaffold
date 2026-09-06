import { ScaffoldAuthoringEntry, type AuthoringSaveResult } from "@scaffold/core/authoring";
import type { ScaffoldAuthoringArtifact } from "@scaffold/core/ports";
import { createScaffoldApplication } from "@scaffold/core/extensions";
import { useMemo, useRef } from "react";

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
  const manualSaveInFlightRef = useRef(false);

  return (
    <div className="sc-xblock-root sc-xblock-studio-shell">
      <ScaffoldAuthoringEntry
        application={scaffoldApplication}
        artifact={artifact}
        productAccess={freeProductAccess}
        services={authoringServices}
        createPreviewServices={() => previewServices}
        className="sc-xblock-authoring-app"
        hostHeaderActions={(context) => ({
          beforePublish: (
            <XBlockStudioAction
              action="save"
              busy={context.saveState === "saving"}
              onActivate={() => {
                void saveWithHostNotification(bridge, context.saveNow, manualSaveInFlightRef).catch(
                  () => undefined,
                );
              }}
            />
          ),
          afterPublish: (
            <XBlockStudioAction
              action="done"
              busy={context.saveState === "saving"}
              onActivate={() => {
                void saveWithHostNotification(bridge, context.saveNow, manualSaveInFlightRef)
                  .then(async (saved) => {
                    if (saved?.isOk()) await notifyXBlockDone(bridge);
                  })
                  .catch(() => undefined);
              }}
            />
          ),
        })}
        scrollModel="contained"
        mainClassName="sc-xblock-editor-scroll"
      />
    </div>
  );
}

async function saveWithHostNotification(
  bridge: XBlockInnerBridge,
  saveNow: () => Promise<AuthoringSaveResult>,
  inFlightRef: { current: boolean },
): Promise<AuthoringSaveResult | null> {
  if (inFlightRef.current) return null;
  inFlightRef.current = true;
  try {
    await notifyXBlockSaveStart(bridge);
    try {
      return await saveNow();
    } finally {
      await notifyXBlockSaveEnd(bridge);
    }
  } finally {
    inFlightRef.current = false;
  }
}

function XBlockStudioAction({
  action,
  busy,
  onActivate,
}: {
  action: "save" | "done";
  busy: boolean;
  onActivate: () => void;
}) {
  const label = action === "save" ? "Save" : "Done";
  return (
    <button
      type="button"
      className={`sc-xblock-header-action sc-xblock-header-action--${
        action === "save" ? "secondary" : "primary"
      }`}
      disabled={busy}
      onClick={onActivate}
    >
      {label}
    </button>
  );
}
