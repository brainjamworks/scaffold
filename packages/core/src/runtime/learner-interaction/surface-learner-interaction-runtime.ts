import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  ControlBinding,
  ControlEvent,
  ControlBindingRegistry,
  EventSource,
} from "@/document/control-binding/control-binding";
import type { SemanticInteractionOrigin } from "@/document/semantic-target-interaction/semantic-target-interaction";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type { CompiledLearnerRequirement } from "@/runtime/presentation/compiled-presentation-program";
import type {
  PresentationGateObservationPort,
  PresentationGateObservationSnapshot,
  PresentationGatePort,
} from "@/runtime/presentation/presentation-progression-gate";

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
  readonly surfaceNavigation: SurfaceLearnerInteractionNavigationPort;
  readonly semanticInteractionOrigin: Extract<
    SemanticInteractionOrigin,
    "author-preview" | "learner-interaction-rule"
  >;
}

export interface SurfaceLearnerInteractionNavigationContext {
  readonly satisfiesActiveLearnerRequirement: boolean;
}

export interface SurfaceLearnerInteractionNavigationPort {
  navigate(
    surfaceId: EmbeddedNodeId,
    signal: AbortSignal,
    context: SurfaceLearnerInteractionNavigationContext,
  ): ReturnType<LearnerInteractionSurfaceNavigationPort["navigate"]>;
}

export interface SurfaceLearnerInteractionRuntime
  extends PresentationGatePort, PresentationGateObservationPort {
  subscribeReports(listener: (report: LearnerInteractionTurnReport) => void): () => void;
  dispose(): void;
}

