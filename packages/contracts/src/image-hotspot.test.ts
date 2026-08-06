import { describe, expect, it } from "vite-plus/test";

import {
  HotspotItemSchema,
  ImageHotspotCanvasDataSchema,
  ImageHotspotPrivateAssessmentSchema,
  ImageHotspotSettingsSchema,
  type HotspotItem,
  type ImageHotspotCanvasData,
  type ImageHotspotPrivateAssessment,
  type ImageHotspotSettings,
} from "./image-hotspot";

function normalizedSettingsIssues(result: ReturnType<typeof ImageHotspotSettingsSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

function normalizedHotspotIssues(result: ReturnType<typeof HotspotItemSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

const richFeedback = {
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text: "Look farther east" }] }],
  },
};

describe("image-hotspot authored persisted contracts", () => {
  it("preserves exact settings, canvas, and private defaults", () => {
    const settings: ImageHotspotSettings = ImageHotspotSettingsSchema.parse({});
    const canvas: ImageHotspotCanvasData = ImageHotspotCanvasDataSchema.parse({});
    const assessment: ImageHotspotPrivateAssessment = ImageHotspotPrivateAssessmentSchema.parse({});

    expect(settings).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    expect(canvas).toEqual({ image: null, hotspots: [], maxClicks: null });
    expect(assessment).toEqual({
      gradingMode: "partial-credit",
      correctHotspotIds: [],
      feedbackByHotspotId: {},
      missFeedback: null,
      summaryFeedback: null,
    });
  });

  it("preserves canonical finite geometry and meaningful public identity", () => {
    const hotspot: HotspotItem = HotspotItemSchema.parse({
      id: "hotspot-1",
      centerX: 20,
      centerY: 80,
      radius: 2,
      label: "  Target  ",
      editorSelection: true,
    });

    expect(hotspot).toEqual({
      id: "hotspot-1",
      centerX: 20,
      centerY: 80,
      radius: 2,
      label: "Target",
    });
    expect(
      HotspotItemSchema.parse({
        id: "hotspot-2",
        centerX: 90,
        centerY: 10,
        radius: 10,
        label: "  Target  ",
      }),
    ).toEqual({
      id: "hotspot-2",
      centerX: 90,
      centerY: 10,
      radius: 10,
      label: "Target",
    });
  });

  it("preserves canonical image parsing and authored private feedback", () => {
    expect(
      ImageHotspotCanvasDataSchema.parse({
        image: {
          mode: "external",
          src: "  https://example.com/map.png  ",
          alt: "  Map  ",
          ignored: true,
        },
        hotspots: [{ id: "h1", centerX: 20, centerY: 30, radius: 8, label: "Capital" }],
        maxClicks: 2,
        editorOnly: true,
      }),
    ).toEqual({
      image: { mode: "external", src: "https://example.com/map.png", alt: "  Map  " },
      hotspots: [{ id: "h1", centerX: 20, centerY: 30, radius: 8, label: "Capital" }],
      maxClicks: 2,
    });
    expect(
      ImageHotspotPrivateAssessmentSchema.parse({
        gradingMode: "all-or-nothing",
        correctHotspotIds: ["h1"],
        feedbackByHotspotId: { h1: richFeedback },
        missFeedback: richFeedback,
        summaryFeedback: richFeedback,
        editorOnly: true,
      }),
    ).toEqual({
      gradingMode: "all-or-nothing",
      correctHotspotIds: ["h1"],
      feedbackByHotspotId: { h1: richFeedback },
      missFeedback: richFeedback,
      summaryFeedback: richFeedback,
    });
  });

  it("preserves strict settings and normalized geometry issues", () => {
    expect(
      normalizedSettingsIssues(ImageHotspotSettingsSchema.safeParse({ editorOnly: true })),
    ).toEqual([
      {
        code: "unrecognized_keys",
        path: [],
        message: "Unrecognized key(s) in object: 'editorOnly'",
      },
    ]);
    expect(
      normalizedHotspotIssues(
        HotspotItemSchema.safeParse({
          id: "h1",
          centerX: -1,
          centerY: 101,
          radius: 101,
          label: "Region",
        }),
      ),
    ).toEqual([
      {
        code: "too_small",
        path: ["centerX"],
        message: "Number must be greater than or equal to 0",
      },
      {
        code: "too_big",
        path: ["centerY"],
        message: "Number must be less than or equal to 100",
      },
      {
        code: "too_big",
        path: ["radius"],
        message: "Number must be less than or equal to 100",
      },
    ]);
    expect(ImageHotspotCanvasDataSchema.safeParse({ maxClicks: 0 }).success).toBe(false);
    for (const hotspot of [
      { id: "", centerX: 50, centerY: 50, radius: 8, label: "Region" },
      { id: "h1", centerX: Number.NaN, centerY: 50, radius: 8, label: "Region" },
      { id: "h1", centerX: 50, centerY: Number.POSITIVE_INFINITY, radius: 8, label: "Region" },
      { id: "h1", centerX: 50, centerY: 50, radius: 1.99, label: "Region" },
      { id: "h1", centerX: 50, centerY: 50, radius: 8, label: "   " },
    ]) {
      expect(HotspotItemSchema.safeParse(hotspot).success).toBe(false);
    }
    expect(ImageHotspotCanvasDataSchema.parse({ editorOnly: true })).toEqual({
      image: null,
      hotspots: [],
      maxClicks: null,
    });
    expect(
      ImageHotspotCanvasDataSchema.safeParse({
        image: { mode: "external", src: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(ImageHotspotPrivateAssessmentSchema.safeParse({ gradingMode: "weighted" }).success).toBe(
      false,
    );
  });
});
