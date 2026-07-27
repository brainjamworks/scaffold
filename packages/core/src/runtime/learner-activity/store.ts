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
import {
  buildLearnerActivityCompletedStatementDraft,
  buildLearnerActivityInteractedStatementDraft,
  isXapiLearnerActivityKind,
  type LearnerActivityXapiEvent,
} from "../xapi/statement-catalogue";
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

function structurallyEqualJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => structurallyEqualJson(value, right[index]));
  }

  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      structurallyEqualJson(leftRecord[key], rightRecord[key]),
  );
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedRecord(
  data: LearnerActivityData,
  key: string,
): Record<string, unknown> | null {
  return jsonRecord(data[key]);
}

function changedBooleanKeys(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(
    (key) => (previous[key] === true) !== (current[key] === true),
  );
}

function changedStringKeys(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(
    (key) => previous[key] !== current[key],
  );
}

function positiveInteger(data: LearnerActivityData, key: string): number | null {
  const value = data[key];
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function authoritativeXapiEvent(
  previous: LearnerActivityRuntimeRecord,
  current: LearnerActivityRuntimeRecord,
  event: LearnerActivityXapiEvent,
): LearnerActivityXapiEvent | undefined {
  switch (event.kind) {
    case "checklist-item-toggled": {
      if (current.activityKind !== "checklist") return undefined;
      const previousChecked = nestedRecord(previous.data, "checked");
      const currentChecked = nestedRecord(current.data, "checked");
      const total = positiveInteger(current.data, "total");
      const changedItems =
        previousChecked && currentChecked
          ? changedBooleanKeys(previousChecked, currentChecked)
          : [];
      if (
        !previousChecked ||
        !currentChecked ||
        total === null ||
        changedItems.length !== 1 ||
        changedItems[0] !== event.itemId
      ) {
        return undefined;
      }
      const checked = currentChecked[event.itemId] === true;
      const completedCount = Object.values(currentChecked).filter((value) => value === true).length;
      if (
        event.checked !== checked ||
        event.completedCount !== completedCount ||
        event.total !== total
      ) {
        return undefined;
      }
      return { ...event, checked, completedCount, total };
    }
    case "flashcard-flipped": {
      if (current.activityKind !== "flashcard") return undefined;
      const previousFlipped = nestedRecord(previous.data, "flipped");
      const currentFlipped = nestedRecord(current.data, "flipped");
      if (!previousFlipped || !currentFlipped) return undefined;
      const changedCards = changedBooleanKeys(previousFlipped, currentFlipped);
      if (changedCards.length !== 1 || changedCards[0] !== event.cardId) return undefined;
      const face = currentFlipped[event.cardId] === true ? "back" : "front";
      return event.face === face ? { ...event, face } : undefined;
    }
    case "flashcard-rated": {
      if (current.activityKind !== "flashcard") return undefined;
      const previousMastery = nestedRecord(previous.data, "mastery");
      const currentMastery = nestedRecord(current.data, "mastery");
      const total = positiveInteger(current.data, "total");
      if (!previousMastery || !currentMastery || total === null) return undefined;
      const changedCards = changedStringKeys(previousMastery, currentMastery);
      if (changedCards.length !== 1 || changedCards[0] !== event.cardId) return undefined;
      const rating = currentMastery[event.cardId] === "gotIt" ? "got-it" : "not-yet";
      if (currentMastery[event.cardId] !== "gotIt" && currentMastery[event.cardId] !== "notYet") {
        return undefined;
      }
      const masteredCount = Object.values(currentMastery).filter(
        (status) => status === "gotIt",
      ).length;
      if (
        event.rating !== rating ||
        event.masteredCount !== masteredCount ||
        event.total !== total
      ) {
        return undefined;
      }
      return { ...event, rating, masteredCount, total };
    }
  }
}

type LearnerActivityTransition = "completed" | "interacted";

function authoritativeTransition(
  previous: LearnerActivityRuntimeRecord,
  current: LearnerActivityRuntimeRecord,
): LearnerActivityTransition | null {
  if (!isXapiLearnerActivityKind(current.activityKind)) return null;
  if (!previous.completed && current.completed) return "completed";
  return structurallyEqualJson(previous.data, current.data) ? null : "interacted";
}

export function createLearnerActivityStore({
  artifactId,
  learnerActivityPort,
  getXapiSession,
}: CreateLearnerActivityStoreOptions): LearnerActivityStoreApi {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    throw new Error("artifactId must be a non-blank string");
  }

  return createStore((set, get) => {
    const saveTails = new Map<string, Promise<void>>();
    const lastAuthoritativeRecords = new Map<string, LearnerActivityRuntimeRecord>();

    const recordAuthoritativeTransition = (
      blockId: string,
      previousRecord: LearnerActivityRuntimeRecord,
      record: LearnerActivityRuntimeRecord,
      transition: LearnerActivityTransition,
      xapiEvent?: LearnerActivityXapiEvent,
      xapiEventIsAuthoritative = false,
    ): void => {
      try {
        const session = getXapiSession?.();
        if (!session || !isXapiLearnerActivityKind(record.activityKind)) return;

        const input = {
          rootActivityId: session.rootActivityId,
          blockId,
          activityKind: record.activityKind,
        };
        let eventRecorded = false;
        if (xapiEvent && xapiEventIsAuthoritative) {
          const authoritativeEvent = authoritativeXapiEvent(previousRecord, record, xapiEvent);
          try {
            if (authoritativeEvent) {
              session.record(
                buildLearnerActivityInteractedStatementDraft({
                  ...input,
                  event: authoritativeEvent,
                }),
              );
              eventRecorded = true;
            }
          } catch {
            // Invalid observational metadata falls back to the generic transition.
          }
        }
        if (xapiEvent && !eventRecorded) {
          session.record(buildLearnerActivityInteractedStatementDraft(input));
          eventRecorded = true;
        }
        if (transition === "completed") {
          session.record(buildLearnerActivityCompletedStatementDraft(input));
        } else if (!eventRecorded) {
          session.record(buildLearnerActivityInteractedStatementDraft(input));
        }
      } catch {
        // Learning-record delivery is observational and cannot change persistence authority.
      }
    };

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
      xapiEvent?: LearnerActivityXapiEvent,
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

          const previousAuthoritative = lastAuthoritativeRecords.get(blockId);
          set((state) => ({
            activities: { ...state.activities, [blockId]: authoritative },
            saves: {
              ...state.saves,
              [blockId]: { status: "idle", generation, error: null },
            },
          }));
          lastAuthoritativeRecords.set(blockId, authoritative);

          if (previousAuthoritative) {
            const transition = authoritativeTransition(previousAuthoritative, authoritative);
            if (transition) {
              recordAuthoritativeTransition(
                blockId,
                previousAuthoritative,
                authoritative,
                transition,
                xapiEvent,
                structurallyEqualJson(saveRecord(record), saveRecord(authoritative)),
              );
            }
          }
        })
        .catch((error: unknown) => {
          reconcileFailure(blockId, generation, error);
        });

      saveTails.set(blockId, nextTail);
      void nextTail.finally(() => {
        if (saveTails.get(blockId) === nextTail) saveTails.delete(blockId);
      });
    };

    const commitMutation = (
      blockId: string,
      record: LearnerActivityRuntimeRecord,
      xapiEvent?: LearnerActivityXapiEvent,
    ): boolean => {
      const state = get();
      const current = state.activities[blockId];
      if (
        !lastAuthoritativeRecords.has(blockId) &&
        current !== undefined &&
        state.saves[blockId] === undefined
      ) {
        lastAuthoritativeRecords.set(blockId, current);
      }

      const generation = (state.saves[blockId]?.generation ?? 0) + 1;
      enqueueSave(blockId, generation, record, xapiEvent);
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
      updateActivity: (blockId, update) => {
        const current = currentRecord(blockId);
        if (!current) return false;
        const data = LearnerActivityDataSchema.parse(update.data);
        if (typeof update.completed !== "boolean") {
          throw new Error("completed must be a boolean");
        }
        return commitMutation(
          blockId,
          { ...current, data, completed: update.completed },
          update.xapiEvent,
        );
      },
    };
  });
}
