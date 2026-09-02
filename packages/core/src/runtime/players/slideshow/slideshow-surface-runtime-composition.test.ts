// @vitest-environment happy-dom

import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  EmbeddedDataIdSchema,
  type EmbeddedDataId,
  type EmbeddedNodeId,
} from "@scaffold/contracts";

import type {
  ControlCommandRequest,
  ControlCommandResult,
  ControlEvent,
  ControlEventListener,
  EventSource,
} from "@/document/control-binding/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { CompiledSurfacePresentationTimeline } from "@/presentation/model";
import type { CompiledSurfaceLearnerInteractionProgram } from "@/learner-interaction/model";
import { createLearnerInteractionEventKey } from "@/learner-interaction/model";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";
import type { SurfaceChangeRefused, SurfaceChangeResult } from "./slideshow-surface-change";
import { createRequestSurfaceChange } from "./slideshow-surface-change";

import {
  createSlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeProgram,
  type SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";

const SURFACE_ID = "surface00001" as SurfaceId;
const OTHER_SURFACE_ID = "surface00002" as SurfaceId;
const OWNER_ID = "controlown001" as EmbeddedNodeId;
const TARGET_ID = "controltgt001" as EmbeddedNodeId;

describe("createSlideshowSurfaceRuntimeComposition", () => {
  it("reconstructs feature view before the private Session publishes the visual scene", async () => {
    const order: string[] = [];
    const surfaceRoot = document.createElement("section");
    const target = document.createElement("div");
    target.setAttribute("data-presentation-target-id", TARGET_ID);
    const surfaceAnchor = document.createElement("div");
    surfaceAnchor.setAttribute("data-presentation-target-id", SURFACE_ID);
    surfaceAnchor.append(target);
    surfaceRoot.append(surfaceAnchor);
    document.body.append(surfaceRoot);
    const visualTimeline = Object.freeze({
      surfaceId: SURFACE_ID,
      durationMs: 1_000,
      cues: Object.freeze([
        Object.freeze({
          id: EmbeddedDataIdSchema.parse("select000001"),
          atMs: 500,
          command: Object.freeze({
            kind: "target-command" as const,
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "select",
          }),
          seekBehavior: "reconstruct-state" as const,
        }),
      ]),
      waits: Object.freeze([]),
      visualProgram: Object.freeze({
        surfaceId: SURFACE_ID,
        durationMs: 1_000,
        targetById: new Map([
          [
            TARGET_ID,
            Object.freeze({
              targetId: TARGET_ID,
              initialVisibility: "withheld" as const,
              contentLayout: Object.freeze({
                containerId: SURFACE_ID,
                contentLayout: "flow" as const,
                directChildId: TARGET_ID,
                directChildIds: Object.freeze([TARGET_ID]),
              }),
            }),
          ],
        ]),
        segments: Object.freeze([
          Object.freeze({
            id: EmbeddedDataIdSchema.parse("reveal000001"),
            targetId: TARGET_ID,
            startMs: 500,
            endMs: 1_000,
            visual: Object.freeze({
              kind: "reveal" as const,
              transition: Object.freeze({
                kind: "fade" as const,
                durationMs: 500,
                easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
              }),
            }),
          }),
        ]),
        sequenceContainers: Object.freeze([]),
      }),
    }) satisfies CompiledSurfacePresentationTimeline;

    const contentLayoutPort = {
      apply: vi.fn(() => Result.ok()),
      clear: vi.fn(),
    };
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      surfaceRoot,
      program: { presentation: { timeline: visualTimeline, autoAdvance: false } },
      controlBindings: {
        get: vi.fn(() => ({
          ownerId: OWNER_ID,
          commandExecutor: {
            execute: vi.fn(async () => {
              order.push("execute");
              return Result.ok();
            }),
          },
        })),
      },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => {
          order.push("activate");
          return { kind: "reached" as const, requestedId };
        }),
      },
      featureViewBaseline: {
        replaceForOwners(ownerIds) {
          order.push(`baseline:${ownerIds.join(",")}`);
        },
      },
      requestSurfaceChange: vi.fn(() => Result.ok()),
      contentLayoutPort,
    });
    composition.presentationControls?.subscribe(() => order.push("session"));

    expect(composition.presentationVisualRuntime).toBeDefined();
    expect(contentLayoutPort.apply).toHaveBeenCalledOnce();
    expect(target).toHaveAttribute("data-presentation-availability", "withheld");
    expect(target).toHaveAttribute("aria-hidden", "true");
    expect(target).toHaveAttribute("inert");

    expect(composition).not.toHaveProperty("presentationSession");
    expect(composition.presentationControls).not.toHaveProperty("seek");
    const seek = await composition.seek?.(1_000);
    expect(seek?.isOk()).toBe(true);
    expect(order).toEqual([`baseline:${OWNER_ID}`, "activate", "execute", "session"]);
    expect(target).toHaveAttribute("data-presentation-availability", "available");
    expect(target).not.toHaveAttribute("aria-hidden");
    expect(target).not.toHaveAttribute("inert");
    expect(target.style.opacity).toBe("1");

    composition.dispose();
    expect(contentLayoutPort.clear).toHaveBeenCalledOnce();
    expect(target).not.toHaveAttribute("data-presentation-availability");
    expect(target.style.opacity).toBe("");
    surfaceRoot.remove();
  });

  it("returns a typed range refusal without pausing or reconstructing", async () => {
    const featureViewBaseline = { replaceForOwners: vi.fn() };
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: timeline(SURFACE_ID), autoAdvance: false } },
      controlBindings: { get: vi.fn() },
      semanticTargets: { activate: vi.fn() },
      featureViewBaseline,
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });

    const result = await composition.seek?.(1_001);

    expect(result?.isErr()).toBe(true);
    if (!result || result.isOk()) throw new Error("Expected the range refusal.");
    expect(result.error).toEqual({
      reason: "seek-out-of-range",
      requestedTimeMs: 1_001,
      durationMs: 1_000,
    });
    expect(Object.isFrozen(result.error)).toBe(true);
    expect(featureViewBaseline.replaceForOwners).not.toHaveBeenCalled();
    expect(composition.presentationControls?.getSnapshot()).toMatchObject({
      phase: "awaiting-start",
      currentTimeMs: 0,
    });
    composition.dispose();
  });

  it("lets only the latest asynchronous seek move the Session", async () => {
    const pendingCommand = deferred<ControlCommandResult>();
    let featureState = "initial";
    let commandSignal: AbortSignal | undefined;
    const featureViewBaseline = {
      replaceForOwners: vi.fn(() => {
        featureState = "baseline";
      }),
    };
    const reconstructableTimeline = Object.freeze({
      ...timeline(SURFACE_ID),
      cues: Object.freeze([
        Object.freeze({
          id: EmbeddedDataIdSchema.parse("latestcue001"),
          atMs: 100,
          command: Object.freeze({
            kind: "target-command" as const,
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "select",
          }),
          seekBehavior: "reconstruct-state" as const,
        }),
      ]),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: reconstructableTimeline, autoAdvance: false } },
      controlBindings: {
        get: () => ({
          ownerId: OWNER_ID,
          commandExecutor: {
            execute: vi.fn(({ signal }: ControlCommandRequest) => {
              commandSignal = signal;
              return pendingCommand.promise.then((result) => {
                if (!signal.aborted) featureState = "selected";
                return result;
              });
            }),
          },
        }),
      },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
          kind: "reached" as const,
          requestedId,
        })),
      },
      featureViewBaseline,
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });

    const first = composition.seek?.(100);
    await flushPromises();
    const second = await composition.seek?.(0);
    expect(commandSignal?.aborted).toBe(true);
    pendingCommand.resolve(Result.ok());

    expect(second?.isOk()).toBe(true);
    await expect(first).resolves.toMatchObject({ value: { kind: "superseded", timeMs: 100 } });
    expect(composition.presentationControls?.getSnapshot()).toMatchObject({ currentTimeMs: 0 });
    expect(featureState).toBe("baseline");
    expect(featureViewBaseline.replaceForOwners).toHaveBeenCalledTimes(2);
    composition.dispose();
  });

  it("reconstructs time zero before Restart publishes its single Session update", async () => {
    let featureState = "initial";
    const reconstructableTimeline = Object.freeze({
      ...timeline(SURFACE_ID),
      cues: Object.freeze([
        Object.freeze({
          id: EmbeddedDataIdSchema.parse("restartcue01"),
          atMs: 100,
          command: Object.freeze({
            kind: "target-command" as const,
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "select",
          }),
          seekBehavior: "reconstruct-state" as const,
        }),
      ]),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: reconstructableTimeline, autoAdvance: false } },
      controlBindings: {
        get: () => ({
          ownerId: OWNER_ID,
          commandExecutor: {
            execute: vi.fn(async () => {
              featureState = "selected";
              return Result.ok();
            }),
          },
        }),
      },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
          kind: "reached" as const,
          requestedId,
        })),
      },
      featureViewBaseline: {
        replaceForOwners: vi.fn(() => {
          featureState = "baseline";
        }),
      },
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const controls = composition.presentationControls;
    if (!controls || !composition.seek) throw new Error("Expected Presentation controls.");

    await composition.seek(100);
    expect(featureState).toBe("selected");
    const sessionUpdates = vi.fn();
    controls.subscribe(sessionUpdates);

    const restart = await controls.restart();

    expect(restart).toMatchObject({ value: { kind: "applied", timeMs: 0 } });
    expect(featureState).toBe("baseline");
    expect(controls.getSnapshot()).toMatchObject({ phase: "awaiting-start", currentTimeMs: 0 });
    expect(sessionUpdates).toHaveBeenCalledOnce();
    composition.dispose();
  });

  it("aborts reconstruction on disposal without moving the disposed Session", async () => {
    const pendingCommand = deferred<ControlCommandResult>();
    let featureState = "initial";
    let commandSignal: AbortSignal | undefined;
    const reconstructableTimeline = Object.freeze({
      ...timeline(SURFACE_ID),
      cues: Object.freeze([
        Object.freeze({
          id: EmbeddedDataIdSchema.parse("disposecue01"),
          atMs: 100,
          command: Object.freeze({
            kind: "target-command" as const,
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "select",
          }),
          seekBehavior: "reconstruct-state" as const,
        }),
      ]),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: reconstructableTimeline, autoAdvance: false } },
      controlBindings: {
        get: () => ({
          ownerId: OWNER_ID,
          commandExecutor: {
            execute: vi.fn(({ signal }: ControlCommandRequest) => {
              commandSignal = signal;
              return pendingCommand.promise.then((result) => {
                if (!signal.aborted) featureState = "selected";
                return result;
              });
            }),
          },
        }),
      },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
          kind: "reached" as const,
          requestedId,
        })),
      },
      featureViewBaseline: {
        replaceForOwners: vi.fn(() => {
          featureState = "baseline";
        }),
      },
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const sessionUpdates = vi.fn();
    composition.presentationControls?.subscribe(sessionUpdates);

    const pendingSeek = composition.seek?.(100);
    await flushPromises();
    expect(commandSignal).toBeInstanceOf(AbortSignal);
    sessionUpdates.mockClear();
    composition.dispose();

    expect(commandSignal?.aborted).toBe(true);
    pendingCommand.resolve(Result.ok());
    await expect(pendingSeek).resolves.toMatchObject({
      value: { kind: "superseded", timeMs: 100 },
    });
    expect(featureState).toBe("baseline");
    expect(sessionUpdates).not.toHaveBeenCalled();
  });

  it("constructs an awaiting-start Presentation over one empty learner runtime", () => {
    const timeline = emptyPresentationTimeline(SURFACE_ID, 1_000);
    const program: SlideshowSurfaceRuntimeProgram = Object.freeze({
      presentation: Object.freeze({ timeline, autoAdvance: false }),
    });
    const programSource: SlideshowSurfaceRuntimeProgramSource = vi.fn((surfaceId) =>
      surfaceId === SURFACE_ID ? program : undefined,
    );
    const selectedProgram = programSource(SURFACE_ID);
    if (!selectedProgram) throw new Error("Expected the configured Surface program.");
    const getControlBinding = vi.fn();
    const activateSemanticTarget = vi.fn();
    const requestSurfaceChange = vi.fn(() => Result.ok());

    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: selectedProgram,
      controlBindings: { get: getControlBinding },
      semanticTargets: { activate: activateSemanticTarget },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange,
    });

    expect(Object.isFrozen(composition)).toBe(true);
    expect(composition.surfaceId).toBe(SURFACE_ID);
    expect(Object.isFrozen(composition.learnerRuntime)).toBe(true);
    expect(composition.presentationControls?.getSnapshot()).toMatchObject({
      surfaceId: SURFACE_ID,
      phase: "awaiting-start",
      currentTimeMs: 0,
    });
    expect(getControlBinding).not.toHaveBeenCalled();
    expect(activateSemanticTarget).not.toHaveBeenCalled();
    expect(requestSurfaceChange).not.toHaveBeenCalled();

    composition.dispose();
  });

  it("waits for confirmed narration play before advancing the Presentation Session", async () => {
    const media = createTestNarrationAudio();
    const narrationTimeline = Object.freeze({
      ...emptyPresentationTimeline(SURFACE_ID, 10_000),
      narration: Object.freeze({
        source: Object.freeze({
          mode: "external" as const,
          src: "https://media.example.test/narration.mp3",
        }),
      }),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: narrationTimeline, autoAdvance: false } },
      controlBindings: { get: vi.fn() },
      semanticTargets: { activate: vi.fn() },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange: vi.fn(() => Result.ok()),
      createNarrationAudioElement: () => media.audio,
    });
    const controls = composition.presentationControls;
    if (!controls) throw new Error("Expected Presentation controls.");
    await vi.waitFor(() => expect(media.audio.src).toContain("narration.mp3"));
    media.confirmMetadata(10);

    const playing = controls.play();
    expect(controls.getSnapshot().phase).toBe("awaiting-start");
    media.confirmPlay();

    expect((await playing).isOk()).toBe(true);
    expect(controls.getSnapshot().phase).toBe("playing");
    expect(controls.getNarrationSnapshot()).toMatchObject({
      status: "playing",
      usingInternalClock: false,
      error: null,
    });
    composition.dispose();
  });

  it("freezes for narrated seek and resumes only after media seek and play confirmation", async () => {
    const media = createTestNarrationAudio();
    const composition = createNarratedComposition(media.audio);
    const controls = composition.presentationControls;
    if (!controls || !composition.seek) throw new Error("Expected Presentation controls.");
    await vi.waitFor(() => expect(media.audio.src).toContain("narration.mp3"));
    media.confirmMetadata(10);
    const firstPlay = controls.play();
    await vi.waitFor(() => expect(media.play).toHaveBeenCalledOnce());
    media.confirmPlay();
    await firstPlay;
    expect(controls.getSnapshot().phase).toBe("playing");

    const seeking = composition.seek(4_000);
    expect(controls.getSnapshot().phase).toBe("paused");
    await vi.waitFor(() =>
      expect(controls.getNarrationSnapshot()).toMatchObject({ status: "seeking" }),
    );
    expect(media.pause).toHaveBeenCalled();
    expect(media.native.paused).toBe(true);
    await vi.waitFor(() => expect(media.native.currentTime).toBe(4));
    media.confirmSeek(4);
    expect(media.native.paused).toBe(true);
    await vi.waitFor(() => expect(media.play).toHaveBeenCalledTimes(2));
    expect(controls.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 4_000 });
    media.confirmPlay();

    expect(await seeking).toMatchObject({ value: { kind: "applied", timeMs: 4_000 } });
    expect(controls.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 4_000 });
    composition.dispose();
  });

  it("preserves blocked-play facts and explicitly continues without narration", async () => {
    const media = createTestNarrationAudio();
    const blocked = new DOMException("gesture required", "NotAllowedError");
    media.play.mockRejectedValueOnce(blocked);
    const composition = createNarratedComposition(media.audio);
    const controls = composition.presentationControls;
    if (!controls) throw new Error("Expected Presentation controls.");
    await vi.waitFor(() => expect(media.audio.src).toContain("narration.mp3"));
    media.confirmMetadata(10);

    const result = await controls.play();

    if (result.isOk()) throw new Error("Expected narration play to be blocked.");
    expect(result.error).toEqual({
      reason: "playback-not-allowed",
      surfaceId: SURFACE_ID,
      cause: blocked,
    });
    expect(controls.getSnapshot()).toMatchObject({ phase: "awaiting-start", currentTimeMs: 0 });
    expect(controls.getNarrationSnapshot()).toMatchObject({
      status: "paused",
      error: result.error,
      usingInternalClock: false,
    });

    controls.continueWithoutNarration();

    expect(controls.getNarrationSnapshot()).toMatchObject({
      usingInternalClock: true,
      error: null,
    });
    expect(controls.getSnapshot().phase).toBe("playing");
    composition.dispose();
  });

  it("continues an authored silent tail from natural narration end without duplicating cues or heartbeats", async () => {
    const heartbeat = createAnimationFrameHarness();
    const media = createTestNarrationAudio();
    const execute = vi.fn(async () => Result.ok());
    const narratedTimeline = Object.freeze({
      ...emptyPresentationTimeline(SURFACE_ID, 10_000),
      narration: Object.freeze({
        source: Object.freeze({
          mode: "external" as const,
          src: "https://media.example.test/narration.mp3",
        }),
      }),
      cues: Object.freeze([
        Object.freeze({
          id: EmbeddedDataIdSchema.parse("narratecue01"),
          atMs: 3_000,
          command: Object.freeze({
            kind: "target-command" as const,
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "select",
          }),
          seekBehavior: "consume" as const,
        }),
      ]),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: narratedTimeline, autoAdvance: false } },
      controlBindings: {
        get: () => ({ ownerId: OWNER_ID, commandExecutor: { execute } }),
      },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
          kind: "reached" as const,
          requestedId,
        })),
      },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange: vi.fn(() => Result.ok()),
      createNarrationAudioElement: () => media.audio,
    });
    const controls = composition.presentationControls;
    if (!controls) throw new Error("Expected Presentation controls.");

    try {
      await vi.waitFor(() => expect(media.audio.src).toContain("narration.mp3"));
      media.confirmMetadata(4);
      const playing = controls.play();
      media.confirmPlay();
      await playing;
      expect(heartbeat.pendingCount()).toBe(1);

      media.confirmEnd(4);
      await flushPromises();

      expect(controls.getNarrationSnapshot()).toMatchObject({
        status: "ended",
        currentTimeMs: 4_000,
        usingInternalClock: true,
        error: null,
      });
      expect(controls.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 4_000 });
      expect(execute).toHaveBeenCalledOnce();
      expect(heartbeat.pendingCount()).toBe(1);

      heartbeat.step(5_000);
      expect(controls.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 9_000 });
      heartbeat.step(6_000);
      await flushPromises();

      expect(controls.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 10_000 });
      expect(execute).toHaveBeenCalledOnce();
      expect(media.native.paused).toBe(true);
      expect(heartbeat.pendingCount()).toBe(0);
    } finally {
      composition.dispose();
      heartbeat.restore();
    }
  });

  it("completes normally when narration naturally ends at the Timeline endpoint", async () => {
    const heartbeat = createAnimationFrameHarness();
    const media = createTestNarrationAudio();
    const composition = createNarratedComposition(media.audio);
    const controls = composition.presentationControls;
    if (!controls) throw new Error("Expected Presentation controls.");

    try {
      await vi.waitFor(() => expect(media.audio.src).toContain("narration.mp3"));
      media.confirmMetadata(10);
      const playing = controls.play();
      media.confirmPlay();
      await playing;

      media.confirmEnd(10);
      heartbeat.step(0);

      expect(controls.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 10_000 });
      expect(controls.getNarrationSnapshot()).toMatchObject({
        status: "ended",
        usingInternalClock: false,
        error: null,
      });
      expect(heartbeat.pendingCount()).toBe(0);
    } finally {
      composition.dispose();
      heartbeat.restore();
    }
  });

  it("disposes narration media before the active Surface runtime", async () => {
    const order: string[] = [];
    const media = createTestNarrationAudio(() => order.push("narration"));
    const composition = createNarratedComposition(media.audio, () => order.push("learner"));
    await vi.waitFor(() => expect(media.audio.src).toContain("narration.mp3"));
    media.confirmMetadata(10);

    composition.dispose();

    expect(order).toEqual(["narration", "learner"]);
    expect(media.audio.getAttribute("src")).toBeNull();
  });

  it.each([
    {
      name: "learner program",
      program: {
        learnerInteractions: learnerProgram(OTHER_SURFACE_ID),
      } satisfies SlideshowSurfaceRuntimeProgram,
      expected:
        'Slideshow learner program Surface "surface00002" does not match active Surface "surface00001".',
    },
    {
      name: "Presentation Timeline",
      program: {
        learnerInteractions: learnerProgram(SURFACE_ID),
        presentation: {
          timeline: timeline(OTHER_SURFACE_ID),
          autoAdvance: false,
        },
      } satisfies SlideshowSurfaceRuntimeProgram,
      expected:
        'Slideshow Presentation Timeline Surface "surface00002" does not match active Surface "surface00001".',
    },
  ])("rejects a mismatched $name before subscribing", ({ program, expected }) => {
    const subscribe = vi.fn(() => vi.fn());
    const get = vi.fn(() => ({ ownerId: OWNER_ID, eventSource: { subscribe } }));

    expect(() =>
      createSlideshowSurfaceRuntimeComposition({
        surfaceId: SURFACE_ID,
        program: program as SlideshowSurfaceRuntimeProgram,
        controlBindings: { get },
        semanticTargets: { activate: vi.fn() },
        featureViewBaseline: emptyFeatureViewBaseline(),
        requestSurfaceChange: vi.fn(() => Result.ok()),
      }),
    ).toThrow(expected);
    expect(get).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("uses one learner runtime for rule turns and the Presentation gate", async () => {
    const events = createTestEventSource();
    const execute = vi.fn(
      async (_request: ControlCommandRequest): Promise<ControlCommandResult> => Result.ok(),
    );
    const activate = vi.fn(async (requestedId: EmbeddedNodeId) => ({
      kind: "reached" as const,
      requestedId,
    }));
    const binding = {
      ownerId: OWNER_ID,
      eventSource: events.eventSource,
      commandExecutor: { execute },
    };
    const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
    const interactions = Object.freeze<CompiledSurfaceLearnerInteractionProgram>({
      surfaceId: SURFACE_ID,
      rulesByEvent: new Map([
        [
          createLearnerInteractionEventKey(when),
          [
            {
              id: "rule-command" as EmbeddedDataId,
              when,
              conditions: [],
              commands: [
                {
                  kind: "target-command",
                  ownerId: OWNER_ID,
                  targetId: TARGET_ID,
                  type: "rule-command",
                },
                { kind: "navigate-surface", surfaceId: OTHER_SURFACE_ID },
              ],
            },
          ],
        ],
      ]),
    });
    const presentationTimeline = Object.freeze<CompiledSurfacePresentationTimeline>({
      surfaceId: SURFACE_ID,
      durationMs: 100,
      visualProgram: emptyVisualProgram(SURFACE_ID, 100),
      cues: [
        {
          id: EmbeddedDataIdSchema.parse("action000001"),
          atMs: 0,
          command: {
            kind: "target-command",
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "presentation-command",
          },
          seekBehavior: "consume",
        },
      ],
      waits: [
        {
          kind: "learner-wait",
          id: "learner-wait" as PresentationWaitId,
          atMs: 0,
          requirement: { kind: "event", ...when },
        },
      ],
    });
    const refusal: SurfaceChangeRefused = Object.freeze({
      reason: "surface-exit-blocked",
      activeSurfaceId: SURFACE_ID,
      targetSurfaceId: OTHER_SURFACE_ID,
      blockers: Object.freeze([
        Object.freeze({
          reason: "quiz-not-complete" as const,
          ownerId: "quiz-one",
          surfaceId: SURFACE_ID,
          attemptStatus: "in_progress" as const,
        }),
      ] as const),
    });
    const requestSurfaceChange = vi.fn((): SurfaceChangeResult => Result.err(refusal));
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: {
        learnerInteractions: interactions,
        presentation: { timeline: presentationTimeline, autoAdvance: false },
      },
      controlBindings: {
        get: () => binding,
      },
      semanticTargets: { activate },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange,
    });
    const report = vi.fn();
    composition.learnerRuntime.subscribeReports(report);
    const session = composition.presentationControls;
    if (!session) throw new Error("Expected a Presentation Session.");

    expect(session.getSnapshot().phase).toBe("awaiting-start");
    expect(events.subscriptionsStarted).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    void session.play();
    await flushPromises();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "waiting" },
    });
    expect(activate).toHaveBeenCalledWith(TARGET_ID, {
      origin: "configured-presentation",
      signal: expect.any(AbortSignal),
    });

    await events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();

    expect(report).toHaveBeenCalledOnce();
    expect(execute.mock.calls.map(([request]) => request.type)).toEqual([
      "presentation-command",
      "rule-command",
    ]);
    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID, {
      kind: "satisfied-learner-rule-branch",
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        commandExecutions: expect.arrayContaining([
          expect.objectContaining({ outcome: { kind: "navigation-cancelled" } }),
        ]),
        end: "completed",
      }),
    );
    expect(events.listenerCount).toBe(1);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "ready" },
    });
    composition.dispose();
  });

  it("terminates a successful satisfying learner branch without releasing its outgoing gate", async () => {
    const events = createTestEventSource();
    const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };
    const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
    const requestSurfaceChange = vi.fn(() => Result.ok());
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: {
        learnerInteractions: learnerProgram(SURFACE_ID),
        presentation: {
          timeline: {
            surfaceId: SURFACE_ID,
            durationMs: 100,
            visualProgram: emptyVisualProgram(SURFACE_ID, 100),
            cues: [],
            waits: [
              {
                kind: "learner-wait",
                id: "branch-wait1" as PresentationWaitId,
                atMs: 0,
                requirement: { kind: "event", ...when },
              },
            ],
          },
          autoAdvance: false,
        },
      },
      controlBindings: { get: () => binding },
      semanticTargets: { activate: vi.fn() },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange,
    });
    const report = vi.fn();
    composition.learnerRuntime.subscribeReports(report);
    const session = composition.presentationControls;
    if (!session) throw new Error("Expected a Presentation Session.");
    void session.play();
    await flushPromises();

    await events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();

    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID, {
      kind: "satisfied-learner-rule-branch",
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ end: "surface-navigation-committed" }),
    );
    expect(events.listenerCount).toBe(0);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "waiting" },
    });
    composition.dispose();
  });

  it("rolls back the learner runtime when Presentation construction throws", () => {
    const events = createTestEventSource();
    const constructionDefect = new Error("invalid Presentation policy");
    const throwingPresentation = {
      timeline: timeline(SURFACE_ID),
      get autoAdvance(): boolean {
        throw constructionDefect;
      },
    };
    const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };

    expect(() =>
      createSlideshowSurfaceRuntimeComposition({
        surfaceId: SURFACE_ID,
        program: {
          learnerInteractions: learnerProgram(SURFACE_ID),
          presentation: throwingPresentation,
        },
        controlBindings: { get: () => binding },
        semanticTargets: { activate: vi.fn() },
        featureViewBaseline: emptyFeatureViewBaseline(),
        requestSurfaceChange: vi.fn(() => Result.ok()),
      }),
    ).toThrow(constructionDefect);
    expect(events.subscriptionsStarted).toBe(1);
    expect(events.unsubscriptionsCompleted).toBe(1);
    expect(events.listenerCount).toBe(0);
  });

  it("maps blocked learner navigation to the typed cancelled outcome", async () => {
    const events = createTestEventSource();
    const refusal: SurfaceChangeRefused = Object.freeze({
      reason: "surface-exit-blocked",
      activeSurfaceId: SURFACE_ID,
      targetSurfaceId: OTHER_SURFACE_ID,
      blockers: Object.freeze([
        Object.freeze({
          reason: "quiz-not-complete" as const,
          ownerId: "quiz-one",
          surfaceId: SURFACE_ID,
          attemptStatus: "in_progress" as const,
        }),
      ] as const),
    });
    const requestSurfaceChange = vi.fn((): SurfaceChangeResult => Result.err(refusal));
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);
    const report = vi.fn();
    composition.learnerRuntime.subscribeReports(report);

    await events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();

    expect(composition.presentationControls).toBeUndefined();
    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        commandExecutions: [
          {
            address: { ruleId: "rule-1", commandIndex: 0 },
            outcome: { kind: "navigation-cancelled" },
          },
        ],
        end: "completed",
      }),
    );
    expect(events.listenerCount).toBe(1);
    composition.dispose();
  });

  it("preserves a thrown navigation lifecycle defect", async () => {
    const defect = new Error("active Surface lifecycle changed");
    const events = createTestEventSource();
    const requestSurfaceChange = vi.fn((): SurfaceChangeResult => {
      throw defect;
    });
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);

    await expect(events.emit({ targetId: TARGET_ID, type: "selected" })).rejects.toBe(defect);

    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID);
    expect(events.listenerCount).toBe(0);
    composition.dispose();
  });

  it("keeps an unknown learner-rule destination observable through requestSurfaceChange", async () => {
    const events = createTestEventSource();
    const requestSurfaceChange = vi.fn(
      createRequestSurfaceChange({
        environment: {
          evaluateSnapshot() {
            throw new Error("Unknown identity must fail before Surface Exit evaluation.");
          },
        },
        getActiveSurfaceId: () => SURFACE_ID,
        isKnownSurfaceId: (surfaceId) => surfaceId === SURFACE_ID,
        commitSurfaceChange: vi.fn(),
      }),
    );
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);

    await expect(events.emit({ targetId: TARGET_ID, type: "selected" })).rejects.toThrow(
      `Cannot request unknown Slideshow Surface "${OTHER_SURFACE_ID}".`,
    );

    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID);
    expect(events.listenerCount).toBe(0);
    composition.dispose();
  });

  it("rejects an undeclared Surface-change error instead of converting it to cancellation", async () => {
    const events = createTestEventSource();
    const requestSurfaceChange = vi.fn(
      () => Result.err({ reason: "unexpected" }) as unknown as SurfaceChangeResult,
    );
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);

    let observedDefect: unknown;
    try {
      await events.emit({ targetId: TARGET_ID, type: "selected" });
    } catch (error) {
      observedDefect = error;
    } finally {
      composition.dispose();
    }

    expect(observedDefect).toEqual(
      new Error('Unexpected Slideshow Surface change error "unexpected".'),
    );
    expect(events.listenerCount).toBe(0);
  });

  it.each([
    {
      autoAdvance: false,
      expected: { phase: "held", hold: { kind: "learner", status: "ready" } },
    },
    { autoAdvance: true, expected: { phase: "completed" } },
  ] as const)(
    "uses an empty learner program as the Presentation gate with autoAdvance=$autoAdvance",
    async ({ autoAdvance, expected }) => {
      const events = createTestEventSource();
      const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };
      const gateTimeline = Object.freeze<CompiledSurfacePresentationTimeline>({
        surfaceId: SURFACE_ID,
        durationMs: 0,
        visualProgram: emptyVisualProgram(SURFACE_ID, 0),
        cues: Object.freeze([]),
        waits: Object.freeze([
          {
            kind: "learner-wait",
            id: "empty-program-wait" as PresentationWaitId,
            atMs: 0,
            requirement: {
              kind: "event",
              ownerId: OWNER_ID,
              targetId: TARGET_ID,
              type: "selected",
            },
          },
        ]),
      });
      const composition = createSlideshowSurfaceRuntimeComposition({
        surfaceId: SURFACE_ID,
        program: { presentation: { timeline: gateTimeline, autoAdvance } },
        controlBindings: { get: () => binding },
        semanticTargets: { activate: vi.fn() },
        featureViewBaseline: emptyFeatureViewBaseline(),
        requestSurfaceChange: vi.fn(() => Result.ok()),
      });
      const session = composition.presentationControls;
      if (!session) throw new Error("Expected a Presentation Session.");
      expect(events.subscriptionsStarted).toBe(0);

      void session.play();
      await flushPromises();
      expect(events.subscriptionsStarted).toBe(1);
      expect(session.getSnapshot()).toMatchObject({
        phase: "held",
        hold: { kind: "learner", status: "waiting" },
      });

      await events.emit({ targetId: TARGET_ID, type: "selected" });
      await flushPromises();
      expect(session.getSnapshot()).toMatchObject(expected);
      composition.dispose();
      expect(events.listenerCount).toBe(0);
    },
  );

  it("keeps an auto-advancing manual Wait behind explicit advance", async () => {
    const manualTimeline = Object.freeze<CompiledSurfacePresentationTimeline>({
      surfaceId: SURFACE_ID,
      durationMs: 0,
      visualProgram: emptyVisualProgram(SURFACE_ID, 0),
      cues: Object.freeze([]),
      waits: Object.freeze([
        { kind: "manual-wait", id: "manual-auto-wait" as PresentationWaitId, atMs: 0 },
      ]),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: manualTimeline, autoAdvance: true } },
      controlBindings: { get: () => undefined },
      semanticTargets: { activate: vi.fn() },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const controls = composition.presentationControls;
    if (!controls) throw new Error("Expected a Presentation Session.");

    expect((await controls.play()).isOk()).toBe(true);
    expect(controls.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: "manual-auto-wait" },
    });

    expect((await controls.advance()).isOk()).toBe(true);
    expect(controls.getSnapshot()).toMatchObject({ phase: "completed" });
    composition.dispose();
  });

  it("disposes Presentation before learner subscriptions without stale reports", async () => {
    const disposalOrder: string[] = [];
    const events = createTestEventSource(() => disposalOrder.push("learner"));
    const pendingCommand = deferred<ControlCommandResult>();
    let commandSignal: AbortSignal | undefined;
    const execute = vi.fn(({ signal }: { readonly signal: AbortSignal }) => {
      commandSignal = signal;
      signal.addEventListener("abort", () => disposalOrder.push("presentation"), { once: true });
      return pendingCommand.promise;
    });
    const binding = {
      ownerId: OWNER_ID,
      eventSource: events.eventSource,
      commandExecutor: { execute },
    };
    const disposalTimeline = Object.freeze<CompiledSurfacePresentationTimeline>({
      surfaceId: SURFACE_ID,
      durationMs: 100,
      visualProgram: emptyVisualProgram(SURFACE_ID, 100),
      cues: [
        {
          id: EmbeddedDataIdSchema.parse("action000002"),
          atMs: 0,
          command: {
            kind: "target-command",
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "pending-command",
          },
          seekBehavior: "consume",
        },
      ],
      waits: [{ kind: "manual-wait", id: "manual-wait" as PresentationWaitId, atMs: 0 }],
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: {
        learnerInteractions: learnerProgram(SURFACE_ID),
        presentation: { timeline: disposalTimeline, autoAdvance: false },
      },
      controlBindings: { get: () => binding },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
          kind: "reached" as const,
          requestedId,
        })),
      },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const learnerReport = vi.fn();
    const cueReport = vi.fn();
    composition.learnerRuntime.subscribeReports(learnerReport);
    const session = composition.presentationControls;
    if (!session) throw new Error("Expected a Presentation Session.");
    session.subscribeCueReports(cueReport);
    void session.play();
    await flushPromises();
    expect(execute).toHaveBeenCalledOnce();

    composition.dispose();
    composition.dispose();

    expect(commandSignal?.aborted).toBe(true);
    expect(disposalOrder).toEqual(["presentation", "learner"]);
    expect(events.unsubscriptionsCompleted).toBe(1);
    expect(events.listenerCount).toBe(0);
    pendingCommand.resolve(Result.ok());
    await flushPromises();
    expect(learnerReport).not.toHaveBeenCalled();
    expect(cueReport).not.toHaveBeenCalled();
    expect(() => session.getSnapshot()).toThrow(
      "Cannot read a disposed Presentation Playback Session.",
    );
  });

  it("checks cancellation before committing learner Surface navigation", async () => {
    const events = createTestEventSource();
    const pendingCommand = deferred<ControlCommandResult>();
    let commandSignal: AbortSignal | undefined;
    const execute = vi.fn(({ signal }: { readonly signal: AbortSignal }) => {
      commandSignal = signal;
      return pendingCommand.promise;
    });
    const binding = {
      ownerId: OWNER_ID,
      eventSource: events.eventSource,
      commandExecutor: { execute },
    };
    const requestSurfaceChange = vi.fn(() => Result.ok());
    const report = vi.fn();
    const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
    const interactions: CompiledSurfaceLearnerInteractionProgram = {
      surfaceId: SURFACE_ID,
      rulesByEvent: new Map([
        [
          createLearnerInteractionEventKey(when),
          [
            {
              id: "cancel-before-navigation" as EmbeddedDataId,
              when,
              conditions: [],
              commands: [
                {
                  kind: "target-command",
                  ownerId: OWNER_ID,
                  targetId: TARGET_ID,
                  type: "pending-command",
                },
                { kind: "navigate-surface", surfaceId: OTHER_SURFACE_ID },
              ],
            },
          ],
        ],
      ]),
    };
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { learnerInteractions: interactions },
      controlBindings: { get: () => binding },
      semanticTargets: { activate: vi.fn() },
      featureViewBaseline: emptyFeatureViewBaseline(),
      requestSurfaceChange,
    });
    composition.learnerRuntime.subscribeReports(report);

    const turn = events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();
    expect(execute).toHaveBeenCalledOnce();
    composition.dispose();
    pendingCommand.resolve(Result.ok());
    await turn;
    await flushPromises();

    expect(commandSignal?.aborted).toBe(true);
    expect(requestSurfaceChange).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(events.listenerCount).toBe(0);
  });
});

