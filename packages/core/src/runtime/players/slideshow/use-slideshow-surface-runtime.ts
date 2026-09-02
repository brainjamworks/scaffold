import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import type { PresentationGateObservationSnapshot } from "@/runtime/presentation/presentation-progression-gate";
import type { PresentationPlaybackSnapshot } from "@/runtime/presentation/presentation-playback-session";
import type { PresentationFeatureViewBaselinePort } from "@/runtime/presentation/presentation-surface-repositioner";
import { getPresentationContentLayoutPortForEditor } from "@/runtime/presentation/visual/presentation-content-layout-port";

import type { RequestSurfaceChange } from "./slideshow-surface-change";
import {
  assertSlideshowSurfaceRuntimeProgramIdentity,
  createSlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeComposition,
  type SlideshowPresentationControls,
  type SlideshowPresentationNarrationSnapshot,
  type SlideshowPresentationSeekResult,
  type SlideshowSurfaceRuntimeProgram,
  type SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";
import type { SurfaceExitEnvironment } from "./surface-exit-environment";

export type SlideshowNextMode = "navigate" | "disabled";
export type SlideshowContentInteraction = "enabled" | "inert";

export type SlideshowSurfaceRuntimeState =
  | {
      readonly status: "unconfigured";
      readonly nextMode: "navigate";
      readonly contentInteraction: "enabled";
      readonly presentationControls?: never;
      readonly narration?: never;
      readonly seek?: never;
    }
  | {
      readonly status: "pending";
      readonly nextMode: "disabled";
      readonly contentInteraction: SlideshowContentInteraction;
      readonly presentationControls?: never;
      readonly narration?: never;
      readonly seek?: never;
    }
  | {
      readonly status: "ready";
      readonly nextMode: SlideshowNextMode;
      readonly contentInteraction: SlideshowContentInteraction;
      readonly presentationControls?: SlideshowPresentationControls;
      readonly narration?: SlideshowPresentationNarrationSnapshot;
      readonly seek?: (timeMs: number) => Promise<SlideshowPresentationSeekResult>;
    };

interface UseSlideshowSurfaceRuntimeInput {
  readonly activeSurfaceId: SurfaceId | null;
  readonly nextSurfaceId: SurfaceId | null;
  readonly activeSurfaceRoot: HTMLElement | null;
  readonly editor: TiptapEditor | null;
  readonly featureViewBaseline: PresentationFeatureViewBaselinePort;
  readonly programSource?: SlideshowSurfaceRuntimeProgramSource;
  readonly requestSurfaceChange: RequestSurfaceChange;
  readonly surfaceExitEnvironment: SurfaceExitEnvironment;
}

interface MountedSurfaceRuntime {
  readonly surfaceId: SurfaceId;
  readonly editor: TiptapEditor;
  readonly program: SlideshowSurfaceRuntimeProgram;
  readonly surfaceRoot: HTMLElement | null;
  readonly composition: SlideshowSurfaceRuntimeComposition;
}

const NO_PRESENTATION_SNAPSHOT = null;
const NO_NARRATION_SNAPSHOT = null;
const NO_GATE_OBSERVATION = Object.freeze({ status: "inactive" as const });

export function useSlideshowSurfaceRuntime({
  activeSurfaceId,
  nextSurfaceId,
  activeSurfaceRoot,
  editor,
  featureViewBaseline,
  programSource,
  requestSurfaceChange,
  surfaceExitEnvironment,
}: UseSlideshowSurfaceRuntimeInput): SlideshowSurfaceRuntimeState {
  const mediaPort = useMediaPort();
  const program = useMemo(() => {
    if (activeSurfaceId === null || programSource === undefined) return undefined;
    const resolvedProgram = programSource(activeSurfaceId);
    if (resolvedProgram) {
      assertSlideshowSurfaceRuntimeProgramIdentity(activeSurfaceId, resolvedProgram);
    }
    return resolvedProgram;
  }, [activeSurfaceId, programSource]);
  const [mountedRuntime, setMountedRuntime] = useState<MountedSurfaceRuntime | null>(null);
  const [runtimeDefect, setRuntimeDefect] = useState<{ readonly error: unknown } | null>(null);
  const currentRuntime =
    mountedRuntime?.surfaceId === activeSurfaceId &&
    mountedRuntime.editor === editor &&
    mountedRuntime.program === program &&
    mountedRuntime.surfaceRoot === activeSurfaceRoot
      ? mountedRuntime
      : null;

  useEffect(() => {
    if (
      activeSurfaceId === null ||
      editor === null ||
      program === undefined ||
      (program.presentation !== undefined && activeSurfaceRoot === null)
    ) {
      return;
    }

    const controlBindings = getControlBindingRegistryForEditor(editor);
    const semanticTargets = getSemanticTargetInteractionEnvironmentForEditor(editor).coordinator;
    let active = true;
    let composition: SlideshowSurfaceRuntimeComposition | undefined;
    let unregisterPresentationGuard: (() => void) | undefined;
    const cancelReadiness = controlBindings.notifyWhenOwnersMounted(
      deriveRequiredControlBindingOwnerIds(program),
      () => {
        if (!active) return;
        const nextComposition = createSlideshowSurfaceRuntimeComposition({
          surfaceId: activeSurfaceId,
          program,
          controlBindings,
          semanticTargets,
          featureViewBaseline,
          requestSurfaceChange,
          mediaPort,
          contentLayoutPort: getPresentationContentLayoutPortForEditor(editor),
          ...(activeSurfaceRoot === null ? {} : { surfaceRoot: activeSurfaceRoot }),
        });
        composition = nextComposition;
        void (async () => {
          const initialReposition = await nextComposition.seek?.(0);
          if (!active || composition !== nextComposition) return;
          if (initialReposition) {
            if (initialReposition.isErr()) {
              if (initialReposition.error.reason === "seek-out-of-range") {
                throw new Error("Time-zero Slideshow reconstruction was unexpectedly refused.");
              }
            } else if (initialReposition.value.kind === "superseded") {
              throw new Error("Active time-zero Slideshow reconstruction was superseded.");
            }
          }

          if (nextComposition.presentationSurfaceExitGuard) {
            unregisterPresentationGuard = surfaceExitEnvironment.registerGuard(
              nextComposition.presentationSurfaceExitGuard,
            );
          }
          setMountedRuntime({
            surfaceId: activeSurfaceId,
            editor,
            program,
            surfaceRoot: activeSurfaceRoot,
            composition: nextComposition,
          });
        })().catch((error: unknown) => {
          if (!active || composition !== nextComposition) return;
          composition = undefined;
          let firstDefect: unknown = error;
          try {
            unregisterPresentationGuard?.();
          } catch (unregisterError) {
            firstDefect ??= unregisterError;
          }
          unregisterPresentationGuard = undefined;
          try {
            nextComposition.dispose();
          } catch (disposeError) {
            firstDefect ??= disposeError;
          }
          setRuntimeDefect(Object.freeze({ error: firstDefect }));
        });
      },
    );

    return () => {
      active = false;
      cancelReadiness();
      const outgoingComposition = composition;
      composition = undefined;
      const unregisterOutgoingPresentationGuard = unregisterPresentationGuard;
      unregisterPresentationGuard = undefined;
      if (outgoingComposition) {
        setMountedRuntime((candidate) =>
          candidate?.composition === outgoingComposition ? null : candidate,
        );
        let firstDefect: unknown;
        try {
          unregisterOutgoingPresentationGuard?.();
        } catch (error) {
          firstDefect = error;
        }
        try {
          outgoingComposition.dispose();
        } catch (error) {
          firstDefect ??= error;
        }
        if (firstDefect !== undefined) throw firstDefect;
      }
    };
  }, [
    activeSurfaceId,
    activeSurfaceRoot,
    editor,
    featureViewBaseline,
    mediaPort,
    program,
    requestSurfaceChange,
    surfaceExitEnvironment,
  ]);

  const presentationControls = currentRuntime?.composition.presentationControls;
  const currentComposition = currentRuntime?.composition;
  const seek = useMemo(
    () => currentComposition?.seek?.bind(currentComposition),
    [currentComposition],
  );
  const subscribe = useCallback(
    (listener: () => void) => presentationControls?.subscribe(listener) ?? (() => undefined),
    [presentationControls],
  );
  const getSnapshot = useCallback(
    () => presentationControls?.getSnapshot() ?? NO_PRESENTATION_SNAPSHOT,
    [presentationControls],
  );
  const presentationSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const getNarrationSnapshot = useCallback(
    () => presentationControls?.getNarrationSnapshot() ?? NO_NARRATION_SNAPSHOT,
    [presentationControls],
  );
  const narrationSnapshot = useSyncExternalStore(
    subscribe,
    getNarrationSnapshot,
    getNarrationSnapshot,
  );
  const learnerRuntime = currentRuntime?.composition.learnerRuntime;
  const subscribeGateObservation = useCallback(
    (listener: () => void) =>
      learnerRuntime?.subscribeGateObservation(() => {
        if (learnerRuntime.getGateObservationSnapshot().status === "satisfaction-observed") {
          // Commit closing inertness before the learner runtime enters the responsible rule turn.
          flushSync(listener);
          return;
        }
        listener();
      }) ?? (() => undefined),
    [learnerRuntime],
  );
  const getGateObservationSnapshot = useCallback(
    () => learnerRuntime?.getGateObservationSnapshot() ?? NO_GATE_OBSERVATION,
    [learnerRuntime],
  );
  const gateObservation = useSyncExternalStore(
    subscribeGateObservation,
    getGateObservationSnapshot,
    getGateObservationSnapshot,
  );

  useEffect(() => {
    if (!program?.presentation?.autoAdvance || !presentationControls || !presentationSnapshot) {
      return;
    }
    if (presentationSnapshot.phase === "awaiting-start") {
      void presentationControls.play();
      return;
    }
    if (presentationSnapshot.phase === "completed" && nextSurfaceId !== null) {
      void requestSurfaceChange(nextSurfaceId);
    }
  }, [
    nextSurfaceId,
    presentationControls,
    presentationSnapshot,
    program?.presentation?.autoAdvance,
    requestSurfaceChange,
  ]);

  if (runtimeDefect) throw runtimeDefect.error;
  if (program === undefined) {
    return { status: "unconfigured", nextMode: "navigate", contentInteraction: "enabled" };
  }
  if (!currentRuntime) {
    return {
      status: "pending",
      nextMode: "disabled",
      contentInteraction: program.presentation ? "inert" : "enabled",
    };
  }
  return {
    status: "ready",
    nextMode: derivePresentationNextMode(presentationSnapshot),
    contentInteraction: deriveContentInteraction(
      presentationSnapshot,
      gateObservation,
      program.presentation !== undefined,
    ),
    ...(presentationControls ? { presentationControls } : {}),
    ...(narrationSnapshot ? { narration: narrationSnapshot } : {}),
    ...(seek ? { seek } : {}),
  };
}

export function deriveRequiredControlBindingOwnerIds(
  program: SlideshowSurfaceRuntimeProgram,
): readonly EmbeddedNodeId[] {
  const ownerIds = new Set<EmbeddedNodeId>();

  if (program.learnerInteractions) {
    for (const rules of program.learnerInteractions.rulesByEvent.values()) {
      for (const rule of rules) {
        ownerIds.add(rule.when.ownerId);
        for (const condition of rule.conditions) ownerIds.add(condition.ownerId);
        for (const command of rule.commands) {
          if (command.kind === "target-command") ownerIds.add(command.ownerId);
        }
      }
    }
  }
  if (program.presentation) {
    for (const wait of program.presentation.timeline.waits) {
      if (wait.kind === "learner-wait") ownerIds.add(wait.requirement.ownerId);
    }
    for (const cue of program.presentation.timeline.cues) {
      if (cue.command.kind === "target-command") ownerIds.add(cue.command.ownerId);
    }
  }

  return Object.freeze([...ownerIds]);
}

function derivePresentationNextMode(
  snapshot: PresentationPlaybackSnapshot | null,
): SlideshowNextMode {
  return snapshot === null || snapshot.phase === "completed" ? "navigate" : "disabled";
}

function deriveContentInteraction(
  presentationSnapshot: PresentationPlaybackSnapshot | null,
  gateObservation: PresentationGateObservationSnapshot,
  hasConfiguredPresentation: boolean,
): SlideshowContentInteraction {
  if (!hasConfiguredPresentation) return "enabled";

  return presentationSnapshot?.phase === "held" &&
    presentationSnapshot.hold.kind === "learner" &&
    presentationSnapshot.hold.status === "waiting" &&
    gateObservation.status === "awaiting-satisfaction"
    ? "enabled"
    : "inert";
}
