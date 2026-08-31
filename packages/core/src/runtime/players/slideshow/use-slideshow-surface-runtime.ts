import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import type {
  PresentationPlaybackSession,
  PresentationPlaybackSnapshot,
} from "@/runtime/presentation/presentation-playback-session";

import type { RequestSurfaceChange } from "./slideshow-surface-change";
import {
  assertSlideshowSurfaceRuntimeProgramIdentity,
  createSlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeProgram,
  type SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";

export type SlideshowNextMode = "play" | "advance" | "navigate" | "disabled";

export type SlideshowSurfaceRuntimeState =
  | {
      readonly status: "unconfigured";
      readonly nextMode: "navigate";
      readonly presentationSession?: never;
    }
  | {
      readonly status: "pending";
      readonly nextMode: "disabled";
      readonly presentationSession?: never;
    }
  | {
      readonly status: "ready";
      readonly nextMode: SlideshowNextMode;
      readonly presentationSession?: PresentationPlaybackSession;
    };

interface UseSlideshowSurfaceRuntimeInput {
  readonly activeSurfaceId: SurfaceId | null;
  readonly editor: TiptapEditor | null;
  readonly programSource?: SlideshowSurfaceRuntimeProgramSource;
  readonly requestSurfaceChange: RequestSurfaceChange;
}

interface MountedSurfaceRuntime {
  readonly surfaceId: SurfaceId;
  readonly editor: TiptapEditor;
  readonly program: SlideshowSurfaceRuntimeProgram;
  readonly composition: SlideshowSurfaceRuntimeComposition;
}

const NO_PRESENTATION_SNAPSHOT = null;

export function useSlideshowSurfaceRuntime({
  activeSurfaceId,
  editor,
  programSource,
  requestSurfaceChange,
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
    const cancelReadiness = controlBindings.notifyWhenOwnersMounted(
      deriveRequiredControlBindingOwnerIds(program),
      () => {
        if (!active) return;
        composition = createSlideshowSurfaceRuntimeComposition({
          surfaceId: activeSurfaceId,
          program,
          controlBindings,
          semanticTargets,
          requestSurfaceChange,
        });
        setMountedRuntime({ surfaceId: activeSurfaceId, editor, program, composition });
      },
    );

    return () => {
      active = false;
      cancelReadiness();
      const outgoingComposition = composition;
      composition = undefined;
      if (outgoingComposition) {
        setMountedRuntime((candidate) =>
          candidate?.composition === outgoingComposition ? null : candidate,
        );
        outgoingComposition.dispose();
      }
    };
  }, [activeSurfaceId, editor, program, requestSurfaceChange]);

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

  if (program === undefined) {
    return { status: "unconfigured", nextMode: "navigate" };
  }
  if (!currentRuntime) {
    return { status: "pending", nextMode: "disabled" };
  }
  return {
    status: "ready",
    nextMode: derivePresentationNextMode(presentationSnapshot),
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
