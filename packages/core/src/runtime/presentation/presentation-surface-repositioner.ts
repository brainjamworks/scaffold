import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  CompiledInternalClockSurfaceTimeline,
  CompiledPresentationCue,
} from "./compiled-presentation-program";
import type {
  PresentationCueExecutionOutcome,
  PresentationCueExecutor,
} from "./presentation-cue-executor";

export interface PresentationFeatureViewBaselinePort {
  replaceForOwners(ownerIds: readonly EmbeddedNodeId[]): void;
}

export interface PresentationRepositionCueReport {
  readonly cueId: string;
  readonly scheduledAtMs: number;
  readonly outcome: PresentationCueExecutionOutcome;
}

export type PresentationRepositionReport =
  | {
      readonly kind: "applied";
      readonly timeMs: number;
      readonly cueReports: readonly PresentationRepositionCueReport[];
    }
  | {
      readonly kind: "superseded";
      readonly timeMs: number;
      readonly cueReports: readonly PresentationRepositionCueReport[];
    };

export interface PresentationSurfaceRepositioner {
  reposition(timeMs: number): Promise<PresentationRepositionReport>;
  dispose(): void;
}

export function createPresentationSurfaceRepositioner({
  timeline,
  featureViewBaseline,
  cueExecutor,
}: {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly featureViewBaseline: PresentationFeatureViewBaselinePort;
  readonly cueExecutor: PresentationCueExecutor;
}): PresentationSurfaceRepositioner {
  const reconstructableCues = timeline.cues.filter(
    (cue) => cue.seekBehavior === "reconstruct-state",
  );
  const reconstructableOwnerIds = Object.freeze([
    ...new Set(reconstructableCues.map(({ command }) => command.ownerId)),
  ]);
  let requestGeneration = 0;
  let activeController: AbortController | undefined;
  let disposed = false;

  return Object.freeze({
    async reposition(timeMs: number): Promise<PresentationRepositionReport> {
      if (disposed) throw new Error("Disposed presentation repositioner cannot reposition.");
      assertRepositionTime(timeMs, timeline.durationMs);
      activeController?.abort();
      const generation = ++requestGeneration;
      const cueReports: PresentationRepositionCueReport[] = [];
      const controller = new AbortController();
      activeController = controller;
      const isSuperseded = (): boolean =>
        disposed || generation !== requestGeneration || controller.signal.aborted;

      try {
        featureViewBaseline.replaceForOwners(reconstructableOwnerIds);
        for (const cue of reconstructableCues) {
          if (isSuperseded()) return freezeReport("superseded", timeMs, cueReports);
          if (cue.atMs > timeMs) break;

          let outcome: PresentationCueExecutionOutcome;
          try {
            outcome = await cueExecutor.execute({
              command: cue.command,
              signal: controller.signal,
            });
          } catch (error) {
            if (isSuperseded()) return freezeReport("superseded", timeMs, cueReports);
            throw error;
          }
          if (isSuperseded()) return freezeReport("superseded", timeMs, cueReports);
          cueReports.push(freezeCueReport(cue, outcome));
        }
        return freezeReport("applied", timeMs, cueReports);
      } finally {
        if (activeController === controller) activeController = undefined;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      requestGeneration += 1;
      activeController?.abort();
      activeController = undefined;
    },
  });
}

function freezeCueReport(
  cue: CompiledPresentationCue,
  outcome: PresentationCueExecutionOutcome,
): PresentationRepositionCueReport {
  return Object.freeze({
    cueId: cue.id,
    scheduledAtMs: cue.atMs,
    outcome: freezeOutcome(outcome),
  });
}

function freezeOutcome(outcome: PresentationCueExecutionOutcome): PresentationCueExecutionOutcome {
  if (outcome.kind === "succeeded") return Object.freeze({ kind: outcome.kind });
  if (outcome.kind === "target-not-reached") {
    return Object.freeze({ kind: outcome.kind, result: Object.freeze({ ...outcome.result }) });
  }
  return Object.freeze({ kind: outcome.kind, error: Object.freeze({ ...outcome.error }) });
}

function freezeReport(
  kind: PresentationRepositionReport["kind"],
  timeMs: number,
  cueReports: readonly PresentationRepositionCueReport[],
): PresentationRepositionReport {
  return Object.freeze({ kind, timeMs, cueReports: Object.freeze([...cueReports]) });
}

function assertRepositionTime(timeMs: number, durationMs: number): void {
  if (!Number.isSafeInteger(timeMs) || timeMs < 0 || timeMs > durationMs) {
    throw new Error(
      `Presentation reposition time must be a safe integer between 0 and ${durationMs}.`,
    );
  }
}
