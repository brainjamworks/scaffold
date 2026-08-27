import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useEffect, useRef } from "react";

import { tryGetControlBindingRegistryForEditor } from "@/document/control-binding";
import type {
  ControlBinding,
  ControlCommandResult,
  ControlEvent,
} from "@/document/control-binding";

import type { AudioCommandOutcome, AudioRuntimeController } from "./audio-runtime-controller";

interface CreateAudioControlBindingInput {
  readonly controller: AudioRuntimeController;
  readonly ownerId: EmbeddedNodeId;
  readonly requireMounted: () => void;
}

export interface UseAudioControlBindingInput {
  readonly controller: AudioRuntimeController;
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
  readonly ownerId: unknown;
}

/** Registers one runtime-only Audio owner while its native media authority is mounted. */
export function useAudioControlBinding(input: UseAudioControlBindingInput): void {
  const { controller, editor, enabled, ownerId } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !registry || !controller.isMounted()) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!parsedOwnerId.success) return;
    const mountedOwnerId = parsedOwnerId.data;
    return registry.register(
      createAudioControlBinding({
        controller,
        ownerId: mountedOwnerId,
        requireMounted: () => requireCurrentAudioOwner(behaviorRef.current, mountedOwnerId),
      }),
    );
  }, [controller, editor, enabled, ownerId, registry]);
}

/** Adapts one mounted native Audio authority without owning playback state. */
export function createAudioControlBinding({
  controller,
  ownerId,
  requireMounted,
}: CreateAudioControlBindingInput): ControlBinding {
  const binding: ControlBinding = {
    ownerId,
    eventSource: {
      subscribe(listener) {
        requireMounted();
        return controller.subscribeToCommits((commit) => {
          if (commit.origin !== "learner") return;
          requireMounted();
          listener(Object.freeze({ targetId: ownerId, type: commit.type }) satisfies ControlEvent);
        });
      },
    },
    stateReader: {
      read() {
        requireMounted();
        return controller.getStatus();
      },
    },
    commandExecutor: {
      async execute({ input, signal, type }) {
        requireMounted();
        let outcome: AudioCommandOutcome;
        if (type === "play") {
          outcome = await controller.play("control-command", signal);
        } else if (type === "pause") {
          outcome = await controller.pause("control-command", signal);
        } else if (type === "seek-to") {
          if (typeof input !== "number") {
            throw new Error('Audio Control command "seek-to" requires numeric seconds.');
          }
          outcome = await controller.seekTo(input, "control-command", signal);
        } else {
          throw new Error(`Unsupported Audio Control command "${type}".`);
        }
        requireMounted();
        return commandResult(outcome);
      },
    },
  };
  return Object.freeze(binding);
}

function requireCurrentAudioOwner(
  behavior: UseAudioControlBindingInput,
  ownerId: EmbeddedNodeId,
): void {
  if (
    !behavior.controller.isMounted() ||
    behavior.node.type.name !== "audio_block" ||
    behavior.node.attrs["id"] !== ownerId
  ) {
    throw new Error(`Audio Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Audio Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Audio Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== "audio_block" || current.attrs["id"] !== ownerId) {
    throw new Error(`Audio Control Binding owner "${ownerId}" is no longer mounted.`);
  }
}

function commandResult(outcome: AudioCommandOutcome): ControlCommandResult {
  switch (outcome.kind) {
    case "success":
      return Result.ok();
    case "cancelled":
      return Result.err(Object.freeze({ reason: "cancelled" }));
    case "playback-not-allowed":
      return Result.err(Object.freeze({ reason: "playback-not-allowed" }));
    case "media-unavailable":
      return Result.err(
        Object.freeze({
          reason: "media-unavailable",
          mediaErrorCode: outcome.mediaErrorCode,
        }),
      );
    case "seek-out-of-range":
      return Result.err(
        Object.freeze({
          reason: "seek-out-of-range",
          requestedSeconds: outcome.requestedSeconds,
          durationSeconds: outcome.durationSeconds,
        }),
      );
  }
}