function createLearnerOnlyComposition(
  events: ReturnType<typeof createTestEventSource>,
  requestSurfaceChange: (surfaceId: SurfaceId) => SurfaceChangeResult,
) {
  const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };
  return createSlideshowSurfaceRuntimeComposition({
    surfaceId: SURFACE_ID,
    program: { learnerInteractions: learnerProgram(SURFACE_ID) },
    controlBindings: { get: () => binding },
    semanticTargets: { activate: vi.fn() },
    featureViewBaseline: emptyFeatureViewBaseline(),
    requestSurfaceChange,
  });
}

function createNarratedComposition(audio: HTMLAudioElement, onLearnerDispose?: () => void) {
  const events = createTestEventSource(onLearnerDispose);
  return createSlideshowSurfaceRuntimeComposition({
    surfaceId: SURFACE_ID,
    program: {
      presentation: {
        timeline: Object.freeze({
          ...emptyPresentationTimeline(SURFACE_ID, 10_000),
          narration: Object.freeze({
            source: Object.freeze({
              mode: "external" as const,
              src: "https://media.example.test/narration.mp3",
            }),
          }),
        }),
        autoAdvance: false,
      },
      ...(onLearnerDispose ? { learnerInteractions: learnerProgram(SURFACE_ID) } : {}),
    },
    controlBindings: {
      get: () => ({ ownerId: OWNER_ID, eventSource: events.eventSource }),
    },
    semanticTargets: { activate: vi.fn() },
    featureViewBaseline: emptyFeatureViewBaseline(),
    requestSurfaceChange: vi.fn(() => Result.ok()),
    createNarrationAudioElement: () => audio,
  });
}

