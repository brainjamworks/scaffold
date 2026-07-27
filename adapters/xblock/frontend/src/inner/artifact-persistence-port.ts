import type { ArtifactPersistencePort, ArtifactSaveResult } from "@scaffold/core/ports";

import type { BridgeHandlerResponse } from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

type SaveContentResponse = BridgeHandlerResponse & {
  artifact?: {
    title?: unknown;
  };
};

export function createXBlockArtifactPersistence(
  bridge: XBlockInnerBridge,
): ArtifactPersistencePort {
  return {
    saveArtifact: async (bundle): Promise<ArtifactSaveResult> => {
      const response = await bridge.request<SaveContentResponse>("persistence.saveArtifact", {
        artifact: bundle.artifact,
        learnerContent: bundle.learnerContent,
        assessmentTargets: bundle.assessmentTargets,
        assessmentGroups: bundle.assessmentGroups,
      });

      return typeof response.artifact?.title === "string" && response.artifact.title
        ? { artifact: { title: response.artifact.title } }
        : {};
    },
  };
}
