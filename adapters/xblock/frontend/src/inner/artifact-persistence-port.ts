import type { ArtifactPersistencePort, ArtifactSaveResult } from "@scaffold/core/ports";

import type { BridgeHandlerResponse } from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

type SaveContentResponse = BridgeHandlerResponse & {
  artifactRevision?: unknown;
};

export function createXBlockArtifactPersistence(
  bridge: XBlockInnerBridge,
): ArtifactPersistencePort {
  return {
    saveArtifact: async (bundle): Promise<ArtifactSaveResult> => {
      const response = await bridge.request<SaveContentResponse>("persistence.saveArtifact", {
        artifact: bundle.artifact,
      });
      if (response.success === false) {
        throw new Error(
          typeof response.error === "string" ? response.error : "XBlock Save was refused",
        );
      }
      if (typeof response.artifactRevision !== "string" || !response.artifactRevision) {
        throw new Error("XBlock Save response did not include an artifact revision");
      }
      return { artifactRevision: response.artifactRevision };
    },
  };
}
