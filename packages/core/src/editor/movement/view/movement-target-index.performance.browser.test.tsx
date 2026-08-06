import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import {
  ARTIFICIAL_MOVEMENT_BLOCK_COUNT,
  createArtificialLargeMovementFixture,
  type ArtificialLargeMovementFixture,
} from "../testing/artificial-large-movement-fixture";

const performanceEnabled = import.meta.env.SCAFFOLD_DRAG_PERF === "1";
const performanceIt = performanceEnabled ? it : it.skip;
const mounted: ArtificialLargeMovementFixture[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.dispose();
});

describe("movement target index stable-runner budget", () => {
  performanceIt(
    "meets construction, lookup, long-task, and frame-rate budgets",
    async () => {
      await page.viewport(1000, 720);
      const fixture = createArtificialLargeMovementFixture();
      mounted.push(fixture);
      const runner = runnerIdentity();
      console.warn(`[movement-drag-perf] runner ${JSON.stringify(runner)}`);

      const constructionMs = fixture.startIndex();
      const points = Array.from({ length: 256 }, (_, index) =>
        fixture.pointForBlock(1 + ((index * 7) % (ARTIFICIAL_MOVEMENT_BLOCK_COUNT - 1))),
      );
      for (let index = 0; index < 100; index += 1) {
        fixture.controller.updatePoint(points[index % points.length]!);
      }

      const lookupDurations: number[] = [];
      for (let index = 0; index < 2_000; index += 1) {
        const startedAt = performance.now();
        fixture.controller.updatePoint(points[index % points.length]!);
        lookupDurations.push(performance.now() - startedAt);
      }
      const lookupP95Ms = percentile(lookupDurations, 0.95);
      const lookupMaxMs = Math.max(...lookupDurations);
      const autoScroll = await measureAutoScroll(fixture, 10_000);
      const metrics = {
        backwardCandidateMoves: autoScroll.backwardCandidateMoves,
        candidateQueries: autoScroll.candidateQueries,
        constructionMs,
        forwardCandidateMoves: autoScroll.forwardCandidateMoves,
        framesPerSecond: autoScroll.framesPerSecond,
        lookupMaxMs,
        lookupP95Ms,
        maxLongTaskMs: autoScroll.maxLongTaskMs,
        observedFrames: autoScroll.observedFrames,
      };
      console.warn(`[movement-drag-perf] metrics ${JSON.stringify(metrics)}`);

      expect(constructionMs).toBeLessThan(100);
      expect(lookupP95Ms).toBeLessThan(4);
      expect(lookupMaxMs).toBeLessThan(8);
      expect(autoScroll.candidateQueries).toBeGreaterThan(0);
      expect(autoScroll.forwardCandidateMoves).toBeGreaterThan(10);
      expect(autoScroll.backwardCandidateMoves).toBeGreaterThan(10);
      expect(autoScroll.maxLongTaskMs).toBeLessThanOrEqual(50);
      expect(autoScroll.framesPerSecond).toBeGreaterThanOrEqual(55);
    },
    30_000,
  );
});

async function measureAutoScroll(
  fixture: ArtificialLargeMovementFixture,
  durationMs: number,
): Promise<{
  backwardCandidateMoves: number;
  candidateQueries: number;
  forwardCandidateMoves: number;
  framesPerSecond: number;
  maxLongTaskMs: number;
  observedFrames: number;
}> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const longTasks: number[] = [];
  const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes("longtask");
  expect(longTaskSupported).toBe(true);
  const observer = new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) longTasks.push(entry.duration);
  });
  observer.observe({ entryTypes: ["longtask"] });

  const timestamps: number[] = [];
  const maximumScroll = fixture.scrollRoot.scrollHeight - fixture.scrollRoot.clientHeight;
  const workloadMaximumScroll = Math.min(maximumScroll, 9_000);
  const queryCountBeforeScroll = fixture.counts.candidateQueries;
  let backwardCandidateMoves = 0;
  let direction: -1 | 1 = 1;
  let forwardCandidateMoves = 0;
  let lastAppliedDirection: -1 | 1 | null = null;
  let previousCandidatePos = fixture.controller.getCandidate()?.target.pos ?? null;
  await new Promise<void>((resolve) => {
    let firstTimestamp: number | null = null;
    const frame = (timestamp: number) => {
      firstTimestamp ??= timestamp;
      timestamps.push(timestamp);
      const currentCandidatePos = fixture.controller.getCandidate()?.target.pos ?? null;
      if (
        previousCandidatePos !== null &&
        currentCandidatePos !== null &&
        currentCandidatePos !== previousCandidatePos
      ) {
        if (lastAppliedDirection === 1 && currentCandidatePos > previousCandidatePos) {
          forwardCandidateMoves += 1;
        } else if (lastAppliedDirection === -1 && currentCandidatePos < previousCandidatePos) {
          backwardCandidateMoves += 1;
        }
      }
      previousCandidatePos = currentCandidatePos;
      const appliedDirection = direction;
      let nextScrollTop = fixture.scrollRoot.scrollTop + direction * 180;
      if (nextScrollTop >= workloadMaximumScroll) {
        direction = -1;
        nextScrollTop = workloadMaximumScroll;
      } else if (nextScrollTop <= 0) {
        direction = 1;
        nextScrollTop = 0;
      }
      fixture.scrollRoot.scrollTop = nextScrollTop;
      fixture.scrollRoot.dispatchEvent(new Event("scroll"));
      lastAppliedDirection = appliedDirection;

      if (timestamp - firstTimestamp >= durationMs) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await animationFrames(2);
  for (const entry of observer.takeRecords()) longTasks.push(entry.duration);
  observer.disconnect();

  const elapsed = timestamps.at(-1)! - timestamps[0]!;
  return {
    backwardCandidateMoves,
    candidateQueries: fixture.counts.candidateQueries - queryCountBeforeScroll,
    forwardCandidateMoves,
    framesPerSecond: ((timestamps.length - 1) * 1_000) / elapsed,
    maxLongTaskMs: Math.max(0, ...longTasks),
    observedFrames: timestamps.length,
  };
}

function percentile(values: readonly number[], proportion: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)] ?? 0;
}

function runnerIdentity() {
  return {
    browser: navigator.userAgent,
    deviceMemory: "deviceMemory" in navigator ? navigator.deviceMemory : null,
    hardwareConcurrency: navigator.hardwareConcurrency,
    platform: navigator.platform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    visibilityState: document.visibilityState,
    webdriver: navigator.webdriver,
  };
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
