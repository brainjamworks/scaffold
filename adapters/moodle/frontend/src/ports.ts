import type { ScaffoldRuntimePorts } from "@scaffold/core/ports";

import { createMoodleAssessmentPort } from "./assessment-port";
import { createMoodleLearnerActivityPort } from "./learner-activity-port";
import { createMoodleMediaPort } from "./media-port";
import { createMoodleXapiPort } from "./xapi-port";

export function createMoodleRuntimePorts(cmid: number, wwwroot?: string): ScaffoldRuntimePorts {
  return {
    learnerActivity: createMoodleLearnerActivityPort(cmid),
    media: createMoodleMediaPort(cmid),
    assessment: createMoodleAssessmentPort(cmid),
    ...(wwwroot ? { xapi: createMoodleXapiPort(cmid, wwwroot) } : {}),
  };
}
