import { EmbeddedDataIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import type { SurfaceId } from "@/document/model/course-structure";
import type { ControlCommandResult } from "@/document/control-binding/control-binding";
import type { CompiledSurfacePresentationTimeline } from "@/presentation/model";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";

import { createSlideshowSurfaceRuntimeComposition } from "./slideshow-surface-runtime-composition";

const SURFACE_ID = "surface00001" as SurfaceId;
const OWNER_ID = "controlown001" as EmbeddedNodeId;
const TARGET_ID = "controltgt001" as EmbeddedNodeId;

// Native currentTime assignment, seek confirmation and RAF sampling are not sample-accurate.
// 120 ms covers the controller's 50 ms seek-confirmation bound plus several busy Chromium frames.
const NATIVE_MEDIA_TOLERANCE_MS = 120;

describe("Slideshow narration checkpoint coordination", () => {
  it("keeps generated native audio fixed through delayed settlement and aligned after release", async () => {
    const sourceUrl = URL.createObjectURL(silentWave(8));
    const audio = new Audio();
    audio.muted = true;
    let cueStarted = false;
    const cue = deferred<ControlCommandResult>();
    const execute = vi.fn(async () => {
      cueStarted = true;
      return cue.promise;
    });
    const timeline = nativeNarrationTimeline(sourceUrl);
    const binding = { ownerId: OWNER_ID, commandExecutor: { execute } };
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline, autoAdvance: false } },
      controlBindings: { get: () => binding },
      semanticTargets: {
        activate: async (requestedId) => ({ kind: "reached" as const, requestedId }),
      },
      featureViewBaseline: { replaceForOwners() {} },
      requestSurfaceChange: () => Result.ok(),
      createNarrationAudioElement: () => audio,
    });
    const controls = composition.presentationControls;
    if (!controls) throw new Error("Expected Presentation controls.");
    const startButton = document.createElement("button");
    startButton.textContent = "Start native narration";
    const releaseButton = document.createElement("button");
    releaseButton.textContent = "Release native narration";
    document.body.append(startButton, releaseButton);

    try {
      let startPromise: ReturnType<typeof controls.play> | undefined;
      startButton.addEventListener("click", () => {
        startPromise = controls.play();
      });
      await userEvent.click(startButton);
      if (!startPromise)
        throw new Error("Native start gesture did not reach Presentation controls.");
      const started = await startPromise;
      if (started.isErr()) {
        throw new Error(`Expected native narration to start, received ${started.error.reason}.`);
      }
      await waitForCondition(() => cueStarted, "checkpoint cue start");
      await waitForCondition(
        () =>
          audio.paused &&
          Math.abs(audio.currentTime * 1_000 - controls.getSnapshot().position.timeMs) <=
            NATIVE_MEDIA_TOLERANCE_MS,
        "native audio pause and boundary reconciliation",
      );

      const holdStartAudioMs = audio.currentTime * 1_000;
      const holdStartSurfaceMs = controls.getSnapshot().position.timeMs;
      expect(controls.getSnapshot()).toMatchObject({
        phase: "playing",
        advancement: "suspended",
        position: { timeMs: 1_000, side: "after-actions" },
      });
      expect(Math.abs(holdStartAudioMs - holdStartSurfaceMs)).toBeLessThanOrEqual(
        NATIVE_MEDIA_TOLERANCE_MS,
      );

      await waitMs(300);
      expect(audio.paused).toBe(true);
      const holdDriftMs = Math.abs(audio.currentTime * 1_000 - holdStartAudioMs);
      expect(holdDriftMs).toBeLessThanOrEqual(NATIVE_MEDIA_TOLERANCE_MS);
      expect(controls.getSnapshot().position.timeMs).toBe(1_000);

      cue.resolve(Result.ok());
      await waitForCondition(() => controls.getSnapshot().phase === "held", "checkpoint hold");
      await waitMs(200);
      expect(audio.paused).toBe(true);
      expect(Math.abs(audio.currentTime * 1_000 - 1_000)).toBeLessThanOrEqual(
        NATIVE_MEDIA_TOLERANCE_MS,
      );

      let releasePromise: ReturnType<typeof controls.advance> | undefined;
      releaseButton.addEventListener("click", () => {
        releasePromise = controls.advance();
      });
      await userEvent.click(releaseButton);
      if (!releasePromise) {
        throw new Error("Native release gesture did not reach Presentation controls.");
      }
      const released = await releasePromise;
      if (released.isErr()) {
        throw new Error(`Expected native narration release, received ${released.error.reason}.`);
      }
      await waitForCondition(
        () => controls.getSnapshot().position.timeMs >= 1_250,
        "continued native narration",
      );

      const offsets: number[] = [];
      for (let sample = 0; sample < 4; sample += 1) {
        const surfaceMs = controls.getSnapshot().position.timeMs;
        const mediaMs = audio.currentTime * 1_000;
        offsets.push(mediaMs - surfaceMs);
        await waitMs(125);
      }
      expect(offsets.every((offset) => Math.abs(offset) <= NATIVE_MEDIA_TOLERANCE_MS)).toBe(true);
      expect(Math.abs(offsets.at(-1)! - offsets[0]!)).toBeLessThanOrEqual(
        NATIVE_MEDIA_TOLERANCE_MS,
      );
      expect(execute).toHaveBeenCalledOnce();
      console.info(
        "NATIVE_NARRATION_MEASUREMENTS",
        JSON.stringify({
          toleranceMs: NATIVE_MEDIA_TOLERANCE_MS,
          boundarySurfaceMs: holdStartSurfaceMs,
          boundaryMediaMs: Math.round(holdStartAudioMs),
          holdDriftMs: Math.round(holdDriftMs),
          continuedOffsetsMs: offsets.map(Math.round),
        }),
      );
    } finally {
      cue.resolve(Result.ok());
      composition.dispose();
      startButton.remove();
      releaseButton.remove();
      URL.revokeObjectURL(sourceUrl);
    }
  });
});

function nativeNarrationTimeline(sourceUrl: string): CompiledSurfacePresentationTimeline {
  return Object.freeze({
    surfaceId: SURFACE_ID,
    durationMs: 4_000,
    transition: null,
    layerTracks: Object.freeze([]),
    layerTrackByOwnerId: new Map(),
    narration: Object.freeze({
      source: Object.freeze({ mode: "external" as const, src: sourceUrl }),
    }),
    cues: Object.freeze([
      Object.freeze({
        id: EmbeddedDataIdSchema.parse("nativecue001"),
        atMs: 1_000,
        command: Object.freeze({
          kind: "target-command" as const,
          ownerId: OWNER_ID,
          targetId: TARGET_ID,
          type: "select",
        }),
        seekBehavior: "consume" as const,
      }),
    ]),
    waits: Object.freeze([
      Object.freeze({
        kind: "manual-wait" as const,
        id: "native-wait" as PresentationWaitId,
        atMs: 1_000,
        boundary: "after-actions" as const,
      }),
    ]),
    visualProgram: Object.freeze({
      surfaceId: SURFACE_ID,
      durationMs: 4_000,
      targetById: new Map(),
      segments: Object.freeze([]),
    }),
  });
}

function silentWave(durationSeconds: number): Blob {
  const sampleRate = 8_000;
  const sampleCount = sampleRate * durationSeconds;
  const bytes = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);
  return new Blob([bytes], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

async function waitForCondition(predicate: () => boolean, description: string): Promise<void> {
  const startedAt = performance.now();
  while (!predicate()) {
    if (performance.now() - startedAt > 8_000) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function waitMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
