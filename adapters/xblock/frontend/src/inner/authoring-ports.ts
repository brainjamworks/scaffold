import { AnswerRevealSchema } from "@scaffold/contracts";
import { AssessmentProblemCommandOutcomeSchema } from "@scaffold/core/ports";
import type {
  ScaffoldAuthoringEntryHostServices,
  ScaffoldLearnerHostServices,
  ScaffoldResolvedMediaMap,
} from "@scaffold/core/ports";

import {
  createXBlockArtifactPersistence,
  createXBlockRuntimePorts,
  unwrapXBlockHandlerResponse,
} from "./ports";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

interface XBlockAuthoringServiceOptions {
  resolvedMedia?: ScaffoldResolvedMediaMap | null | undefined;
}

export function createXBlockAuthoringHostServices(
  bridge: XBlockInnerBridge,
  options: XBlockAuthoringServiceOptions = {},
): ScaffoldAuthoringEntryHostServices {
  const runtimePorts = createXBlockRuntimePorts(bridge, {
    mediaContext: "authoring",
    resolvedMedia: options.resolvedMedia,
  });

  return {
    artifactPersistence: createXBlockArtifactPersistence(bridge),
    artifactCreation: {
      createArtifactMetadata: async (input) => {
        const response = await bridge.request<{ artifact?: unknown }>(
          "persistence.createArtifact",
          input,
        );
        return readCreatedArtifactMetadata(response.artifact);
      },
    },
    ...(runtimePorts.media ? { media: runtimePorts.media } : {}),
  };
}

function readCreatedArtifactMetadata(value: unknown): {
  id: string;
  title?: string | undefined;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("XBlock artifact creation returned invalid metadata.");
  }

  const artifact = value as Record<string, unknown>;
  const id = artifact["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("XBlock artifact creation returned invalid artifact id.");
  }

  const title = artifact["title"];
  return typeof title === "string" && title.length > 0 ? { id, title } : { id };
}

export function createXBlockPreviewLearnerServices(
  bridge: XBlockInnerBridge,
  options: XBlockAuthoringServiceOptions = {},
): ScaffoldLearnerHostServices {
  const runtimePorts = createXBlockRuntimePorts(bridge, {
    mediaContext: "preview",
    resolvedMedia: options.resolvedMedia,
  });

  return {
    ...(runtimePorts.media ? { media: runtimePorts.media } : {}),
    assessment: {
      type: "preview",
      check: async (args) => {
        const response = await bridge.request("assessment.previewCheck", args);
        return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      submit: async (args) => {
        const response = await bridge.request("assessment.previewSubmit", args);
        return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      revealAnswer: async (args) => {
        const response = await bridge.request("assessment.revealAnswer", args);
        return AnswerRevealSchema.parse(unwrapXBlockHandlerResponse(response));
      },
    },
  };
}
