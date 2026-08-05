import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import {
  ARTIFICIAL_MOVEMENT_BLOCK_COUNT,
  ARTIFICIAL_MOVEMENT_BLOCKS_PER_SLIDE,
  ARTIFICIAL_MOVEMENT_SLIDE_COUNT,
  artificialMovementBlockId,
  createArtificialLargeMovementFixture,
  type ArtificialLargeMovementFixture,
} from "../testing/artificial-large-movement-fixture";

const mounted: ArtificialLargeMovementFixture[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.dispose();
});

describe("movement target index artificial worst case", () => {
  it("keeps pointer and scroll queries free of traversal and layout reads", async () => {
    await page.viewport(1000, 720);
    const fixture = createArtificialLargeMovementFixture();
    mounted.push(fixture);

    expect(fixture.slideElements).toHaveLength(ARTIFICIAL_MOVEMENT_SLIDE_COUNT);
    expect(fixture.blockElements).toHaveLength(ARTIFICIAL_MOVEMENT_BLOCK_COUNT);

    fixture.startIndex();
    const snapshot = fixture.controller.getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.entries.length).toBeGreaterThanOrEqual(1_000);
    expect(fixture.controller.getCandidate()).not.toBeNull();

    const constructionCounts = operationCounts(fixture);
    for (let index = 1; index <= 200; index += 1) {
      fixture.controller.updatePoint(fixture.pointForBlock(index));
    }

    expect(fixture.counts.candidateQueries - constructionCounts.candidateQueries).toBe(200);
    expectNoDiscoveryOrLayoutReads(fixture, constructionCounts);

    const stationaryPoint = fixture.pointForBlock(1);
    fixture.controller.updatePoint(stationaryPoint);
    const beforeScrollKey = fixture.controller.getCandidate()?.key;
    expect(beforeScrollKey).toContain(artificialMovementBlockId(2));
    const sourceEntry = fixture.entryForBlock(1);
    const destinationGeometryIndex = ARTIFICIAL_MOVEMENT_BLOCKS_PER_SLIDE + 1;
    const destinationEntry = fixture.entryForBlock(destinationGeometryIndex);
    const scrollDistance =
      destinationEntry.rect.measuredRect.top - sourceEntry.rect.measuredRect.top;
    const beforeScrollCounts = operationCounts(fixture);
    fixture.scrollRoot.scrollTop = scrollDistance;
    fixture.scrollRoot.dispatchEvent(new Event("scroll"));
    await animationFrames(3);

    expect(fixture.scrollRoot.scrollTop).toBeGreaterThan(0);
    expect(fixture.controller.getCandidate()?.key).not.toBe(beforeScrollKey);
    expect(fixture.controller.getCandidate()?.key).toContain(
      artificialMovementBlockId(destinationGeometryIndex - 1),
    );
    expect(fixture.counts.candidateQueries).toBeGreaterThan(beforeScrollCounts.candidateQueries);
    expectNoDiscoveryOrLayoutReads(fixture, beforeScrollCounts);
  });
});

function operationCounts(fixture: ArtificialLargeMovementFixture) {
  return { ...fixture.counts };
}

function expectNoDiscoveryOrLayoutReads(
  fixture: ArtificialLargeMovementFixture,
  baseline: ReturnType<typeof operationCounts>,
): void {
  expect(fixture.counts.traversals).toBe(baseline.traversals);
  expect(fixture.counts.nodeDOM).toBe(baseline.nodeDOM);
  expect(fixture.counts.posAtCoords).toBe(baseline.posAtCoords);
  expect(fixture.counts.rectReads).toBe(baseline.rectReads);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
