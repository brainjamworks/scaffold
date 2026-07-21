import type { LearnerActivityRecord, LearnerActivitySnapshot } from "@scaffold/contracts";

export interface LearnerActivityLoadRequest {
  artifactId: string;
}

export type LearnerActivitySaveRecord = Pick<
  LearnerActivityRecord,
  "activityKind" | "data" | "completed"
>;

export interface LearnerActivitySaveRequest {
  artifactId: string;
  blockId: string;
  record: LearnerActivitySaveRecord;
}

/**
 * Stateless learner activity persistence supplied by the host.
 *
 * A stable port identity denotes one persistence authority. `load` returns
 * `null` only when that authority has no persisted state. Rejections are
 * failures and are not interpreted as empty state. Hosts validate artifact
 * and block identity, while successful saves return the complete record with
 * its authoritative timestamp.
 */
export interface LearnerActivityPort {
  load: (request: LearnerActivityLoadRequest) => Promise<LearnerActivitySnapshot | null>;
  save: (request: LearnerActivitySaveRequest) => Promise<LearnerActivityRecord>;
}
