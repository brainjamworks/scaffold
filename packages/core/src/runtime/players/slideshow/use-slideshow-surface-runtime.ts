import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import type { PresentationGateObservationSnapshot } from "@/runtime/presentation/presentation-progression-gate";
import type {
  PresentationPlaybackSession,
  PresentationPlaybackSnapshot,
} from "@/runtime/presentation/presentation-playback-session";

import { createPresentationWaitSurfaceExitGuard } from "./presentation-wait-surface-exit-guard";
import type { RequestSurfaceChange } from "./slideshow-surface-change";
import {
  assertSlideshowSurfaceRuntimeProgramIdentity,
  createSlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeProgram,
  type SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";
import type { SurfaceExitEnvironment } from "./surface-exit-environment";

export type SlideshowNextMode = "play" | "advance" | "navigate" | "disabled";
export type SlideshowContentInteraction = "enabled" | "inert";

export type SlideshowSurfaceRuntimeState =
  | {
      readonly status: "unconfigured";
      readonly nextMode: "navigate";
      readonly contentInteraction: "enabled";
      readonly presentationSession?: never;
    }
  | {
      readonly status: "pending";
      readonly nextMode: "disabled";
      readonly contentInteraction: SlideshowContentInteraction;
      readonly presentationSession?: never;
    }
  | {
      readonly status: "ready";
      readonly nextMode: SlideshowNextMode;
      readonly contentInteraction: SlideshowContentInteraction;
      readonly presentationSession?: PresentationPlaybackSession;
    };

interface UseSlideshowSurfaceRuntimeInput {
  readonly activeSurfaceId: SurfaceId | null;
  readonly editor: TiptapEditor | null;
  readonly programSource?: SlideshowSurfaceRuntimeProgramSource;
  readonly requestSurfaceChange: RequestSurfaceChange;
  readonly surfaceExitEnvironment: SurfaceExitEnvironment;
}

interface MountedSurfaceRuntime {
  readonly surfaceId: SurfaceId;
  readonly editor: TiptapEditor;
  readonly program: SlideshowSurfaceRuntimeProgram;
  readonly composition: SlideshowSurfaceRuntimeComposition;
}

const NO_PRESENTATION_SNAPSHOT = null;
const NO_GATE_OBSERVATION = Object.freeze({ status: "inactive" as const });

export function useSlideshowSurfaceRuntime({
  activeSurfaceId,
  editor,
  programSource,
  requestSurfaceChange,
  surfaceExitEnvironment,
}: UseSlideshowSurfaceRuntimeInput): SlideshowSurfaceRuntimeState {
  const program = useMemo(() => {
    if (activeSurfaceId === null || programSource === undefined) return undefined;
    const resolvedProgram = programSource(activeSurfaceId);
    if (resolvedProgram) {
      assertSlideshowSurfaceRuntimeProgramIdentity(activeSurfaceId, resolvedProgram);
    }
    return resolvedProgram;
  }, [activeSurfaceId, programSource]);
  const [mountedRuntime, setMountedRuntime] = useState<MountedSurfaceRuntime | null>(null);
  const currentRuntime =
    mountedRuntime?.surfaceId === activeSurfaceId &&
    mountedRuntime.editor === editor &&
    mountedRuntime.program === program
      ? mountedRuntime
      : null;

  useEffect(() => {
    if (activeSurfaceId === null || editor === null || program === undefined) return;

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
          requestSurfaceChange,
        });
        let nextUnregisterPresentationGuard: (() => void) | undefined;
        try {
          if (nextComposition.presentationSession) {
            nextUnregisterPresentationGuard = surfaceExitEnvironment.registerGuard(
              createPresentationWaitSurfaceExitGuard({
                surfaceId: activeSurfaceId,
                session: nextComposition.presentationSession,
              }),
            );
          }
        } catch (error) {
          nextComposition.dispose();
          throw error;
        }
        composition = nextComposition;
        unregisterPresentationGuard = nextUnregisterPresentationGuard;
        setMountedRuntime({
          surfaceId: activeSurfaceId,
          editor,
          program,
          composition: nextComposition,
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
  }, [activeSurfaceId, editor, program, requestSurfaceChange, surfaceExitEnvironment]);

  const presentationSession = currentRuntime?.composition.presentationSession;
  const subscribe = useCallback(
    (listener: () => void) => presentationSession?.subscribe(listener) ?? (() => undefined),
    [presentationSession],
  );
  const getSnapshot = useCallback(
    () => presentationSession?.getSnapshot() ?? NO_PRESENTATION_SNAPSHOT,
    [presentationSession],
  );
  const presentationSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const learnerRuntime = currentRuntime?.composition.learnerRuntime;
  const subscribeGateObservation = useCallback(
    (listener: () => void) =>
      learnerRuntime?.subscribeGateObservation(() => {
        // Commit closing inertness before the learner runtime enters the responsible rule turn.
        flushSync(listener);
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
    ...(presentationSession ? { presentationSession } : {}),
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
      ownerIds.add(cue.command.ownerId);
    }
  }

  return Object.freeze([...ownerIds]);
}

function derivePresentationNextMode(
  snapshot: PresentationPlaybackSnapshot | null,
): SlideshowNextMode {
  if (snapshot === null || snapshot.phase === "completed") return "navigate";

  switch (snapshot.phase) {
    case "awaiting-start":
      return "play";
    case "held":
      return snapshot.hold.kind === "manual" || snapshot.hold.status === "ready"
        ? "advance"
        : "disabled";
    case "playing":
    case "paused":
    case "stopped":
      return "disabled";
  }
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