function timeline(surfaceId: SurfaceId): CompiledSurfacePresentationTimeline {
  return emptyPresentationTimeline(surfaceId, 1_000);
}

function emptyPresentationTimeline(
  surfaceId: SurfaceId,
  durationMs: number,
): CompiledSurfacePresentationTimeline {
  return Object.freeze({
    surfaceId,
    durationMs,
    cues: Object.freeze([]),
    waits: Object.freeze([]),
    visualProgram: emptyVisualProgram(surfaceId, durationMs),
  });
}

function emptyVisualProgram(
  surfaceId: SurfaceId,
  durationMs: number,
): CompiledSurfacePresentationTimeline["visualProgram"] {
  return Object.freeze({
    surfaceId,
    durationMs,
    targetById: new Map(),
    segments: Object.freeze([]),
    sequenceContainers: Object.freeze([]),
  });
}

function emptyFeatureViewBaseline() {
  return { replaceForOwners: vi.fn() };
}

function learnerProgram(surfaceId: SurfaceId): CompiledSurfaceLearnerInteractionProgram {
  const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
  return Object.freeze({
    surfaceId,
    rulesByEvent: new Map([
      [
        createLearnerInteractionEventKey(when),
        Object.freeze([
          Object.freeze({
            id: "rule-1" as EmbeddedDataId,
            when,
            conditions: Object.freeze([]),
            commands: Object.freeze([
              { kind: "navigate-surface" as const, surfaceId: OTHER_SURFACE_ID },
            ]) as readonly [{ readonly kind: "navigate-surface"; readonly surfaceId: SurfaceId }],
          }),
        ]),
      ],
    ]),
  });
}

