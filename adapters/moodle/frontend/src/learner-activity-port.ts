import { LearnerActivityRecordSchema, LearnerActivitySnapshotSchema } from "@scaffold/contracts";
import type { LearnerActivityPort } from "@scaffold/core/ports";

import { moodleCall, parseJsonField, type MoodleAjaxResponse } from "./api";

interface LoadLearnerActivityResponse extends MoodleAjaxResponse {
  snapshotJson?: unknown;
}

interface SaveLearnerActivityResponse extends MoodleAjaxResponse {
  recordJson?: unknown;
}

export function createMoodleLearnerActivityPort(cmid: number): LearnerActivityPort {
  return {
    load: async (request) => {
      const response = await moodleCall<LoadLearnerActivityResponse>(
        "mod_scaffold_load_learner_activity",
        {
          cmid,
          artifactid: request.artifactId,
        },
      );
      const snapshot = LearnerActivitySnapshotSchema.parse(
        parseJsonField(response.snapshotJson, null),
      );
      if (snapshot.artifactId !== request.artifactId) {
        throw new Error("Moodle learner activity load returned a foreign artifact snapshot");
      }
      return snapshot;
    },
    save: async (request) => {
      const response = await moodleCall<SaveLearnerActivityResponse>(
        "mod_scaffold_save_learner_activity",
        {
          cmid,
          artifactid: request.artifactId,
          blockid: request.blockId,
          recordjson: JSON.stringify(request.record),
        },
      );
      const record = LearnerActivityRecordSchema.parse(parseJsonField(response.recordJson, null));
      if (record.updatedAt === null) {
        throw new Error("Moodle learner activity save did not return an authoritative timestamp");
      }
      return record;
    },
  };
}
