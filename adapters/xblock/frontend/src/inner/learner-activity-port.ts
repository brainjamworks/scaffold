import { LearnerActivityRecordSchema, LearnerActivitySnapshotSchema } from "@scaffold/contracts";
import type { LearnerActivityPort } from "@scaffold/core/ports";

import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function createXBlockLearnerActivityPort(bridge: XBlockInnerBridge): LearnerActivityPort {
  return {
    load: async (request) => {
      const response = await bridge.request<unknown>("learnerActivity.load", request);
      if (response === null) return null;

      const snapshot = LearnerActivitySnapshotSchema.parse(response);
      if (snapshot.artifactId !== request.artifactId) {
        throw new Error("XBlock learner activity load returned a foreign artifact snapshot");
      }
      return snapshot;
    },
    save: async (request) => {
      const response = await bridge.request<unknown>("learnerActivity.save", request);
      const record = LearnerActivityRecordSchema.parse(response);
      if (record.updatedAt === null) {
        throw new Error("XBlock learner activity save did not return an authoritative timestamp");
      }
      return record;
    },
  };
}
