import {
  LearningEventIriSchema,
  LearningEventSchema,
  type LearningEventDraft,
  type LearningEventIri,
  type LearningEventPort,
  type LearningEvent,
} from "../../host/ports/learning-events";
import {
  BlockLearningEventInputSchema,
  CoreLearningEventInputSchema,
  buildLearningEventDraft,
  type CoreLearningEventInput,
} from "./catalogue";

export type LearningEventSessionState =
  | { readonly status: "dormant" }
  | {
      readonly status: "active";
      readonly startedAt: string;
      readonly acceptance: "accepting" | "failed";
    }
  | {
      readonly status: "terminating";
      readonly startedAt: string;
      readonly acceptance: "accepting" | "failed";
    }
  | {
      readonly status: "terminated";
      readonly startedAt: string | null;
      readonly acceptance: "accepted" | "failed" | "not-started";
    };

export interface LearningEventSession {
  readonly rootActivityId: LearningEventIri;
  start(): void;
  recordBlock(inputValue: unknown): void;
  record(inputValue: CoreLearningEventInput): void;
  terminate(): Promise<void>;
  getState(): LearningEventSessionState;
}

export interface CreateLearningEventSessionInput {
  readonly port: LearningEventPort;
  readonly artefactTitle: string;
  readonly createUuid: () => string;
  readonly now: () => Date;
  readonly monotonicNow: () => number;
}

export const LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS = 256;

interface QueuedLearningEvent {
  readonly event: LearningEvent;
  readonly kind: "initialized" | "learning" | "terminated";
}

function frozenState<T extends LearningEventSessionState>(state: T): T {
  return Object.freeze(state);
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return value;
  }

  visited.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, visited);
  }
  return Object.freeze(value);
}

