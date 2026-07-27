import {
  XapiIriSchema,
  XapiStatementDraftSchema,
  XapiStatementTemplateSchema,
  type XapiIri,
  type XapiPort,
  type XapiStatementDraft,
  type XapiStatementTemplate,
} from "../../host/ports/xapi";
import {
  XAPI_VERBS,
  buildInitializedStatementDraft,
  buildTerminatedStatementDraft,
} from "./statement-catalogue";

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

export const XAPI_SESSION_MAX_PENDING_STATEMENTS = 256;

interface QueuedXapiStatement {
  readonly statement: XapiStatementTemplate;
  readonly kind: "initialized" | "learning" | "terminated";
}

function frozenState<T extends XapiSessionState>(state: T): T {
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

export function createXapiSession(input: CreateXapiSessionInput): XapiSession {
  const rootActivityId = XapiIriSchema.parse(input.port.activityId);
  let state: XapiSessionState = frozenState({ status: "dormant" });
  let sessionStart: number | null = null;
  let waiting: QueuedXapiStatement[] = [];
  let inFlight: QueuedXapiStatement | null = null;
  let deliveryStopped = false;
  let terminationPromise: Promise<void> | null = null;
  let resolveTermination: (() => void) | null = null;

  function setState(nextState: XapiSessionState): void {
    state = frozenState(nextState);
  }

  function settleTermination(): void {
    const resolve = resolveTermination;
    resolveTermination = null;
    resolve?.();
  }

  function failDelivery(): void {
    if (deliveryStopped) return;

    deliveryStopped = true;
    waiting = [];

    switch (state.status) {
      case "dormant":
        setState({ status: "terminated", startedAt: null, delivery: "failed" });
        settleTermination();
        return;
      case "active":
        setState({
          status: "active",
          startedAt: state.startedAt,
          delivery: "failed",
        });
        return;
      case "terminating":
        setState({
          status: "terminated",
          startedAt: state.startedAt,
          delivery: "failed",
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
    if (pendingCount() < XAPI_SESSION_MAX_PENDING_STATEMENTS) {
      return true;
    }
    failDelivery();
    return false;
  }

  function materialize(statement: XapiStatementDraft): XapiStatementTemplate | null {
    try {
      const template = XapiStatementTemplateSchema.parse({
        ...statement,
        id: input.createUuid(),
        timestamp: input.now().toISOString(),
      });
      return deepFreeze(template);
    } catch {
      failDelivery();
      return null;
    }
  }

  function completeAcceptedItem(item: QueuedXapiStatement): void {
    if (inFlight !== item) return;
    inFlight = null;

    if (deliveryStopped) return;
    if (item.kind === "terminated") {
      const startedAt = state.status === "terminating" ? state.startedAt : null;
      setState({ status: "terminated", startedAt, delivery: "accepted" });
      settleTermination();
      return;
    }
    pump();
  }

  function rejectItem(item: QueuedXapiStatement): void {
    if (inFlight !== item) return;
    inFlight = null;
    failDelivery();
  }

  function pump(): void {
    if (deliveryStopped || inFlight !== null) return;

    const next = waiting.shift();
    if (next === undefined) return;
    inFlight = next;

    void Promise.resolve()
      .then(() => {
        if (deliveryStopped || inFlight !== next) return;
        return input.port.send(next.statement);
      })
      .then(
        () => completeAcceptedItem(next),
        () => rejectItem(next),
      );
  }

  function queueTemplate(
    statement: XapiStatementTemplate,
    kind: QueuedXapiStatement["kind"],
  ): void {
    waiting.push(Object.freeze({ statement, kind }));
    pump();
  }

  function admitDraft(statement: XapiStatementDraft, kind: QueuedXapiStatement["kind"]): boolean {
    if (!hasAdmissionCapacity()) return false;

    const template = materialize(statement);
    if (template === null) return false;
    queueTemplate(template, kind);
    return true;
  }

  function startSession(): void {
    if (state.status !== "dormant") return;
    if (!hasAdmissionCapacity()) return;

    const initialized = materialize(
      buildInitializedStatementDraft({
        rootActivityId,
        title: input.courseTitle,
      }),
    );
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
      delivery: "accepting",
    });
    queueTemplate(initialized, "initialized");
  }

  function start(): void {
    startSession();
  }

  function record(statement: XapiStatementDraft): void {
    if (
      deliveryStopped ||
      (state.status !== "dormant" && !(state.status === "active" && state.delivery === "accepting"))
    ) {
      return;
    }

    let draft: XapiStatementDraft;
    try {
      const result = XapiStatementDraftSchema.safeParse(statement);
      if (!result.success) return;
      draft = result.data;
    } catch {
      return;
    }

    if (draft.verb.id === XAPI_VERBS.initialized.id || draft.verb.id === XAPI_VERBS.terminated.id) {
      return;
    }

    startSession();
    if (state.status !== "active" || state.delivery !== "accepting") return;
    admitDraft(draft, "learning");
  }

  function terminate(): Promise<void> {
    if (terminationPromise !== null) return terminationPromise;

    terminationPromise = new Promise<void>((resolve) => {
      resolveTermination = resolve;
    });

    if (state.status === "dormant") {
      deliveryStopped = true;
      setState({ status: "terminated", startedAt: null, delivery: "not-started" });
      settleTermination();
      return terminationPromise;
    }

    if (state.status === "terminated") {
      settleTermination();
      return terminationPromise;
    }

    if (state.delivery === "failed") {
      deliveryStopped = true;
      setState({
        status: "terminated",
        startedAt: state.startedAt,
        delivery: "failed",
      });
      settleTermination();
      return terminationPromise;
    }

    const startedAt = state.startedAt;
    setState({ status: "terminating", startedAt, delivery: "accepting" });

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

    const terminated = buildTerminatedStatementDraft({
      rootActivityId,
      title: input.courseTitle,
      durationMs,
    });
    admitDraft(terminated, "terminated");
    return terminationPromise;
  }

  return Object.freeze({
    rootActivityId,
    start,
    record,
    terminate,
    getState: () => state,
  });
}
