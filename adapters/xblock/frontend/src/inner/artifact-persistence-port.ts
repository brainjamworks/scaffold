import {
  artifactSaveFailed,
  artifactSaveSucceeded,
  type ArtifactPersistencePort,
  type ArtifactPersistenceResult,
} from "@scaffold/core/ports";

import type { BridgeHandlerResponse } from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

type SaveContentResponse = BridgeHandlerResponse & {
  artifactRevision?: unknown;
};

export function createXBlockArtifactPersistence(
  bridge: XBlockInnerBridge,
): ArtifactPersistencePort {
  return {
    saveArtifact: async (bundle): Promise<ArtifactPersistenceResult> => {
      const response = await bridge.request<SaveContentResponse>("persistence.saveArtifact", {
        artifact: bundle.artifact,
      });
      if (response.success === false) {
        const cause = new Error(
          typeof response.error === "string" ? response.error : "XBlock Save was refused",
        );
        return artifactSaveFailed({
          reason: "write-aborted",
          artifactId: bundle.artifact.id,
          cause,
        });
      }
      if (typeof response.artifactRevision !== "string" || !response.artifactRevision) {
        throw new Error("XBlock Save response did not include an artifact revision");
      }
      return artifactSaveSucceeded({ artifactRevision: response.artifactRevision });
    },
  };
}
