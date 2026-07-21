import {
  ScaffoldAuthoringEntry,
  type ScaffoldAuthoringHeaderActionsContext,
} from "@scaffold/core/authoring";
import { useMemo } from "react";

import type { ScaffoldXBlockInnerInitPayload } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";
import {
  createXBlockAuthoringHostServices,
  createXBlockPreviewLearnerServices,
} from "./authoring-ports";
import { prepareXBlockArtifact } from "./xblock-content";
import { notifyXBlockDone, notifyXBlockSaveEnd, notifyXBlockSaveStart } from "./xblock-host";

interface XBlockStudioAppProps {
  data: ScaffoldXBlockInnerInitPayload;
  bridge: XBlockInnerBridge;
}

export function XBlockStudioApp({ data, bridge }: XBlockStudioAppProps) {
  const artifactState = useMemo(() => prepareXBlockArtifact(data.artifact), [data.artifact]);
  const authoringServices = useMemo(
    () =>
      createXBlockAuthoringHostServices(bridge, {
        resolvedMedia: data.resolvedMedia,
      }),
    [bridge, data.resolvedMedia],
  );
  const previewServices = useMemo(
    () =>
      createXBlockPreviewLearnerServices(bridge, {
        resolvedMedia: data.resolvedMedia,
      }),
    [bridge, data.resolvedMedia],
  );

  if (artifactState.status === "error") {
    return (
      <div className="sc-xblock-root sc-xblock-error" role="alert">
        <strong>Scaffold document could not be loaded.</strong>
        <span>{artifactState.message}</span>
      </div>
    );
  }

  return (
    <div className="sc-xblock-root sc-xblock-studio-shell">
      <ScaffoldAuthoringEntry
        artifact={artifactState.status === "ready" ? artifactState.artifact : null}
        services={authoringServices}
        createPreviewServices={() => previewServices}
        className="sc-xblock-authoring-app"
        headerActions={(context) => (
          <XBlockStudioActions
            busy={context.saveState === "saving"}
            onSave={() => {
              void saveWithHostNotification(bridge, context.saveNow);
            }}
            onDone={() => {
              void saveWithHostNotification(bridge, context.saveNow).then(async (saved) => {
                if (saved) await notifyXBlockDone(bridge);
              });
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
  onSave,
  onDone,
}: {
  busy: boolean;
  onSave: () => void;
  onDone: () => void;
}) {
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
        disabled={busy}
        onClick={onDone}
      >
        Done
      </button>
    </>
  );
}
