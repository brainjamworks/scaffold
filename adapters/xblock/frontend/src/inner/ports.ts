import { AnswerRevealSchema, type AnswerReveal } from "@scaffold/contracts";
import { validateMediaUploadFile } from "@scaffold/core/media-policy";
import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
} from "@scaffold/core/ports";
import type {
  ArtifactPersistencePort,
  ArtifactSaveResult,
  AssessmentProblemCommandOutcome,
  AssessmentQuizCommandOutcome,
  ScaffoldLearnerHostServices,
  ScaffoldMediaContext,
  ScaffoldResolvedMediaMap,
  ScaffoldRuntimePorts,
} from "@scaffold/core/ports";

import { createXBlockLearnerActivityPort } from "./learner-activity-port";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

type BridgeHandlerResponse = {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
};

type SaveContentResponse = BridgeHandlerResponse & {
  artifact?: {
    title?: unknown;
  };
};

interface XBlockMediaPortOptions {
  mediaContext?: ScaffoldMediaContext | undefined;
  resolvedMedia?: ScaffoldResolvedMediaMap | null | undefined;
}

const DEFAULT_MEDIA_CONTEXT: ScaffoldMediaContext = "runtime";

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

export function createXBlockRuntimePorts(
  bridge: XBlockInnerBridge,
  options: XBlockMediaPortOptions = {},
): ScaffoldRuntimePorts {
  const mediaContext = options.mediaContext ?? DEFAULT_MEDIA_CONTEXT;
  const resolvedMedia = sanitizeResolvedMedia(options.resolvedMedia);

  return {
    media: {
      context: mediaContext,
      resolve: async (mediaId) => {
        const resolvedUrl = resolvedMedia[mediaId];
        if (resolvedUrl) return resolvedUrl;

        const response = await bridge.request<BridgeHandlerResponse & { url?: unknown }>(
          "media.resolve",
          { mediaId, context: mediaContext },
        );

        if (typeof response.url !== "string") {
          throw new Error("XBlock media resolver did not return a URL");
        }

        return response.url;
      },
      list: async (filter) => {
        const response = await bridge.request<BridgeHandlerResponse & { items?: unknown }>(
          "media.list",
          {
            context: mediaContext,
            ...(filter?.kind ? { kind: filter.kind } : {}),
            ...(filter?.mediaType ? { mediaType: filter.mediaType } : {}),
          },
        );

        if (!Array.isArray(response.items)) return [];
        const items = response.items as Array<Record<string, unknown>>;
        return items
          .filter(
            (raw): raw is Record<string, unknown> =>
              typeof raw.id === "string" &&
              typeof raw.url === "string" &&
              typeof raw.mediaType === "string",
          )
          .map((raw) => ({
            id: String(raw.id),
            url: String(raw.url),
            mediaType: raw.mediaType as never,
            fileName: typeof raw.fileName === "string" ? raw.fileName : "",
            mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "",
            size: typeof raw.size === "number" ? raw.size : 0,
            ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
            ...(typeof raw.thumbnailUrl === "string" ? { thumbnailUrl: raw.thumbnailUrl } : {}),
          }));
      },
      upload: async (file, meta, onProgress) => {
        const mediaType = validateMediaUploadFile(file, meta.mediaType);
        onProgress?.(0);
        const dataUrl = await readFileAsDataUrl(file);
        onProgress?.(60);

        const response = await bridge.request<
          BridgeHandlerResponse & { mediaId?: unknown; url?: unknown }
        >("media.upload", {
          context: mediaContext,
          mediaType,
          filename: file.name,
          contentType: file.type,
          dataUrl,
        });

        if (typeof response.mediaId !== "string" || typeof response.url !== "string") {
          throw new Error("XBlock media upload did not return a media id and URL");
        }

        onProgress?.(100);
        return {
          id: response.mediaId,
          url: response.url,
          mediaType,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        };
      },
    },

    assessment: {
      type: "runtime",
      check: async (args): Promise<AssessmentProblemCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>("assessment.check", args);
        return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      submit: async (args): Promise<AssessmentProblemCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>("assessment.submit", args);
        return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      revealHint: async (args): Promise<AssessmentProblemCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>("assessment.revealHint", args);
        return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      revealAnswer: async (args): Promise<AnswerReveal> => {
        const response = await bridge.request<BridgeHandlerResponse>(
          "assessment.revealAnswer",
          args,
        );
        return AnswerRevealSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      quiz: {
        startAttempt: async (args): Promise<AssessmentQuizCommandOutcome> => {
          const response = await bridge.request<BridgeHandlerResponse>(
            "assessment.quiz.startAttempt",
            args,
          );
          return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
        },
        submitQuestion: async (args): Promise<AssessmentQuizCommandOutcome> => {
          const response = await bridge.request<BridgeHandlerResponse>(
            "assessment.quiz.submitQuestion",
            args,
          );
          return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
        },
        finishAttempt: async (args): Promise<AssessmentQuizCommandOutcome> => {
          const response = await bridge.request<BridgeHandlerResponse>(
            "assessment.quiz.finishAttempt",
            args,
          );
          return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
        },
        revealAnswers: async (args): Promise<AssessmentQuizCommandOutcome> => {
          const response = await bridge.request<BridgeHandlerResponse>(
            "assessment.quiz.revealAnswers",
            args,
          );
          return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
        },
      },
    },

    learnerActivity: createXBlockLearnerActivityPort(bridge),
  };
}

export function createXBlockLearnerHostServices(
  bridge: XBlockInnerBridge,
  options: XBlockMediaPortOptions = {},
): ScaffoldLearnerHostServices {
  const runtimePorts = createXBlockRuntimePorts(bridge, options);

  return {
    ...(runtimePorts.assessment ? { assessment: runtimePorts.assessment } : {}),
    ...(runtimePorts.media ? { media: runtimePorts.media } : {}),
    ...(runtimePorts.learnerActivity ? { learnerActivity: runtimePorts.learnerActivity } : {}),
  };
}

export function unwrapXBlockHandlerResponse(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("XBlock assessment handler returned an invalid response");
  }

  const handlerResponse = response as BridgeHandlerResponse;
  if (handlerResponse.success === false) {
    throw new Error(
      typeof handlerResponse.error === "string"
        ? handlerResponse.error
        : "XBlock assessment handler rejected the request",
    );
  }
  const { success: _success, error: _error, ...payload } = handlerResponse;
  return payload;
}

function sanitizeResolvedMedia(
  value: ScaffoldResolvedMediaMap | null | undefined,
): ScaffoldResolvedMediaMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" &&
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0,
    ),
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("could not read media file"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("could not read media file"));
    });
    reader.readAsDataURL(file);
  });
}
