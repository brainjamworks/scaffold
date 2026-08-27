import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";

import type { LearnerActivityData } from "@scaffold/contracts";
import { useScopedLearnerActivityApi } from "./LearnerActivityRuntimeProvider";
import type {
  LearnerActivityDefault,
  LearnerActivityRuntimeRecord,
  LearnerActivitySaveState,
  LearnerActivityUpdate,
} from "./types";

export interface UseLearnerActivityRuntimeArgs {
  blockId: string | null | undefined;
  activityKind: string;
  initial: LearnerActivityDefault;
}

export interface LearnerActivityRuntimeFacade {
  blockId: string;
  activity: LearnerActivityRuntimeRecord | null;
  hasUnsafeIdentity: boolean;
  persistence: LearnerActivitySaveState;
  setData(data: LearnerActivityData): boolean;
  patchData(patch: LearnerActivityData): boolean;
  setCompleted(completed: boolean): boolean;
  updateActivity(update: LearnerActivityUpdate): boolean;
}

const unavailable: LearnerActivitySaveState = {
  status: "unavailable",
  generation: 0,
  error: null,
};

export function useLearnerActivityRuntime({
  blockId: rawBlockId,
  activityKind,
  initial,
}: UseLearnerActivityRuntimeArgs): LearnerActivityRuntimeFacade {
  const store = useScopedLearnerActivityApi();
  if (!store) {
    throw new Error("Learner activity runtime requires a valid runtime artifact identity.");
  }

  const blockId = rawBlockId?.trim() ?? "";
  const hasUnsafeIdentity = !blockId;
  const initialRef = useRef(initial);
  const activity = useStore(store, (state) =>
    blockId ? (state.activities[blockId] ?? null) : null,
  );
  const persistence = useStore(store, (state) =>
    blockId ? (state.saves[blockId] ?? unavailable) : unavailable,
  );

  useEffect(() => {
    if (!blockId) return;
    store.getState().ensureActivity({
      blockId,
      activityKind,
      initial: initialRef.current,
    });
  }, [activityKind, blockId, store]);

  return useMemo(
    () => ({
      blockId,
      activity,
      hasUnsafeIdentity,
      persistence,
      setData: (data: LearnerActivityData) => {
        return blockId ? store.getState().setData(blockId, data) : false;
      },
      patchData: (patch: LearnerActivityData) => {
        return blockId ? store.getState().patchData(blockId, patch) : false;
      },
      setCompleted: (completed: boolean) => {
        return blockId ? store.getState().setCompleted(blockId, completed) : false;
      },
      updateActivity: (update: LearnerActivityUpdate) => {
        return blockId ? store.getState().updateActivity(blockId, update) : false;
      },
    }),
    [activity, blockId, hasUnsafeIdentity, persistence, store],
  );
}
