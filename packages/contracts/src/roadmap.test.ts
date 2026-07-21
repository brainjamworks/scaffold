import { describe, expect, it } from "vite-plus/test";

import {
  RoadmapAttrsSchema,
  RoadmapDataSchema,
  RoadmapMilestoneStatusSchema,
  RoadmapOrientationSchema,
  type RoadmapAttrs,
  type RoadmapData,
} from "./index";

describe("roadmap content contract", () => {
  it("preserves enum order and the canonical serialized shape", () => {
    expect(RoadmapMilestoneStatusSchema.options).toEqual(["upcoming", "current", "done"]);
    expect(RoadmapOrientationSchema.options).toEqual(["vertical", "horizontal"]);

    const data: RoadmapData = {
      type: "roadmap",
      orientation: "horizontal",
      useIconMarkers: true,
      icon: { kind: "catalog", name: "map" },
    };
    const attrs: RoadmapAttrs = { data };

    expect(RoadmapDataSchema.parse(data)).toEqual(data);
    expect(RoadmapAttrsSchema.parse(attrs)).toEqual(attrs);
  });

  it("preserves data and attrs defaults", () => {
    const defaults = {
      type: "roadmap",
      orientation: "vertical",
      useIconMarkers: false,
      icon: null,
    };

    expect(RoadmapDataSchema.parse({})).toEqual(defaults);
    expect(RoadmapAttrsSchema.parse({})).toEqual({ data: defaults });
  });

  it("preserves unknown-key stripping", () => {
    expect(RoadmapDataSchema.parse({ activeMilestone: 1 })).not.toHaveProperty("activeMilestone");
  });

  it("rejects invalid milestone states", () => {
    expect(RoadmapMilestoneStatusSchema.safeParse("blocked").success).toBe(false);
  });

  it.each([{ type: "route_map" }, { orientation: "diagonal" }, { useIconMarkers: "yes" }])(
    "rejects invalid serialized values %#",
    (value) => {
      expect(RoadmapDataSchema.safeParse(value).success).toBe(false);
    },
  );
});