export function createLearningEventSession(
  input: CreateLearningEventSessionInput,
): LearningEventSession {
  const rootActivityId = LearningEventIriSchema.parse(input.port.rootActivityId);
  let state: LearningEventSessionState = frozenState({ status: "dormant" });
  let sessionStart: number | null = null;
  let waiting: QueuedLearningEvent[] = [];
  let inFlight: QueuedLearningEvent | null = null;
  let acceptanceStopped = false;
  let terminationPromise: Promise<void> | null = null;
  let resolveTermination: (() => void) | null = null;

  function setState(nextState: LearningEventSessionState): void {
    state = frozenState(nextState);
  }

  function settleTermination(): void {
    const resolve = resolveTermination;
    resolveTermination = null;
    resolve?.();
  }

  function failDelivery(): void {
    if (acceptanceStopped) return;

    acceptanceStopped = true;
    waiting = [];

    switch (state.status) {
      case "dormant":
        setState({ status: "terminated", startedAt: null, acceptance: "failed" });
        settleTermination();
        return;
      case "active":
        setState({
          status: "active",
          startedAt: state.startedAt,
          acceptance: "failed",
        });
        return;
      case "terminating":
        setState({
          status: "terminated",
          startedAt: state.startedAt,
          acceptance: "failed",
        });
        settleTermination();
        return;
      case "terminated":
        settleTermination();
    }
  }

  function pendingCount(): number {
    return waiting.length + (inFlight === null ? 0 : 1);
  }

  function hasAdmissionCapacity(): boolean {
    if (pendingCount() < LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS) {
      return true;
    }
    failDelivery();
    return false;
  }

  function materialize(draft: LearningEventDraft): LearningEvent | null {
    try {
      const event = LearningEventSchema.parse({
        ...draft,
        id: input.createUuid(),
        timestamp: input.now().toISOString(),
      });
      return deepFreeze(event);
    } catch {
      failDelivery();
      return null;
    }
  }

  function completeAcceptedItem(item: QueuedLearningEvent): void {
    if (inFlight !== item) return;
    inFlight = null;

    if (acceptanceStopped) return;
    if (item.kind === "terminated") {
      const startedAt = state.status === "terminating" ? state.startedAt : null;
      setState({ status: "terminated", startedAt, acceptance: "accepted" });
      settleTermination();
      return;
    }
    pump();
  }

  function rejectItem(item: QueuedLearningEvent): void {
    if (inFlight !== item) return;
    inFlight = null;
    failDelivery();
  }

  function pump(): void {
    if (acceptanceStopped || inFlight !== null) return;

    const next = waiting.shift();
    if (next === undefined) return;
    inFlight = next;

    void Promise.resolve()
      .then(() => {
        if (acceptanceStopped || inFlight !== next) return;
        return input.port.accept(next.event);
      })
      .then(
        () => completeAcceptedItem(next),
        () => rejectItem(next),
      );
  }

  function queueEvent(event: LearningEvent, kind: QueuedLearningEvent["kind"]): void {
    waiting.push(Object.freeze({ event, kind }));
    pump();
  }

  function admitDraft(draft: LearningEventDraft, kind: QueuedLearningEvent["kind"]): boolean {
    if (!hasAdmissionCapacity()) return false;

    const event = materialize(draft);
    if (event === null) return false;
    queueEvent(event, kind);
    return true;
  }

  function draftFor(inputValue: CoreLearningEventInput): LearningEventDraft | null {
    try {
      return buildLearningEventDraft(inputValue, {
        rootActivityId,
        title: input.artefactTitle,
      });
    } catch {
      failDelivery();
      return null;
    }
  }

  function startSession(): void {
    if (state.status !== "dormant") return;
    if (!hasAdmissionCapacity()) return;

    const initializedDraft = draftFor({ type: "session.initialized" });
    if (initializedDraft === null) return;
    const initialized = materialize(initializedDraft);
    if (initialized === null) return;

    let monotonicStart: number;
    try {
      monotonicStart = input.monotonicNow();
      if (!Number.isFinite(monotonicStart)) {
        throw new Error("monotonic clock must return a finite number");
      }
    } catch {
      failDelivery();
      return;
    }

    sessionStart = monotonicStart;
    setState({
      status: "active",
      startedAt: initialized.timestamp,
      acceptance: "accepting",
    });
    queueEvent(initialized, "initialized");
  }

  function start(): void {
    startSession();
  }

  function canRecord(): boolean {
    return (
      !acceptanceStopped &&
      (state.status === "dormant" ||
        (state.status === "active" && state.acceptance === "accepting"))
    );
  }

  function recordParsed(inputValue: CoreLearningEventInput): void {
    if (inputValue.type === "session.initialized" || inputValue.type === "session.terminated") {
      return;
    }

    startSession();
    if (state.status !== "active" || state.acceptance !== "accepting") return;
    const draft = draftFor(inputValue);
    if (draft !== null) admitDraft(draft, "learning");
  }

  function recordCore(inputValue: CoreLearningEventInput): void {
    if (!canRecord()) return;

    try {
      const result = CoreLearningEventInputSchema.safeParse(inputValue);
      if (!result.success) {
        failDelivery();
        return;
      }
      recordParsed(result.data);
    } catch {
      failDelivery();
    }
  }

  function recordBlock(inputValue: unknown): void {
    if (!canRecord()) return;

    try {
      const result = BlockLearningEventInputSchema.safeParse(inputValue);
      if (!result.success) {
        failDelivery();
        return;
      }
      recordParsed(result.data);
    } catch {
      failDelivery();
    }
  }

  function terminate(): Promise<void> {
    if (terminationPromise !== null) return terminationPromise;

    terminationPromise = new Promise<void>((resolve) => {
      resolveTermination = resolve;
    });

    if (state.status === "dormant") {
      acceptanceStopped = true;
      setState({ status: "terminated", startedAt: null, acceptance: "not-started" });
      settleTermination();
      return terminationPromise;
    }

    if (state.status === "terminated") {
      settleTermination();
      return terminationPromise;
    }

    if (state.acceptance === "failed") {
      acceptanceStopped = true;
      setState({
        status: "terminated",
        startedAt: state.startedAt,
        acceptance: "failed",
      });
      settleTermination();
      return terminationPromise;
    }

    const startedAt = state.startedAt;
    setState({ status: "terminating", startedAt, acceptance: "accepting" });

    let durationMs: number;
    try {
      const end = input.monotonicNow();
      if (sessionStart === null || !Number.isFinite(end)) {
        throw new Error("monotonic clock must return a finite number");
      }
      durationMs = Math.floor(Math.max(0, end - sessionStart) / 10) * 10;
      if (!Number.isSafeInteger(durationMs)) {
        throw new Error("session duration must be a safe integer");
      }
    } catch {
      failDelivery();
      return terminationPromise;
    }

    const terminated = draftFor({ type: "session.terminated", durationMs });
    if (terminated !== null) admitDraft(terminated, "terminated");
    return terminationPromise;
  }

  const session = Object.freeze({
    rootActivityId,
    start,
    recordBlock,
    record: recordCore,
    terminate,
    getState: () => state,
  });
  return session;
}