function createTestEventSource(onUnsubscribe: () => void = () => undefined): {
  readonly eventSource: EventSource;
  readonly subscriptionsStarted: number;
  readonly unsubscriptionsCompleted: number;
  readonly listenerCount: number;
  emit(event: ControlEvent): Promise<void>;
} {
  const listeners = new Set<ControlEventListener>();
  let subscriptionsStarted = 0;
  let unsubscriptionsCompleted = 0;
  return {
    eventSource: {
      subscribe(listener) {
        subscriptionsStarted += 1;
        listeners.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
          unsubscriptionsCompleted += 1;
          onUnsubscribe();
        };
      },
    },
    get subscriptionsStarted() {
      return subscriptionsStarted;
    },
    get listenerCount() {
      return listeners.size;
    },
    get unsubscriptionsCompleted() {
      return unsubscriptionsCompleted;
    },
    async emit(event) {
      await Promise.all(
        [...listeners].map((listener) =>
          Promise.resolve(
            (listener as (received: ControlEvent) => Promise<void> | undefined)(event),
          ),
        ),
      );
    },
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createAnimationFrameHarness() {
  let nowMs = 0;
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const now = vi.spyOn(performance, "now").mockImplementation(() => nowMs);
  const request = vi
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id: number) => {
    callbacks.delete(id);
  });

  return {
    pendingCount: () => callbacks.size,
    step(nextNowMs: number) {
      nowMs = nextNowMs;
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(nowMs);
    },
    restore() {
      cancel.mockRestore();
      request.mockRestore();
      now.mockRestore();
    },
  };
}