const INACTIVE_GATE_OBSERVATION = Object.freeze({ status: "inactive" as const });
const AWAITING_GATE_OBSERVATION = Object.freeze({ status: "awaiting-satisfaction" as const });
const SATISFIED_GATE_OBSERVATION = Object.freeze({ status: "satisfaction-observed" as const });

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
  const gateObservationListeners = new Set<() => void>();
  const queuedEvents: QueuedLearnerEvent[] = [];
  const disposalReason = new Error("Surface Learner Interaction runtime was disposed.");
  let phase: RuntimePhase = "active";
  let draining = false;
  let nextTurnNumber = 1;
  let currentOperation: AbortController | undefined;
  let activeGate: ActiveGate | undefined;
  let gateObservation: PresentationGateObservationSnapshot = INACTIVE_GATE_OBSERVATION;

  try {
    for (const { ownerId, eventSource } of eventSources) {
      unsubscribeOwners.push(eventSource.subscribe((event) => receiveEvent(ownerId, event)));
    }
  } catch (error) {
    unsubscribeAllOwners(unsubscribeOwners);
    throw error;
  }

  const runtime: SurfaceLearnerInteractionRuntime = {
    waitUntilSatisfied(requirement, { signal }) {
      if (phase !== "active") {
        throw new Error("Cannot wait for learner satisfaction after runtime termination.");
      }
      if (activeGate) {
        throw new Error("Cannot register a second learner requirement while one is active.");
      }
      if (signal.aborted) return new Promise<void>(() => undefined);
      if (requirement.kind === "state") {
        const binding = requireGateBinding(requirement.ownerId);
        const stateReader = binding.stateReader;
        if (!stateReader) {
          throw new Error(
            `Presentation learner gate owner "${requirement.ownerId}" has no State Reader.`,
          );
        }
        if (
          stateReader.read({ targetId: requirement.targetId, key: requirement.key }) ===
          requirement.equals
        ) {
          return Promise.resolve();
        }
        const eventSource = binding.eventSource;
        if (!eventSource) {
          throw new Error(
            `Presentation learner gate owner "${requirement.ownerId}" has no Event Source.`,
          );
        }
        const dynamicUnsubscribe = subscribeGateOwner(requirement.ownerId, binding, eventSource);
        let resolve!: () => void;
        const promise = new Promise<void>((resolvePromise) => {
          resolve = resolvePromise;
        });
        const gate: ActiveStateGate = {
          kind: "state",
          requirement,
          binding,
          signal,
          resolve,
          dynamicUnsubscribe,
          onAbort: () => cancelGate(gate),
        };
        activeGate = gate;
        signal.addEventListener("abort", gate.onAbort, { once: true });
        publishGateObservation(AWAITING_GATE_OBSERVATION);
        if (signal.aborted) cancelGate(gate);
        return promise;
      }

      const binding = requireGateBinding(requirement.ownerId);
      const eventSource = binding.eventSource;
      if (!eventSource) {
        throw new Error(
          `Presentation learner gate owner "${requirement.ownerId}" has no Event Source.`,
        );
      }
      const dynamicUnsubscribe = subscribeGateOwner(requirement.ownerId, binding, eventSource);
      let resolve!: () => void;
      const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
      });
      const gate: ActiveEventGate = {
        kind: "event",
        requirement,
        binding,
        signal,
        resolve,
        dynamicUnsubscribe,
        onAbort: () => cancelGate(gate),
      };
      activeGate = gate;
      signal.addEventListener("abort", gate.onAbort, { once: true });
      publishGateObservation(AWAITING_GATE_OBSERVATION);
      if (signal.aborted) cancelGate(gate);
      return promise;
    },

    getGateObservationSnapshot() {
      if (phase === "disposed") {
        throw new Error(
          "Cannot read gate observation after Surface Learner Interaction termination.",
        );
      }
      return gateObservation;
    },

    subscribeGateObservation(listener) {
      if (phase !== "active") {
        throw new Error(
          "Cannot subscribe to gate observation after Surface Learner Interaction termination.",
        );
      }
      gateObservationListeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        gateObservationListeners.delete(listener);
      };
    },

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
      gateObservationListeners.clear();
      cancelGate(activeGate);
      currentOperation?.abort(disposalReason);
      unsubscribeAllOwners(unsubscribeOwners);
    },
  };

  return Object.freeze(runtime);

  function receiveEvent(ownerId: EmbeddedNodeId, event: ControlEvent): Promise<void> | undefined {
    if (phase !== "active") return;
    const queued: QueuedLearnerEvent = {
      ownerId,
      event: { targetId: event.targetId, type: event.type },
    };
    if (
      activeGate?.kind === "event" &&
      !activeGate.matchingEvent &&
      activeGate.requirement.ownerId === ownerId &&
      activeGate.requirement.targetId === event.targetId &&
      activeGate.requirement.type === event.type
    ) {
      activeGate.matchingEvent = queued;
      queued.matchingEventGate = activeGate;
      queued.requiresGateObservationBoundary = true;
      publishGateObservation(SATISFIED_GATE_OBSERVATION);
    } else if (activeGate?.kind === "state" && stateGateIsSatisfied(activeGate)) {
      queued.requiresGateObservationBoundary = true;
      publishGateObservation(SATISFIED_GATE_OBSERVATION);
    }
    queuedEvents.push(queued);
    return startDrain();
  }

  function startDrain(): Promise<void> | undefined {
    if (draining || phase !== "active") return;
    draining = true;
    return drainQueuedEvents().then(
      () => {
        draining = false;
        if (queuedEvents.length > 0) void startDrain();
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
      if (queued.requiresGateObservationBoundary) {
        await waitForNextTask();
        if (phase !== "active") return;
      }
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
          surfaceNavigation: {
            navigate(targetSurfaceId, signal) {
              return surfaceNavigation.navigate(
                targetSurfaceId,
                signal,
                Object.freeze({
                  satisfiesActiveLearnerRequirement:
                    currentTurnSatisfiesActiveLearnerRequirement(queued),
                }),
              );
            },
          },
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
      if (queued.matchingEventGate && activeGate === queued.matchingEventGate) {
        assertCurrentEventGateBinding(queued.matchingEventGate);
        satisfyGate(queued.matchingEventGate);
      } else if (activeGate?.kind === "state" && stateGateIsSatisfied(activeGate)) {
        satisfyGate(activeGate);
      } else if (activeGate?.kind === "state") {
        publishGateObservation(AWAITING_GATE_OBSERVATION);
      }
    }
  }

  function terminate(nextPhase: Exclude<RuntimePhase, "active" | "disposed">): void {
    if (phase !== "active") return;
    phase = nextPhase;
    queuedEvents.length = 0;
    reportListeners.clear();
    cancelGate(activeGate);
    gateObservationListeners.clear();
    unsubscribeAllOwners(unsubscribeOwners);
  }

  function requireGateBinding(ownerId: EmbeddedNodeId): ControlBinding {
    const binding = controlBindings.get(ownerId);
    if (!binding) {
      throw new Error(
        `Presentation learner gate owner "${ownerId}" has no current Control Binding.`,
      );
    }
    if (binding.ownerId !== ownerId) {
      throw new Error(`Presentation learner gate owner "${ownerId}" has a stale Control Binding.`);
    }
    const staticOwner = eventSources.find(({ ownerId: candidateId }) => candidateId === ownerId);
    if (staticOwner && staticOwner.binding !== binding) {
      throw new Error(`Presentation learner gate owner "${ownerId}" has a stale Control Binding.`);
    }
    return binding;
  }

  function subscribeGateOwner(
    ownerId: EmbeddedNodeId,
    binding: ControlBinding,
    eventSource: EventSource,
  ): (() => void) | undefined {
    const staticOwner = eventSources.find(({ ownerId: candidateId }) => candidateId === ownerId);
    if (staticOwner) {
      if (staticOwner.binding !== binding) {
        throw new Error(
          `Presentation learner gate owner "${ownerId}" has a stale Control Binding.`,
        );
      }
      return undefined;
    }
    return eventSource.subscribe((event) => receiveEvent(ownerId, event));
  }

  function stateGateIsSatisfied(gate: ActiveStateGate): boolean {
    const binding = requireGateBinding(gate.requirement.ownerId);
    if (binding !== gate.binding) {
      throw new Error(
        `Presentation learner gate owner "${gate.requirement.ownerId}" has a stale Control Binding.`,
      );
    }
    const stateReader = binding.stateReader;
    if (!stateReader) {
      throw new Error(
        `Presentation learner gate owner "${gate.requirement.ownerId}" has no State Reader.`,
      );
    }
    return (
      stateReader.read({ targetId: gate.requirement.targetId, key: gate.requirement.key }) ===
      gate.requirement.equals
    );
  }

  function currentTurnSatisfiesActiveLearnerRequirement(queued: QueuedLearnerEvent): boolean {
    const gate = activeGate;
    if (!gate) return false;
    if (gate.kind === "state") return stateGateIsSatisfied(gate);
    if (queued.matchingEventGate !== gate) return false;
    assertCurrentEventGateBinding(gate);
    return true;
  }

  function assertCurrentEventGateBinding(gate: ActiveEventGate): void {
    const binding = requireGateBinding(gate.requirement.ownerId);
    if (binding !== gate.binding) {
      throw new Error(
        `Presentation learner gate owner "${gate.requirement.ownerId}" has a stale Control Binding.`,
      );
    }
  }

  function cancelGate(gate: ActiveGate | undefined): void {
    if (!gate || activeGate !== gate) return;
    activeGate = undefined;
    gate.signal.removeEventListener("abort", gate.onAbort);
    gate.dynamicUnsubscribe?.();
    publishGateObservation(INACTIVE_GATE_OBSERVATION);
  }

  function satisfyGate(gate: ActiveGate): void {
    cancelGate(gate);
    gate.resolve();
  }

  function publishGateObservation(next: PresentationGateObservationSnapshot): void {
    if (gateObservation.status === next.status) return;
    gateObservation = next;
    for (const listener of [...gateObservationListeners]) listener();
  }
}

