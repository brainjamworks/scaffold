import type { StoreApi } from "zustand/vanilla";

import type { LearnerActivityData, LearnerActivityRecord } from "@scaffold/contracts";
import type { LearnerActivityPort } from "../../host/ports/learner-activity";

export type LearnerActivityHydrationState =
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: string };

export type LearnerActivitySaveState =
  | { status: "unavailable"; generation: number; error: null }
  | { status: "idle"; generation: number; error: null }
  | { status: "pending"; generation: number; error: null }
  | { status: "error"; generation: number; error: string };

export type LearnerActivityRuntimeRecord = LearnerActivityRecord;

export interface LearnerActivityDefault {
  data: LearnerActivityData;
  completed: boolean;
}

export interface LearnerActivityStoreState {
  artifactId: string;
  hydration: LearnerActivityHydrationState;
  activities: Readonly<Record<string, LearnerActivityRuntimeRecord>>;
  saves: Readonly<Record<string, LearnerActivitySaveState>>;
}

export interface CreateLearnerActivityStoreOptions {
  artifactId: string;
  learnerActivityPort: LearnerActivityPort | null;
}

export interface LearnerActivityStoreActions {
  ensureActivity(input: {
    blockId: string;
    activityKind: string;
    initial: LearnerActivityDefault;
  }): boolean;
  setData(blockId: string, data: LearnerActivityData): boolean;
  patchData(blockId: string, patch: LearnerActivityData): boolean;
  setCompleted(blockId: string, completed: boolean): boolean;
}

export type LearnerActivityStore = LearnerActivityStoreState & LearnerActivityStoreActions;
export type LearnerActivityStoreApi = StoreApi<LearnerActivityStore>;
