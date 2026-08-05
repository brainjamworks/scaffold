import type {
  ScaffoldLearnerHostServices,
  ScaffoldMediaContext,
  ScaffoldResolvedMediaMap,
  ScaffoldRuntimePorts,
  LearningEventIri,
} from "@scaffold/core/ports";

import { createXBlockAssessmentPort } from "./assessment-port";
import { createXBlockLearningEventPort } from "./learning-event-port";
import { createXBlockLearnerActivityPort } from "./learner-activity-port";
import { createXBlockMediaPort } from "./media-port";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export { createXBlockArtifactPersistence } from "./artifact-persistence-port";
export { unwrapXBlockHandlerResponse } from "./handler-response";

interface XBlockRuntimePortOptions {
  mediaContext?: ScaffoldMediaContext | undefined;
  resolvedMedia?: ScaffoldResolvedMediaMap | null | undefined;
  rootActivityId?: LearningEventIri | undefined;
}

export function createXBlockRuntimePorts(
  bridge: XBlockInnerBridge,
  options: XBlockRuntimePortOptions = {},
): ScaffoldRuntimePorts {
  return {
    assessment: createXBlockAssessmentPort(bridge),
    learnerActivity: createXBlockLearnerActivityPort(bridge),
    media: createXBlockMediaPort(bridge, options),
    ...(options.rootActivityId
      ? { learningEvents: createXBlockLearningEventPort(bridge, options.rootActivityId) }
      : {}),
  };
}

export function createXBlockLearnerHostServices(
  bridge: XBlockInnerBridge,
  options: XBlockRuntimePortOptions = {},
): ScaffoldLearnerHostServices {
  const runtimePorts = createXBlockRuntimePorts(bridge, options);

  return {
    ...(runtimePorts.assessment ? { assessment: runtimePorts.assessment } : {}),
    ...(runtimePorts.media ? { media: runtimePorts.media } : {}),
    ...(runtimePorts.learnerActivity ? { learnerActivity: runtimePorts.learnerActivity } : {}),
    ...(runtimePorts.learningEvents ? { learningEvents: runtimePorts.learningEvents } : {}),
  };
}
