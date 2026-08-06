import { describe, expect, it } from "vite-plus/test";

import {
  HotspotItemSchema,
  ImageHotspotCanvasDataSchema,
  ImageHotspotPayloadSchema,
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
  it("requires Data-family identities for hotspot owners and private references", () => {
    const hotspot = HotspotItemSchema.safeParse({
      id: "h1",
      centerX: 20,
      centerY: 30,
      radius: 8,
      label: "Region",
    });
    const assessment = ImageHotspotPrivateAssessmentSchema.safeParse({
      correctHotspotIds: ["h1"],
      feedbackByHotspotId: { h1: richFeedback },
    });

    expect(hotspot.success).toBe(false);
    expect(assessment.success).toBe(false);
    if (hotspot.success || assessment.success) {
      throw new Error("Expected invalid image-hotspot Data identities");
    }
    expect(hotspot.error.issues.map((issue) => issue.path)).toContainEqual(["id"]);
    expect(assessment.error.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["correctHotspotIds", 0],
        ["feedbackByHotspotId", "h1"],
      ]),
    );
  });

  it("reports duplicate hotspot owners and correct references at safe paths", () => {
    const canvas = ImageHotspotCanvasDataSchema.safeParse({
      hotspots: [
        { id: "hotsp_000001", centerX: 20, centerY: 30, radius: 8, label: "Region 1" },
        { id: "hotsp_000001", centerX: 70, centerY: 60, radius: 8, label: "Region 2" },
      ],
    });
    const assessment = ImageHotspotPrivateAssessmentSchema.safeParse({
      correctHotspotIds: ["hotsp_000001", "hotsp_000001"],
    });

    expect(canvas.success).toBe(false);
    expect(assessment.success).toBe(false);
    if (canvas.success || assessment.success) {
      throw new Error("Expected duplicate image-hotspot identities");
    }
    expect(canvas.error.issues.map(({ message, path }) => ({ message, path }))).toEqual([
      {
        message: 'duplicate image-hotspot id "hotsp_000001"',
        path: ["hotspots", 1, "id"],
      },
    ]);
    expect(assessment.error.issues.map(({ message, path }) => ({ message, path }))).toEqual([
      {
        message: 'duplicate correct hotspot id "hotsp_000001"',
        path: ["correctHotspotIds", 1],
      },
    ]);
  });

  it("reports dangling private references against the complete owner payload", () => {
    const result = ImageHotspotPayloadSchema.safeParse({
      canvas: {
        hotspots: [
          { id: "hotsp_000001", centerX: 20, centerY: 30, radius: 8, label: "Region" },
        ],
      },
      assessment: {
        correctHotspotIds: ["hotsp_000002"],
        feedbackByHotspotId: { hotsp_000003: richFeedback },
      },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected dangling image-hotspot references");
    expect(result.error.issues.map(({ message, path }) => ({ message, path }))).toEqual([
      {
        message: 'correct hotspot id references missing hotspot "hotsp_000002"',
        path: ["assessment", "correctHotspotIds", 0],
      },
      {
        message: 'feedback key references missing hotspot "hotsp_000003"',
        path: ["assessment", "feedbackByHotspotId", "hotsp_000003"],
      },
    ]);
  });

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

  it("preserves geometry boundaries, defaults, and unknown-key stripping", () => {
    const hotspot: HotspotItem = HotspotItemSchema.parse({
      id: "hotsp_000001",
      centerX: 0,
      centerY: 100,
      radius: 2,
      label: "  Target  ",
      editorSelection: true,
    });

    expect(hotspot).toEqual({
      id: "hotsp_000001",
      centerX: 0,
      centerY: 100,
      radius: 2,
      label: "Target",
    });
    expect(
      HotspotItemSchema.parse({
        id: "hotsp_000002",
        centerX: 100,
        centerY: 0,
        radius: 100,
        label: "  Target  ",
      }),
    ).toEqual({
      id: "hotsp_000002",
      centerX: 100,
      centerY: 0,
      radius: 100,
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
        hotspots: [
          { id: "hotsp_000001", centerX: 20, centerY: 30, radius: 8, label: "Capital" },
        ],
        maxClicks: 2,
        editorOnly: true,
      }),
    ).toEqual({
      image: { mode: "external", src: "https://example.com/map.png", alt: "  Map  " },
      hotspots: [
        { id: "hotsp_000001", centerX: 20, centerY: 30, radius: 8, label: "Capital" },
      ],
      maxClicks: 2,
    });
    expect(
      ImageHotspotPrivateAssessmentSchema.parse({
        gradingMode: "all-or-nothing",
        correctHotspotIds: ["hotsp_000001"],
        feedbackByHotspotId: { hotsp_000001: richFeedback },
        missFeedback: richFeedback,
        summaryFeedback: richFeedback,
        editorOnly: true,
      }),
    ).toEqual({
      gradingMode: "all-or-nothing",
      correctHotspotIds: ["hotsp_000001"],
      feedbackByHotspotId: { hotsp_000001: richFeedback },
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
          id: "hotsp_000001",
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
      { id: "hotsp_000001", centerX: Number.NaN, centerY: 50, radius: 8, label: "Region" },
      {
        id: "hotsp_000001",
        centerX: 50,
        centerY: Number.POSITIVE_INFINITY,
        radius: 8,
        label: "Region",
      },
      { id: "hotsp_000001", centerX: 50, centerY: 50, radius: 1.99, label: "Region" },
      { id: "hotsp_000001", centerX: 50, centerY: 50, radius: 8, label: "   " },
    ]) {
      expect(HotspotItemSchema.safeParse(hotspot).success).toBe(false);
    }
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
