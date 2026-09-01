import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CompiledInternalClockSurfaceTimeline } from "./compiled-presentation-program";
import type {
  PresentationCueExecutionOutcome,
  PresentationCueExecutor,
} from "./presentation-cue-executor";
import { createPresentationSurfaceRepositioner } from "./presentation-surface-repositioner";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OWNER_A = EmbeddedNodeIdSchema.parse("owner0000001");
const OWNER_B = EmbeddedNodeIdSchema.parse("owner0000002");
const OWNER_C = EmbeddedNodeIdSchema.parse("owner0000003");
const TARGET_A = EmbeddedNodeIdSchema.parse("target000001");
const TARGET_B = EmbeddedNodeIdSchema.parse("target000002");
const TARGET_C = EmbeddedNodeIdSchema.parse("target000003");

describe("createPresentationSurfaceRepositioner", () => {
  it("restores every reconstructable owner before replaying only due state cues in stable order", async () => {
    const calls: string[] = [];
    const replaceForOwners = vi.fn((ownerIds: readonly string[]) => {
      calls.push(`baseline:${ownerIds.join(",")}`);
    });
    const cueExecutor: PresentationCueExecutor = {
      async execute({ command }) {
        calls.push(`execute:${command.type}`);
        return { kind: "succeeded" };
      },
    };
    const repositioner = createPresentationSurfaceRepositioner({
      timeline: timeline([
        cue("action000001", 100, OWNER_A, TARGET_A, "select-a", "reconstruct-state"),
        cue("action000002", 150, OWNER_A, TARGET_A, "play-audio", "consume"),
        cue("action000003", 200, OWNER_B, TARGET_B, "select-b", "reconstruct-state"),
        cue("action000004", 200, OWNER_A, TARGET_A, "select-a-again", "reconstruct-state"),
        cue("action000005", 800, OWNER_C, TARGET_C, "select-c", "reconstruct-state"),
      ]),
      featureViewBaseline: { replaceForOwners },
      cueExecutor,
    });

    const report = await repositioner.reposition(250);

    expect(calls).toEqual([
      `baseline:${OWNER_A},${OWNER_B},${OWNER_C}`,
      "execute:select-a",
      "execute:select-b",
      "execute:select-a-again",
    ]);
    expect(report).toMatchObject({
      kind: "applied",
      timeMs: 250,
      cueReports: [
        { cueId: "action000001", outcome: { kind: "succeeded" } },
        { cueId: "action000003", outcome: { kind: "succeeded" } },
        { cueId: "action000004", outcome: { kind: "succeeded" } },
      ],
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.cueReports)).toBe(true);
    expect(Object.isFrozen(report.cueReports[0]?.outcome)).toBe(true);
  });

  it("retains independent expected command refusals", async () => {
    const outcomes: PresentationCueExecutionOutcome[] = [
      { kind: "succeeded" },
      {
        kind: "target-not-reached",
        result: { kind: "missing-target", requestedId: TARGET_B },
      },
      {
        kind: "control-command-error",
        error: { reason: "playback-not-allowed" },
      },
    ];
    const cueExecutor: PresentationCueExecutor = {
      execute: vi.fn(async () => outcomes.shift()!),
    };
    const repositioner = createPresentationSurfaceRepositioner({
      timeline: timeline([
        cue("action000001", 100, OWNER_A, TARGET_A, "first", "reconstruct-state"),
        cue("action000002", 200, OWNER_B, TARGET_B, "second", "reconstruct-state"),
        cue("action000003", 300, OWNER_C, TARGET_C, "third", "reconstruct-state"),
      ]),
      featureViewBaseline: { replaceForOwners: vi.fn() },
      cueExecutor,
    });

    const report = await repositioner.reposition(300);

    expect(report.cueReports.map(({ outcome }) => outcome)).toEqual([
      { kind: "succeeded" },
      {
        kind: "target-not-reached",
        result: { kind: "missing-target", requestedId: TARGET_B },
      },
      {
        kind: "control-command-error",
        error: { reason: "playback-not-allowed" },
      },
    ]);
    expect(cueExecutor.execute).toHaveBeenCalledTimes(3);
  });

  it("marks an older asynchronous request superseded without a queue", async () => {
    let finishFirst: ((outcome: PresentationCueExecutionOutcome) => void) | undefined;
    const cueExecutor: PresentationCueExecutor = {
      execute: vi.fn(
        () =>
          new Promise<PresentationCueExecutionOutcome>((resolve) => {
            finishFirst = resolve;
          }),
      ),
    };
    const replaceForOwners = vi.fn();
    const repositioner = createPresentationSurfaceRepositioner({
      timeline: timeline([
        cue("action000001", 100, OWNER_A, TARGET_A, "select-a", "reconstruct-state"),
      ]),
      featureViewBaseline: { replaceForOwners },
      cueExecutor,
    });

    const first = repositioner.reposition(100);
    const second = await repositioner.reposition(0);
    finishFirst?.({ kind: "succeeded" });

    await expect(first).resolves.toMatchObject({ kind: "superseded", timeMs: 100 });
    expect(second).toMatchObject({ kind: "applied", timeMs: 0, cueReports: [] });
    expect(replaceForOwners).toHaveBeenCalledTimes(2);
  });

  it("leaves programming defects observable", async () => {
    const defect = new Error("broken binding identity");
    const repositioner = createPresentationSurfaceRepositioner({
      timeline: timeline([
        cue("action000001", 100, OWNER_A, TARGET_A, "select-a", "reconstruct-state"),
      ]),
      featureViewBaseline: { replaceForOwners: vi.fn() },
      cueExecutor: { execute: vi.fn(async () => Promise.reject(defect)) },
    });

    await expect(repositioner.reposition(100)).rejects.toBe(defect);
  });
});

function timeline(
  cues: CompiledInternalClockSurfaceTimeline["cues"],
): CompiledInternalClockSurfaceTimeline {
  return Object.freeze({
    surfaceId: SURFACE_ID,
    durationMs: 1_000,
    cues: Object.freeze(cues),
    waits: Object.freeze([]),
  });
}

function cue(
  id: string,
  atMs: number,
  ownerId: typeof OWNER_A,
  targetId: typeof TARGET_A,
  type: string,
  seekBehavior: "reconstruct-state" | "consume",
): CompiledInternalClockSurfaceTimeline["cues"][number] {
  return Object.freeze({
    id: EmbeddedDataIdSchema.parse(id),
    atMs,
    command: { kind: "target-command", ownerId, targetId, type },
    seekBehavior,
  });
}
