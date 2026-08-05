import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  createClientDelta,
  createClientPoint,
  createCoordinateSpaceSnapshot,
  createLocalDelta,
  createLocalPoint,
  type ClientPoint,
  type LocalPoint,
} from "./coordinate-space";

describe("createCoordinateSpaceSnapshot", () => {
  it("converts points through the client-rect origin while deltas ignore it", () => {
    const snapshot = createCoordinateSpaceSnapshot({
      kind: "scaled-canvas",
      revision: 4,
      clientRect: { left: 120, top: 80, width: 512, height: 288 },
      localSize: { width: 1024, height: 576 },
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.clientPointToLocal(createClientPoint(376, 224)!)).toEqual({
      space: "local",
      x: 512,
      y: 288,
    });
    expect(snapshot?.clientDeltaToLocal(createClientDelta(64, -32)!)).toEqual({
      space: "local-delta",
      x: 128,
      y: -64,
    });
  });

  it("round trips identity and non-uniform scaled values", () => {
    const snapshots = [
      createCoordinateSpaceSnapshot({
        kind: "viewport",
        revision: 0,
        clientRect: { left: 14, top: 28, width: 640, height: 480 },
        localSize: { width: 640, height: 480 },
      }),
      createCoordinateSpaceSnapshot({
        kind: "scaled-canvas",
        revision: 1,
        clientRect: { left: 100, top: 50, width: 512, height: 432 },
        localSize: { width: 1024, height: 576 },
      }),
    ];

    for (const snapshot of snapshots) {
      expect(snapshot).not.toBeNull();
      const clientPoint = createClientPoint(220, 170)!;
      const clientDelta = createClientDelta(-30, 45)!;

      expect(snapshot?.localPointToClient(snapshot.clientPointToLocal(clientPoint))).toEqual(
        clientPoint,
      );
      expect(snapshot?.localDeltaToClient(snapshot.clientDeltaToLocal(clientDelta))).toEqual(
        clientDelta,
      );
    }
  });

  it("keeps point and delta spaces distinct in the type system", () => {
    expectTypeOf<ClientPoint>().not.toEqualTypeOf<LocalPoint>();
    expectTypeOf(createClientPoint).returns.toEqualTypeOf<ClientPoint | null>();
    expectTypeOf(createLocalPoint).returns.toEqualTypeOf<LocalPoint | null>();
    expectTypeOf(createLocalDelta).returns.toMatchTypeOf<{
      readonly space: "local-delta";
    } | null>();
  });

  it("rejects non-finite coordinates and invalid snapshot dimensions", () => {
    expect(createClientPoint(Number.NaN, 0)).toBeNull();
    expect(createLocalDelta(0, Number.POSITIVE_INFINITY)).toBeNull();

    for (const input of [
      {
        kind: "viewport" as const,
        revision: 0,
        clientRect: { left: 0, top: 0, width: 0, height: 100 },
        localSize: { width: 100, height: 100 },
      },
      {
        kind: "scaled-canvas" as const,
        revision: 0,
        clientRect: { left: 0, top: 0, width: 100, height: 100 },
        localSize: { width: -1, height: 100 },
      },
      {
        kind: "viewport" as const,
        revision: -1,
        clientRect: { left: 0, top: 0, width: 100, height: 100 },
        localSize: { width: 100, height: 100 },
      },
      {
        kind: "viewport" as const,
        revision: 0,
        clientRect: { left: Number.NaN, top: 0, width: 100, height: 100 },
        localSize: { width: 100, height: 100 },
      },
    ]) {
      expect(createCoordinateSpaceSnapshot(input)).toBeNull();
    }
  });

  it("returns deeply immutable value and snapshot shells", () => {
    const point = createLocalPoint(10, 20)!;
    const snapshot = createCoordinateSpaceSnapshot({
      kind: "viewport",
      revision: 0,
      clientRect: { left: 0, top: 0, width: 100, height: 80 },
      localSize: { width: 100, height: 80 },
    })!;

    expect(Object.isFrozen(point)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.clientRect)).toBe(true);
    expect(Object.isFrozen(snapshot.localSize)).toBe(true);
  });
});