type RuntimePhase = "active" | "disposed" | "navigation-committed" | "faulted";

interface QueuedLearnerEvent {
  readonly ownerId: EmbeddedNodeId;
  readonly event: ControlEvent;
  matchingEventGate?: ActiveEventGate;
  requiresGateObservationBoundary?: boolean;
}

function waitForNextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface ActiveEventGate {
  readonly kind: "event";
  readonly requirement: Extract<CompiledLearnerRequirement, { readonly kind: "event" }>;
  readonly binding: ControlBinding;
  readonly signal: AbortSignal;
  readonly resolve: () => void;
  readonly onAbort: () => void;
  readonly dynamicUnsubscribe: (() => void) | undefined;
  matchingEvent?: QueuedLearnerEvent;
}

interface ActiveStateGate {
  readonly kind: "state";
  readonly requirement: Extract<CompiledLearnerRequirement, { readonly kind: "state" }>;
  readonly binding: ControlBinding;
  readonly signal: AbortSignal;
  readonly resolve: () => void;
  readonly onAbort: () => void;
  readonly dynamicUnsubscribe: (() => void) | undefined;
}

type ActiveGate = ActiveEventGate | ActiveStateGate;

interface StaticOwnerEventSource {
  readonly ownerId: EmbeddedNodeId;
  readonly binding: ControlBinding;
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
    return { ownerId, binding, eventSource };
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
