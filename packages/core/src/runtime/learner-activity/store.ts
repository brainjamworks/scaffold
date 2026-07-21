import { createStore } from "zustand/vanilla";

import {
  SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION,
  LearnerActivityDataSchema,
  LearnerActivityRecordSchema,
  LearnerActivitySnapshotSchema,
  type LearnerActivityData,
  type LearnerActivityRecord,
} from "@scaffold/contracts";
import type { LearnerActivitySaveRecord } from "../../host/ports/learner-activity";
import type {
  CreateLearnerActivityStoreOptions,
  LearnerActivityRuntimeRecord,
  LearnerActivityStoreApi,
} from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validatedNewRecord(
  artifactId: string,
  blockId: string,
  activityKind: string,
  data: unknown,
  completed: unknown,
): LearnerActivityRecord {
  const record = LearnerActivityRecordSchema.parse({
    activityKind,
    data,
    completed,
    updatedAt: null,
  });
  LearnerActivitySnapshotSchema.parse({
    snapshotVersion: SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION,
    artifactId,
    activities: { [blockId]: record },
  });
  return record;
}

function saveRecord(record: LearnerActivityRuntimeRecord): LearnerActivitySaveRecord {
  return {
    activityKind: record.activityKind,
    data: record.data,
    completed: record.completed,
  };
}

export function createLearnerActivityStore({
  artifactId,
  learnerActivityPort,
}: CreateLearnerActivityStoreOptions): LearnerActivityStoreApi {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    throw new Error("artifactId must be a non-blank string");
  }

  return createStore((set, get) => {
    const saveTails = new Map<string, Promise<void>>();

    const reconcileFailure = (blockId: string, generation: number, error: unknown): void => {
      if (get().saves[blockId]?.generation !== generation) return;
      set((state) => ({
        saves: {
          ...state.saves,
          [blockId]: { status: "error", generation, error: errorMessage(error) },
        },
      }));
    };

    const enqueueSave = (
      blockId: string,
      generation: number,
      record: LearnerActivityRuntimeRecord,
    ): void => {
      if (!learnerActivityPort) return;

      const previousTail = saveTails.get(blockId) ?? Promise.resolve();
      const nextTail = previousTail
        .catch(() => undefined)
        .then(async () => {
          const response = await learnerActivityPort.save({
            artifactId: normalizedArtifactId,
            blockId,
            record: saveRecord(record),
          });
          const authoritative = LearnerActivityRecordSchema.parse(response);
          if (authoritative.updatedAt === null) {
            throw new Error("Learner activity host save response must include updatedAt");
          }
          if (authoritative.activityKind !== record.activityKind) {
            throw new Error("Learner activity host save response activityKind does not match");
          }
          if (get().saves[blockId]?.generation !== generation) return;

          set((state) => ({
            activities: { ...state.activities, [blockId]: authoritative },
            saves: {
              ...state.saves,
              [blockId]: { status: "idle", generation, error: null },
            },
          }));
        })
        .catch((error: unknown) => {
          reconcileFailure(blockId, generation, error);
        });

      saveTails.set(blockId, nextTail);
      void nextTail.finally(() => {
        if (saveTails.get(blockId) === nextTail) saveTails.delete(blockId);
      });
    };

    const commitMutation = (blockId: string, record: LearnerActivityRuntimeRecord): boolean => {
      const generation = (get().saves[blockId]?.generation ?? 0) + 1;
      enqueueSave(blockId, generation, record);
      set((state) => ({
        activities: { ...state.activities, [blockId]: record },
        saves: {
          ...state.saves,
          [blockId]: learnerActivityPort
            ? { status: "pending", generation, error: null }
            : { status: "unavailable", generation, error: null },
        },
      }));
      return true;
    };

    const currentRecord = (blockId: string): LearnerActivityRuntimeRecord | undefined =>
      get().activities[blockId];

    return {
      artifactId: normalizedArtifactId,
      hydration: learnerActivityPort
        ? { status: "loading", error: null }
        : { status: "ready", error: null },
      activities: {},
      saves: {},
      ensureActivity: ({ blockId, activityKind, initial }) => {
        const current = currentRecord(blockId);
        if (current) {
          if (current.activityKind !== activityKind) {
            throw new Error(
              `Learner activity activityKind cannot change from ${current.activityKind} to ${activityKind}`,
            );
          }
          return true;
        }
        return commitMutation(
          blockId,
          validatedNewRecord(
            normalizedArtifactId,
            blockId,
            activityKind,
            initial.data,
            initial.completed,
          ),
        );
      },
      setData: (blockId, data) => {
        const current = currentRecord(blockId);
        if (!current) return false;
        const parsedData = LearnerActivityDataSchema.parse(data);
        return commitMutation(blockId, { ...current, data: parsedData });
      },
      patchData: (blockId, patch) => {
        const current = currentRecord(blockId);
        if (!current) return false;
        const parsedPatch = LearnerActivityDataSchema.parse(patch);
        const data: LearnerActivityData = LearnerActivityDataSchema.parse({
          ...current.data,
          ...parsedPatch,
        });
        return commitMutation(blockId, { ...current, data });
      },
      setCompleted: (blockId, completed) => {
        const current = currentRecord(blockId);
        if (!current) return false;
        if (typeof completed !== "boolean") {
          throw new Error("completed must be a boolean");
        }
        return commitMutation(blockId, { ...current, completed });
      },
    };
  });
}
