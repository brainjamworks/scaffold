import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  ControlEvent,
  ControlBindingRegistry,
  EventSource,
} from "@/document/control-binding/control-binding";
import type { SemanticInteractionOrigin } from "@/document/semantic-target-interaction/semantic-target-interaction";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";

import type { CompiledSurfaceLearnerInteractionProgram } from "./compiled-learner-interaction-program";
import type {
  LearnerInteractionSurfaceNavigationPort,
  LearnerInteractionTurnReport,
} from "./learner-interaction-event-turn";
import { executeLearnerInteractionEventTurn } from "./learner-interaction-event-turn";

export interface CreateSurfaceLearnerInteractionRuntimeInput {
  readonly program: CompiledSurfaceLearnerInteractionProgram;
  readonly controlBindings: Pick<ControlBindingRegistry, "get">;
  readonly semanticTargets: SemanticTargetInteractionCoordinator;
  readonly surfaceNavigation: LearnerInteractionSurfaceNavigationPort;
  readonly semanticInteractionOrigin: Extract<
    SemanticInteractionOrigin,
    "author-preview" | "learner-interaction-rule"
  >;
}

export interface SurfaceLearnerInteractionRuntime {
  subscribeReports(listener: (report: LearnerInteractionTurnReport) => void): () => void;
  dispose(): void;
}

export function createSurfaceLearnerInteractionRuntime({
  program,
  controlBindings,
  semanticTargets,
  surfaceNavigation,
  semanticInteractionOrigin,
}: CreateSurfaceLearnerInteractionRuntimeInput): SurfaceLearnerInteractionRuntime {
  const eventSources = requireStaticEventSources(program, controlBindings);
  const unsubscribeOwners: (() => void)[] = [];
  const reportListeners = new Set<(report: LearnerInteractionTurnReport) => void>();
  const queuedEvents: QueuedLearnerEvent[] = [];
  const disposalReason = new Error("Surface Learner Interaction runtime was disposed.");
  let phase: RuntimePhase = "active";
  let draining = false;
  let nextTurnNumber = 1;
  let currentOperation: AbortController | undefined;

  try {
    for (const { ownerId, eventSource } of eventSources) {
      unsubscribeOwners.push(
        eventSource.subscribe((event) => {
          if (phase !== "active") return;
          queuedEvents.push({
            ownerId,
            event: { targetId: event.targetId, type: event.type },
          });
          startDrain();
        }),
      );
    }
  } catch (error) {
    unsubscribeAllOwners(unsubscribeOwners);
    throw error;
  }

  const runtime: SurfaceLearnerInteractionRuntime = {
    subscribeReports(listener) {
      if (phase !== "active") {
        throw new Error(
          phase === "disposed"
            ? "Cannot subscribe to reports after Surface Learner Interaction disposal."
            : "Cannot subscribe to reports after Surface Learner Interaction termination.",
        );
      }
      reportListeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        reportListeners.delete(listener);
      };
    },

    dispose() {
      if (phase !== "active") return;
      phase = "disposed";
      queuedEvents.length = 0;
      reportListeners.clear();
      currentOperation?.abort(disposalReason);
      unsubscribeAllOwners(unsubscribeOwners);
    },
  };

  return Object.freeze(runtime);

  function startDrain(): void {
    if (draining || phase !== "active") return;
    draining = true;
    void drainQueuedEvents().then(
      () => {
        draining = false;
        startDrain();
      },
      (error: unknown) => {
        draining = false;
        if (phase === "disposed" && error === disposalReason) return;
        terminate("faulted");
        throw error;
      },
    );
  }

  async function drainQueuedEvents(): Promise<void> {
    while (phase === "active") {
      const queued = queuedEvents.shift();
      if (!queued) return;
      const operation = new AbortController();
      currentOperation = operation;
      let report: LearnerInteractionTurnReport;
      try {
        report = await executeLearnerInteractionEventTurn({
          turnNumber: nextTurnNumber,
          ownerId: queued.ownerId,
          event: queued.event,
          program,
          controlBindings,
          semanticTargets,
          surfaceNavigation,
          semanticInteractionOrigin,
          signal: operation.signal,
        });
      } finally {
        if (currentOperation === operation) currentOperation = undefined;
      }
      nextTurnNumber += 1;
      if (phase !== "active") return;

      for (const listener of [...reportListeners]) {
        if (phase !== "active") return;
        listener(report);
      }
      if (phase !== "active") return;
      if (report.end === "surface-navigation-committed") {
        terminate("navigation-committed");
        return;
      }
    }
  }

  function terminate(nextPhase: Exclude<RuntimePhase, "active" | "disposed">): void {
    if (phase !== "active") return;
    phase = nextPhase;
    queuedEvents.length = 0;
    reportListeners.clear();
    unsubscribeAllOwners(unsubscribeOwners);
  }
}

type RuntimePhase = "active" | "disposed" | "navigation-committed" | "faulted";

interface QueuedLearnerEvent {
  readonly ownerId: EmbeddedNodeId;
  readonly event: ControlEvent;
}

interface StaticOwnerEventSource {
  readonly ownerId: EmbeddedNodeId;
  readonly eventSource: EventSource;
}

function requireStaticEventSources(
  program: CompiledSurfaceLearnerInteractionProgram,
  controlBindings: Pick<ControlBindingRegistry, "get">,
): readonly StaticOwnerEventSource[] {
  const ownerIds = new Set<EmbeddedNodeId>();
  for (const rules of program.rulesByEvent.values()) {
    for (const rule of rules) ownerIds.add(rule.when.ownerId);
  }

  return [...ownerIds].map((ownerId) => {
    const binding = controlBindings.get(ownerId);
    if (!binding) {
      throw new Error(
        `Surface Learner Interaction owner "${ownerId}" has no current Control Binding.`,
      );
    }
    const eventSource = binding.eventSource;
    if (!eventSource) {
      throw new Error(`Surface Learner Interaction owner "${ownerId}" has no Event Source.`);
    }
    return { ownerId, eventSource };
  });
}

function unsubscribeAllOwners(unsubscribeOwners: (() => void)[]): void {
  let firstDefect: unknown;
  for (const unsubscribe of unsubscribeOwners.splice(0)) {
    try {
      unsubscribe();
    } catch (error) {
      firstDefect ??= error;
    }
  }
  if (firstDefect !== undefined) throw firstDefect;
}
