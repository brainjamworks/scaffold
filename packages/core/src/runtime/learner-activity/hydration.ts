import {
  SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION,
  LearnerActivitySnapshotSchema,
  type LearnerActivitySnapshot,
} from "@scaffold/contracts";
import type { LearnerActivityStoreApi } from "./types";

export function hydrateLearnerActivitySnapshot(
  store: LearnerActivityStoreApi,
  value: unknown,
): void {
  const snapshot = LearnerActivitySnapshotSchema.parse(value);
  const state = store.getState();

  if (snapshot.artifactId !== state.artifactId) {
    throw new Error(
      `Learner activity snapshot artifactId ${snapshot.artifactId} does not match runtime artifactId ${state.artifactId}`,
    );
  }

  store.setState({
    activities: snapshot.activities,
    hydration: { status: "ready", error: null },
  });
}

export function projectLearnerActivitySnapshot(
  store: LearnerActivityStoreApi,
): LearnerActivitySnapshot {
  const state = store.getState();
  return LearnerActivitySnapshotSchema.parse({
    snapshotVersion: SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION,
    artifactId: state.artifactId,
    activities: state.activities,
  });
}
