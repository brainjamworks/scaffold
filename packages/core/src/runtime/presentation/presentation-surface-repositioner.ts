import type { EmbeddedNodeId } from "@scaffold/contracts";

import {
  comparePresentationPlaybackPositions,
  presentationActionStartPosition,
  type PresentationPlaybackPosition,
} from "@/presentation/model";

import type {
  CompiledInternalClockSurfaceTimeline,
  CompiledPresentationCue,
} from "./compiled-presentation-program";
import type {
  PresentationCueExecutionOutcome,
  PresentationFeatureStateReconstructor,
} from "./presentation-cue-executor";

export interface PresentationFeatureViewBaselinePort {
  replaceForOwners(
    ownerIds: readonly EmbeddedNodeId[],
    options: { readonly signal: AbortSignal },
  ): void | Promise<void>;
}

export interface PresentationRepositionCueReport {
  readonly cueId: string;
  readonly scheduledAtMs: number;
  readonly outcome: PresentationCueExecutionOutcome;
}

export type PresentationRepositionReport =
  | {
      readonly kind: "applied";
      readonly position: PresentationPlaybackPosition;
      readonly cueReports: readonly PresentationRepositionCueReport[];
    }
  | {
      readonly kind: "superseded";
      readonly position: PresentationPlaybackPosition;
      readonly cueReports: readonly PresentationRepositionCueReport[];
    };

export interface PresentationSurfaceRepositioner {
  reposition(position: PresentationPlaybackPosition): Promise<PresentationRepositionReport>;
  cancel(): void;
  dispose(): void;
}

export function createPresentationSurfaceRepositioner({
  timeline,
  featureViewBaseline,
  featureStateReconstructor,
}: {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly featureViewBaseline: PresentationFeatureViewBaselinePort;
  readonly featureStateReconstructor: PresentationFeatureStateReconstructor;
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
    async reposition(
      position: PresentationPlaybackPosition,
    ): Promise<PresentationRepositionReport> {
      if (disposed) throw new Error("Disposed presentation repositioner cannot reposition.");
      assertRepositionPosition(position, timeline.durationMs);
      activeController?.abort();
      const generation = ++requestGeneration;
      const cueReports: PresentationRepositionCueReport[] = [];
      const controller = new AbortController();
      activeController = controller;
      const isSuperseded = (): boolean =>
        disposed || generation !== requestGeneration || controller.signal.aborted;

      try {
        const baselineReplacement = featureViewBaseline.replaceForOwners(reconstructableOwnerIds, {
          signal: controller.signal,
        });
        if (baselineReplacement) await baselineReplacement;
        if (isSuperseded()) return freezeReport("superseded", position, cueReports);
        for (const cue of reconstructableCues) {
          if (isSuperseded()) return freezeReport("superseded", position, cueReports);
          if (
            comparePresentationPlaybackPositions(
              presentationActionStartPosition(cue.atMs),
              position,
            ) > 0
          ) {
            break;
          }

          let outcome: PresentationCueExecutionOutcome;
          try {
            outcome = await featureStateReconstructor.reconstruct({
              command: cue.command,
              signal: controller.signal,
            });
          } catch (error) {
            if (isSuperseded()) return freezeReport("superseded", position, cueReports);
            throw error;
          }
          if (isSuperseded()) return freezeReport("superseded", position, cueReports);
          cueReports.push(freezeCueReport(cue, outcome));
        }
        return freezeReport("applied", position, cueReports);
      } finally {
        if (activeController === controller) activeController = undefined;
      }
    },
    cancel(): void {
      requestGeneration += 1;
      activeController?.abort();
      activeController = undefined;
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
  position: PresentationPlaybackPosition,
  cueReports: readonly PresentationRepositionCueReport[],
): PresentationRepositionReport {
  return Object.freeze({
    kind,
    position: Object.freeze({ ...position }),
    cueReports: Object.freeze([...cueReports]),
  });
}

function assertRepositionPosition(
  position: PresentationPlaybackPosition,
  durationMs: number,
): void {
  if (
    !Number.isSafeInteger(position.timeMs) ||
    position.timeMs < 0 ||
    position.timeMs > durationMs
  ) {
    throw new Error(
      `Presentation reposition time must be a safe integer between 0 and ${durationMs}.`,
    );
  }
  if (position.side !== "before-actions" && position.side !== "after-actions") {
    throw new Error(`Presentation reposition side "${String(position.side)}" is invalid.`);
  }
}
