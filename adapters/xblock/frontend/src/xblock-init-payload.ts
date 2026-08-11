import type {
  ScaffoldXBlockInnerInitPayload,
  ScaffoldXBlockLearnerInitialState,
  ScaffoldXBlockOuterData,
  ScaffoldXBlockView,
} from "./types";

interface BuildXBlockInnerInitPayloadOptions {
  view: ScaffoldXBlockView;
  data: ScaffoldXBlockOuterData;
  defaultMediaContext: NonNullable<ScaffoldXBlockOuterData["mediaContext"]>;
}

export function buildXBlockInnerInitPayload({
  view,
  data,
  defaultMediaContext,
}: BuildXBlockInnerInitPayloadOptions): ScaffoldXBlockInnerInitPayload {
  if (view === "student" && !data.learnerPublication) {
    throw new Error("XBlock student payload is missing learner publication state.");
  }
  if (view === "studio" && !data.publicationStatus) {
    throw new Error("XBlock Studio payload is missing publication status.");
  }
  const supported = data.artifactAccess.status === "supported";
  return {
    view,
    artifactAccess: data.artifactAccess,
    artifact: supported ? data.artifact : null,
    mediaContext: data.mediaContext ?? defaultMediaContext,
    ...(supported && data.resolvedMedia ? { resolvedMedia: data.resolvedMedia } : {}),
    ...(typeof data.protocolVersion === "number" ? { protocolVersion: data.protocolVersion } : {}),
    initialLearnerState: supported ? toXBlockInitialLearnerState(data, view) : {},
    learnerPublication:
      view === "student"
        ? data.learnerPublication!
        : {
            status: "invalid",
            issues: [
              {
                code: "missing_learner_publication",
                message: "Learner publication is unavailable.",
                path: [],
              },
            ],
          },
    ...(view === "studio" && data.publicationStatus
      ? { publicationStatus: data.publicationStatus }
      : {}),
  };
}

export function toXBlockInitialLearnerState(
  data: Pick<ScaffoldXBlockOuterData, "assessmentSnapshot" | "learnerActivitySnapshot">,
  view: ScaffoldXBlockView,
): ScaffoldXBlockLearnerInitialState {
  if (view === "studio") {
    return {};
  }

  return {
    ...(data.assessmentSnapshot === undefined
      ? {}
      : { assessmentSnapshot: data.assessmentSnapshot }),
    ...(data.learnerActivitySnapshot === undefined
      ? {}
      : { learnerActivitySnapshot: data.learnerActivitySnapshot }),
  };
}
