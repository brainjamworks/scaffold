import { describe, expect, it } from "vite-plus/test";

import {
  TimelineAlignmentSchema,
  TimelineDataSchema,
  TimelinePresentationSchema,
  type TimelineData,
} from "./index";

describe("timeline content contract", () => {
  it("preserves enum order and the canonical serialized data shape", () => {
    expect(TimelineAlignmentSchema.options).toEqual(["alternate", "left", "right"]);
    expect(TimelinePresentationSchema.options).toEqual(["vertical", "carousel"]);

    const data: TimelineData = {
      type: "timeline",
      showAxis: false,
      alignment: "right",
      presentation: "carousel",
    };

    expect(TimelineDataSchema.parse(data)).toEqual(data);
  });

  it("preserves serialized defaults", () => {
    expect(TimelineDataSchema.parse({})).toEqual({
      type: "timeline",
      showAxis: true,
      alignment: "alternate",
      presentation: "vertical",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      TimelineDataSchema.parse({
        type: "timeline",
        showAxis: false,
        alignment: "left",
        presentation: "carousel",
        editorSelection: true,
      }),
    ).toEqual({
      type: "timeline",
      showAxis: false,
      alignment: "left",
      presentation: "carousel",
    });
  });

  it.each([
    { type: "chronology" },
    { alignment: "center" },
    { presentation: "slides" },
    { showAxis: "yes" },
  ])("rejects invalid serialized values %#", (value) => {
    expect(TimelineDataSchema.safeParse(value).success).toBe(false);
  });
});
