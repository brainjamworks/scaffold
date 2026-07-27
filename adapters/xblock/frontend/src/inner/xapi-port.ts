import type { XapiIri, XapiPort } from "@scaffold/core/ports";

import {
  type BridgeHandlerResponse,
  unwrapXBlockHandlerResponse,
} from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function createXBlockXapiPort(
  bridge: XBlockInnerBridge,
  activityId: XapiIri,
): XapiPort {
  return {
    activityId,
    send: async (statement) => {
      const response = await bridge.request<BridgeHandlerResponse>("xapi.accept", {
        statement,
      });
      unwrapXBlockHandlerResponse(response);
    },
  };
}
