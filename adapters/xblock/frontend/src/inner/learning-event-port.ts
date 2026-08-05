import type { LearningEventIri, LearningEventPort } from "@scaffold/core/ports";

import { type BridgeHandlerResponse, unwrapXBlockHandlerResponse } from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function createXBlockLearningEventPort(
  bridge: XBlockInnerBridge,
  rootActivityId: LearningEventIri,
): LearningEventPort {
  return {
    rootActivityId,
    accept: async (event) => {
      const response = await bridge.request<BridgeHandlerResponse>("learningEvents.accept", {
        event,
      });
      unwrapXBlockHandlerResponse(response);
    },
  };
}
