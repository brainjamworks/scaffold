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
  return {
    view,
    artifact: data.artifact,
    mediaContext: data.mediaContext ?? defaultMediaContext,
    ...(data.resolvedMedia ? { resolvedMedia: data.resolvedMedia } : {}),
    ...(typeof data.protocolVersion === "number" ? { protocolVersion: data.protocolVersion } : {}),
    initialLearnerState: toXBlockInitialLearnerState(data, view),
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
