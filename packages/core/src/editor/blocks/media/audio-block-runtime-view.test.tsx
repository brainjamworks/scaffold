// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createControlBindingRegistry, type ControlEvent } from "@/document/control-binding";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

import { audioBlockDefinition } from "./audio-block-definition";
import { AudioBlockAuthoringView } from "./AudioBlockAuthoringView";
import { AudioBlockRuntimeView } from "./audio-block-runtime-view";

const learningEventReporter = vi.hoisted(() => ({ report: vi.fn() }));

vi.mock("@/runtime/learning-events/LearningEventRuntimeProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/runtime/learning-events/LearningEventRuntimeProvider")>();
  return { ...actual, useLearningEventReporter: () => learningEventReporter };
});

const OWNER_ID = "audioOwnr001" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  learningEventReporter.report.mockReset();
  vi.restoreAllMocks();
});

describe("Audio block runtime Control lifecycle", () => {
  it("fans learner native confirmation to repeatable Control and once-only Learning consumers", async () => {
    const fixture = runtimeFixture(externalAudioNode("https://example.com/a.mp3"));
    const rendered = render(<AudioBlockRuntimeView {...fixture.props()} />);
    const audio = rendered.container.querySelector("audio");
    if (!audio) throw new Error("Expected native Audio authority.");
    const native = installNativeAudio(audio);
    const binding = await requireBinding(fixture);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("idle");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(events).toEqual([]);
    native.confirmPlay();
    expect(events).toEqual([{ targetId: OWNER_ID, type: "played" }]);
    expect(learningEventReporter.report).toHaveBeenCalledOnce();
    expect(learningEventReporter.report).toHaveBeenCalledWith({
      type: "resource.attempted",
      resourceId: OWNER_ID,
      resourceKind: "audio",
    });

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    native.confirmPause();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    native.confirmPlay();
    native.confirmEnded();
    native.confirmEnded();
    expect(events).toEqual([
      { targetId: OWNER_ID, type: "played" },
      { targetId: OWNER_ID, type: "paused" },
      { targetId: OWNER_ID, type: "played" },
      { targetId: OWNER_ID, type: "ended" },
      { targetId: OWNER_ID, type: "ended" },
    ]);
    expect(learningEventReporter.report).toHaveBeenCalledTimes(2);
    expect(learningEventReporter.report).toHaveBeenLastCalledWith({
      type: "resource.completed",
      resourceId: OWNER_ID,
      resourceKind: "audio",
    });

    rendered.unmount();
    await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeUndefined());
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });

  it("keeps Control delivery operational when Learning reporting fails", async () => {
    learningEventReporter.report.mockImplementation(() => {
      throw new Error("learning port unavailable");
    });
    const fixture = runtimeFixture(externalAudioNode("https://example.com/a.mp3"));
    const rendered = render(<AudioBlockRuntimeView {...fixture.props()} />);
    const audio = rendered.container.querySelector("audio");
    if (!audio) throw new Error("Expected native Audio authority.");
    const native = installNativeAudio(audio);
    const binding = await requireBinding(fixture);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(() => native.confirmPlay()).not.toThrow();
    expect(events).toEqual([{ targetId: OWNER_ID, type: "played" }]);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("playing");
  });

  it("reports learner playback when no Control consumer subscribes", async () => {
    const fixture = runtimeFixture(externalAudioNode("https://example.com/a.mp3"));
    const rendered = render(<AudioBlockRuntimeView {...fixture.props()} />);
    const audio = rendered.container.querySelector("audio");
    if (!audio) throw new Error("Expected native Audio authority.");
    const native = installNativeAudio(audio);
    await requireBinding(fixture);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    native.confirmPlay();

    expect(learningEventReporter.report).toHaveBeenCalledWith({
      type: "resource.attempted",
      resourceId: OWNER_ID,
      resourceKind: "audio",
    });
  });

  it("mounts no binding for missing media and resets silently when the source changes", async () => {
    const missing = runtimeFixture(missingAudioNode());
    render(<AudioBlockRuntimeView {...missing.props()} />);
    await screen.findByRole("status");
    expect(missing.registry.get(OWNER_ID)).toBeUndefined();
    cleanup();

    const failed = runtimeFixture(managedAudioNode());
    render(<AudioBlockRuntimeView {...failed.props()} />);
    await screen.findByRole("alert");
    expect(failed.registry.get(OWNER_ID)).toBeUndefined();
    cleanup();

    const fixture = runtimeFixture(externalAudioNode("https://example.com/a.mp3"));
    const rendered = render(<AudioBlockRuntimeView {...fixture.props()} />);
    const firstBinding = await requireBinding(fixture);
    fixture.setNode(externalAudioNode("https://example.com/b.mp3"));
    rendered.rerender(<AudioBlockRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeDefined());
    expect(
      fixture.registry.get(OWNER_ID)?.stateReader?.read({ targetId: OWNER_ID, key: "status" }),
    ).toBe("idle");
    expect(fixture.registry.get(OWNER_ID)).toBe(firstBinding);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    fixture.setNode(missingAudioNode());
    rendered.rerender(<AudioBlockRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeUndefined());
    expect(() => firstBinding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });

  it("mounts no learner Control Binding in authoring", async () => {
    const fixture = runtimeFixture(externalAudioNode("https://example.com/a.mp3"));

    render(
      <AppThemeProvider appearance="light">
        <AudioBlockAuthoringView {...fixture.props()} />
      </AppThemeProvider>,
    );

    await screen.findByRole("group", { name: "Audio player controls" });
    expect(fixture.registry.get(OWNER_ID)).toBeUndefined();
  });
});

