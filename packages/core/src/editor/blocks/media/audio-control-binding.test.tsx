// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createControlBindingRegistry, type ControlEvent } from "@/document/control-binding";
import type { BlockDefinition } from "@/editor/blocks/block-definition";

import { audioBlockDefinition } from "./audio-block-definition";
import { createAudioControlBinding, useAudioControlBinding } from "./audio-control-binding";
import { createAudioRuntimeController } from "./audio-runtime-controller";

const OWNER_ID = "audioOwnr001" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Audio Control Binding", () => {
  it("declares only the approved root playback capabilities", () => {
    expect((audioBlockDefinition as BlockDefinition).control).toEqual({
      owner: {
        events: [
          { type: "played", label: "Played" },
          { type: "paused", label: "Paused" },
          { type: "ended", label: "Ended" },
        ],
        states: [
          {
            key: "status",
            label: "Status",
            valueType: {
              kind: "enum",
              options: [
                { value: "idle", label: "Idle" },
                { value: "playing", label: "Playing" },
                { value: "paused", label: "Paused" },
                { value: "ended", label: "Ended" },
              ],
            },
          },
        ],
        commands: [
          { type: "play", label: "Play" },
          { type: "pause", label: "Pause" },
          {
            type: "seek-to",
            label: "Seek to",
            input: {
              kind: "runtime-bounded-number",
              min: 0,
              unitLabel: "seconds",
            },
          },
        ],
      },
    });
  });

  it("reads confirmed status and emits only learner-originated native occurrences", async () => {
    const media = createTestAudio();
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");
    let mounted = true;
    const registry = audioRegistry();
    const unregister = registry.register(
      createAudioControlBinding({
        controller,
        ownerId: OWNER_ID,
        requireMounted: () => {
          if (!mounted) throw new Error("Audio owner is no longer mounted.");
        },
      }),
    );
    const binding = registry.get(OWNER_ID);
    if (!binding) throw new Error("Expected Audio binding.");
    const events: ControlEvent[] = [];
    const statesAtEvent: unknown[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      statesAtEvent.push(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" }));
    });

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("idle");
    const learnerPlay = controller.play("learner", new AbortController().signal);
    media.confirmPlay();
    await learnerPlay;
    const learnerPause = controller.pause("learner", new AbortController().signal);
    media.confirmPause();
    await learnerPause;
    const learnerResume = controller.play("learner", new AbortController().signal);
    media.confirmPlay();
    await learnerResume;
    media.confirmEnded();
    expect(events).toEqual([
      { targetId: OWNER_ID, type: "played" },
      { targetId: OWNER_ID, type: "paused" },
      { targetId: OWNER_ID, type: "played" },
      { targetId: OWNER_ID, type: "ended" },
    ]);
    expect(statesAtEvent).toEqual(["playing", "paused", "playing", "ended"]);

    mounted = false;
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      "Audio owner is no longer mounted.",
    );
    unregister();
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });

  it("executes confirmed silent commands and maps only expected native media failures", async () => {
    const media = createTestAudio();
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");
    const registry = audioRegistry();
    registry.register(
      createAudioControlBinding({ controller, ownerId: OWNER_ID, requireMounted: () => undefined }),
    );
    const binding = registry.get(OWNER_ID);
    if (!binding?.commandExecutor) throw new Error("Expected Audio command executor.");
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    const play = binding.commandExecutor.execute(command("play"));
    media.confirmPlay();
    expect((await play).isOk()).toBe(true);
    expect(events).toEqual([]);
    expect((await binding.commandExecutor.execute(command("play"))).isOk()).toBe(true);
    expect(media.play).toHaveBeenCalledOnce();

    const pause = binding.commandExecutor.execute(command("pause"));
    media.confirmPause();
    expect((await pause).isOk()).toBe(true);
    expect((await binding.commandExecutor.execute(command("pause"))).isOk()).toBe(true);
    expect(media.pause).toHaveBeenCalledOnce();

    const seek = binding.commandExecutor.execute(command("seek-to", 30));
    expect(media.currentTimeAssignments).toEqual([30]);
    media.audio.dispatchEvent(new Event("seeked"));
    expect((await seek).isOk()).toBe(true);
    expect(events).toEqual([]);

    const outside = await binding.commandExecutor.execute(command("seek-to", 121));
    expect(outside.isErr()).toBe(true);
    if (outside.isOk()) throw new Error("Expected seek range failure.");
    expect(outside.error).toEqual({
      reason: "seek-out-of-range",
      requestedSeconds: 121,
      durationSeconds: 120,
    });

    const preAborted = new AbortController();
    preAborted.abort();
    const cancelled = await binding.commandExecutor.execute(command("seek-to", 20, preAborted));
    expect(cancelled.isErr()).toBe(true);
    if (cancelled.isOk()) throw new Error("Expected cancelled seek.");
    expect(cancelled.error).toEqual({ reason: "cancelled" });

    media.native.paused = true;
    media.play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    const blocked = await binding.commandExecutor.execute(command("play"));
    expect(blocked.isErr()).toBe(true);
    if (blocked.isOk()) throw new Error("Expected blocked playback.");
    expect(blocked.error).toEqual({ reason: "playback-not-allowed" });

    media.native.error = { code: 4 } as MediaError;
    media.play.mockRejectedValueOnce(new DOMException("unsupported", "NotSupportedError"));
    const unavailable = await binding.commandExecutor.execute(command("play"));
    expect(unavailable.isErr()).toBe(true);
    if (unavailable.isOk()) throw new Error("Expected unavailable media.");
    expect(unavailable.error).toEqual({ reason: "media-unavailable", mediaErrorCode: 4 });
  });

  it("mounts only with a live runtime authority, survives revisions and unregisters on teardown", async () => {
    const media = createTestAudio();
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");
    const registry = audioRegistry();
    let liveNode = audioNode();
    const editor = {
      storage: {
        controlBindingRegistryStorage: { getRegistry: () => registry },
      },
      state: { doc: { nodeAt: () => liveNode } },
    } as unknown as Editor;
    const getPos = () => 4;
    const rendered = render(
      <AudioBindingHost
        controller={controller}
        editor={editor}
        enabled={false}
        getPos={getPos}
        node={liveNode}
      />,
    );
    expect(registry.get(OWNER_ID)).toBeUndefined();

    rendered.rerender(
      <AudioBindingHost
        controller={controller}
        editor={editor}
        enabled
        getPos={getPos}
        node={liveNode}
      />,
    );
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeDefined());
    const binding = registry.get(OWNER_ID);
    liveNode = audioNode();
    rendered.rerender(
      <AudioBindingHost
        controller={controller}
        editor={editor}
        enabled
        getPos={getPos}
        node={liveNode}
      />,
    );
    expect(registry.get(OWNER_ID)).toBe(binding);
    expect(binding?.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("idle");

    rendered.unmount();
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
    expect(() => binding?.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });
});

