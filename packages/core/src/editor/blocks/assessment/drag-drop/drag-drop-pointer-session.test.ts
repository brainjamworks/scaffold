import { describe, expect, it, vi } from "vite-plus/test";

import { resolveDragDropPointerPlacement } from "@/editor/assessment/drag-drop/drag-drop-pointer-session";

describe("resolveDragDropPointerPlacement", () => {
  it("commits the sole point returned by a ready spatial image surface", () => {
    const pointFromClient = vi.fn(() => ({ x: 100, y: 0 }));

    expect(
      resolveDragDropPointerPlacement({
        clientPoint: { x: 610, y: 205 },
        locked: false,
        markerId: "marker000001" as never,
        surface: { status: "ready", pointFromClient },
      }),
    ).toEqual({
      status: "commit",
      markerId: "marker000001",
      point: { x: 100, y: 0 },
    });
    expect(pointFromClient).toHaveBeenCalledOnce();
    expect(pointFromClient).toHaveBeenCalledWith({ x: 610, y: 205 });
  });

  it.each([
    {
      name: "an outside release",
      input: {
        clientPoint: { x: -1, y: 40 },
        locked: false,
        surface: {
          status: "ready" as const,
          pointFromClient: (): { x: number; y: number } | null => null,
        },
      },
      reason: "outside-image",
    },
    {
      name: "an unavailable image",
      input: {
        clientPoint: { x: 40, y: 40 },
        locked: false,
        surface: {
          status: "unavailable" as const,
          pointFromClient: (): { x: number; y: number } | null => null,
        },
      },
      reason: "surface-unavailable",
    },
    {
      name: "an attempt locked during the gesture",
      input: {
        clientPoint: { x: 40, y: 40 },
        locked: true,
        surface: { status: "ready" as const, pointFromClient: () => ({ x: 20, y: 20 }) },
      },
      reason: "attempt-locked",
    },
  ])("cancels $name without manufacturing a point", ({ input, reason }) => {
    expect(
      resolveDragDropPointerPlacement({ markerId: "marker000001" as never, ...input }),
    ).toEqual({ status: "cancelled", markerId: "marker000001", reason });
  });

  it("keeps an unavailable surface conversion-free", () => {
    const pointFromClient = vi.fn(() => ({ x: 50, y: 50 }));

    resolveDragDropPointerPlacement({
      clientPoint: { x: 50, y: 50 },
      locked: false,
      markerId: "marker000001" as never,
      surface: { status: "loading", pointFromClient },
    });

    expect(pointFromClient).not.toHaveBeenCalled();
  });
});