function createTestNarrationAudio(onDispose?: () => void) {
  const audio = document.createElement("audio");
  const native = {
    currentTime: 0,
    duration: Number.NaN,
    ended: false,
    error: null as MediaError | null,
    paused: true,
  };
  Object.defineProperties(audio, {
    currentTime: {
      configurable: true,
      get: () => native.currentTime,
      set: (value: number) => {
        native.currentTime = value;
      },
    },
    duration: { configurable: true, get: () => native.duration },
    ended: { configurable: true, get: () => native.ended },
    error: { configurable: true, get: () => native.error },
    paused: { configurable: true, get: () => native.paused },
  });
  Object.defineProperty(audio, "load", { configurable: true, value: vi.fn() });
  let confirmPendingPlay: (() => void) | null = null;
  const play = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        confirmPendingPlay = resolve;
      }),
  );
  Object.defineProperty(audio, "play", { configurable: true, value: play });
  const pause = vi.fn(() => {
    native.paused = true;
  });
  Object.defineProperty(audio, "pause", { configurable: true, value: pause });
  const removeAttribute = audio.removeAttribute.bind(audio);
  vi.spyOn(audio, "removeAttribute").mockImplementation((name) => {
    if (name === "src") onDispose?.();
    removeAttribute(name);
  });

  return {
    audio,
    native,
    pause,
    play,
    confirmMetadata(durationSeconds: number) {
      native.duration = durationSeconds;
      audio.dispatchEvent(new Event("loadedmetadata"));
    },
    confirmPlay() {
      native.paused = false;
      native.ended = false;
      audio.dispatchEvent(new Event("play"));
      confirmPendingPlay?.();
      confirmPendingPlay = null;
    },
    confirmEnd(seconds: number) {
      native.currentTime = seconds;
      native.ended = true;
      native.paused = true;
      audio.dispatchEvent(new Event("ended"));
    },
    confirmSeek(seconds: number) {
      native.currentTime = seconds;
      audio.dispatchEvent(new Event("seeked"));
    },
  };
}
