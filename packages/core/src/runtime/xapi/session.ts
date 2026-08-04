/** @deprecated Migration-only draft adapter over one Learning Event session. */
import type { LearningEvent, LearningEventPort } from "../../host/ports/learning-events";
import type { XapiIri, XapiPort, XapiStatementDraft } from "../../host/ports/xapi";
import {
  LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS,
  createLearningEventSession,
  recordLearningEventDraftForMigration,
  type LearningEventSession,
  type LearningEventSessionState,
} from "../learning-events/session";

export type XapiSessionState =
  | { readonly status: "dormant" }
  | {
      readonly status: "active";
      readonly startedAt: string;
      readonly delivery: "accepting" | "failed";
    }
  | {
      readonly status: "terminating";
      readonly startedAt: string;
      readonly delivery: "accepting" | "failed";
    }
  | {
      readonly status: "terminated";
      readonly startedAt: string | null;
      readonly delivery: "accepted" | "failed" | "not-started";
    };

export interface XapiSession {
  readonly rootActivityId: XapiIri;
  start(): void;
  record(statement: XapiStatementDraft): void;
  terminate(): Promise<void>;
  getState(): XapiSessionState;
}

export interface CreateXapiSessionInput {
  readonly port: XapiPort;
  readonly courseTitle: string;
  readonly createUuid: () => string;
  readonly now: () => Date;
  readonly monotonicNow: () => number;
}

export const XAPI_SESSION_MAX_PENDING_STATEMENTS = LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS;
const compatibilitySessions = new WeakMap<LearningEventSession, XapiSession>();

function compatibilityState(state: LearningEventSessionState): XapiSessionState {
  if (state.status === "dormant") return Object.freeze(state);
  const { acceptance, ...shared } = state;
  return Object.freeze({
    ...shared,
    delivery: acceptance,
  }) as XapiSessionState;
}

/** @internal Remove with the xAPI provider façade in Phase 6. */
export function adaptLearningEventSessionForXapiMigration(
  session: LearningEventSession | null,
): XapiSession | null {
  if (session === null) return null;
  const existing = compatibilitySessions.get(session);
  if (existing) return existing;

  const compatibilitySession = Object.freeze({
    rootActivityId: session.rootActivityId,
    start: () => session.start(),
    record: (statement: XapiStatementDraft) =>
      recordLearningEventDraftForMigration(session, statement),
    terminate: () => session.terminate(),
    getState: () => compatibilityState(session.getState()),
  });
  compatibilitySessions.set(session, compatibilitySession);
  return compatibilitySession;
}

export function createXapiSession(input: CreateXapiSessionInput): XapiSession {
  const port: LearningEventPort = Object.freeze({
    rootActivityId: input.port.activityId,
    accept: (event: LearningEvent) => input.port.send(event),
  });
  const session = createLearningEventSession({
    port,
    artefactTitle: input.courseTitle,
    createUuid: input.createUuid,
    now: input.now,
    monotonicNow: input.monotonicNow,
  });
  return adaptLearningEventSessionForXapiMigration(session)!;
}