async function requireBinding(fixture: ReturnType<typeof runtimeFixture>) {
  await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeDefined());
  const binding = fixture.registry.get(OWNER_ID);
  if (!binding) throw new Error("Expected mounted Audio binding.");
  return binding;
}

function runtimeFixture(initialNode: ProseMirrorNode) {
  const registry = createControlBindingRegistry({
    requireOwnerControlDefinition: () => audioBlockDefinition.control!,
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== OWNER_ID || targetId !== OWNER_ID) throw new Error("foreign Audio target");
      return audioBlockDefinition.control!.owner!;
    },
  });
  let node = initialNode;
  const editor = {
    storage: { controlBindingRegistryStorage: { getRegistry: () => registry } },
    state: { doc: { nodeAt: () => node } },
  } as unknown as Editor;
  return {
    registry,
    props: () => ({ editor, getPos: () => 4, node }) as unknown as NodeViewProps,
    setNode(next: ProseMirrorNode) {
      node = next;
    },
  };
}

function externalAudioNode(src: string): ProseMirrorNode {
  return {
    type: { name: "audio_block" },
    attrs: { id: OWNER_ID, data: { mode: "external", src } },
  } as unknown as ProseMirrorNode;
}

function missingAudioNode(): ProseMirrorNode {
  return {
    type: { name: "audio_block" },
    attrs: { id: OWNER_ID, data: null },
  } as unknown as ProseMirrorNode;
}

function managedAudioNode(): ProseMirrorNode {
  return {
    type: { name: "audio_block" },
    attrs: { id: OWNER_ID, data: { mode: "managed", mediaId: "missing-audio" } },
  } as unknown as ProseMirrorNode;
}

function installNativeAudio(audio: HTMLAudioElement) {
  const native = { paused: true, ended: false };
  Object.defineProperties(audio, {
    paused: { configurable: true, get: () => native.paused },
    ended: { configurable: true, get: () => native.ended },
  });
  Object.defineProperty(audio, "play", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(audio, "pause", {
    configurable: true,
    value: vi.fn(() => undefined),
  });
  return {
    confirmPlay() {
      native.paused = false;
      native.ended = false;
      fireEvent.play(audio);
    },
    confirmPause() {
      native.paused = true;
      fireEvent.pause(audio);
    },
    confirmEnded() {
      native.paused = true;
      native.ended = true;
      fireEvent.ended(audio);
    },
  };
}