function AudioBindingHost({
  controller,
  editor,
  enabled,
  getPos,
  node,
}: Omit<Parameters<typeof useAudioControlBinding>[0], "ownerId">) {
  useAudioControlBinding({ controller, editor, enabled, getPos, node, ownerId: OWNER_ID });
  return null;
}

function audioNode(): ProseMirrorNode {
  return {
    type: { name: "audio_block" },
    attrs: { id: OWNER_ID },
  } as unknown as ProseMirrorNode;
}

function audioRegistry() {
  return createControlBindingRegistry({
    requireOwnerControlDefinition: (ownerId) => {
      if (ownerId !== OWNER_ID || !audioBlockDefinition.control) {
        throw new Error(`Unknown Audio owner "${ownerId}".`);
      }
      return audioBlockDefinition.control;
    },
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== OWNER_ID || targetId !== OWNER_ID || !audioBlockDefinition.control?.owner) {
        throw new Error(`Control target "${targetId}" does not belong to owner "${ownerId}".`);
      }
      return audioBlockDefinition.control.owner;
    },
  });
}

function command(type: string, input?: number, abort?: AbortController) {
  return {
    targetId: OWNER_ID,
    type,
    signal: abort?.signal ?? new AbortController().signal,
    ...(input === undefined ? {} : { input }),
  };
}

function createTestAudio() {
  const audio = document.createElement("audio");
  const native = {
    currentTime: 0,
    duration: 120,
    ended: false,
    error: null as MediaError | null,
    paused: true,
  };
  const currentTimeAssignments: number[] = [];
  Object.defineProperties(audio, {
    currentTime: {
      configurable: true,
      get: () => native.currentTime,
      set: (value: number) => {
        native.currentTime = value;
        currentTimeAssignments.push(value);
      },
    },
    duration: { configurable: true, get: () => native.duration },
    ended: { configurable: true, get: () => native.ended },
    error: { configurable: true, get: () => native.error },
    paused: { configurable: true, get: () => native.paused },
  });
  const play = vi.fn(async () => undefined);
  const pause = vi.fn(() => undefined);
  Object.defineProperty(audio, "play", { configurable: true, value: play });
  Object.defineProperty(audio, "pause", { configurable: true, value: pause });
  return {
    audio,
    currentTimeAssignments,
    native,
    pause,
    play,
    confirmPlay() {
      native.paused = false;
      native.ended = false;
      audio.dispatchEvent(new Event("play"));
    },
    confirmPause() {
      native.paused = true;
      audio.dispatchEvent(new Event("pause"));
    },
    confirmEnded() {
      native.paused = true;
      native.ended = true;
      audio.dispatchEvent(new Event("ended"));
    },
  };
}
