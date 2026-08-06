import { describe, expect, it } from "vite-plus/test";

import { resolveImageHotspotClickChange } from "./assessment-interaction-runtime";

const first = { id: "one", hotspotId: "h1", x: 25, y: 25 };

describe("image-hotspot interaction state", () => {
  it("enforces locks, limits, coordinate bounds, and one selection per hotspot", () => {
    expect(
      resolveImageHotspotClickChange({
        clicks: [first],
        click: { ...first, id: "duplicate" },
        locked: false,
        maxClicks: 2,
      }),
    ).toEqual({ status: "duplicate", clicks: [first] });
    expect(
      resolveImageHotspotClickChange({
        clicks: [first],
        click: { id: "two", hotspotId: null, x: 5, y: 5 },
        locked: false,
        maxClicks: 1,
      }),
    ).toEqual({ status: "limit", clicks: [first] });
    expect(
      resolveImageHotspotClickChange({
        clicks: [],
        click: { id: "two", hotspotId: null, x: -1, y: 5 },
        locked: false,
        maxClicks: null,
      }),
    ).toEqual({ status: "invalid", clicks: [] });
    expect(
      resolveImageHotspotClickChange({
        clicks: [],
        click: { id: "two", hotspotId: null, x: 5, y: 5 },
        locked: true,
        maxClicks: null,
      }),
    ).toEqual({ status: "locked", clicks: [] });
    expect(
      resolveImageHotspotClickChange({
        clicks: [first],
        click: { id: "two", hotspotId: null, x: 5, y: 5 },
        locked: false,
        maxClicks: 2,
      }),
    ).toEqual({
      status: "added",
      clicks: [first, { id: "two", hotspotId: null, x: 5, y: 5 }],
    });
  });
});
