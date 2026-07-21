import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";
import {
  SlideImageCoverSurfaceSettingsSchema,
  writeSlideImageCoverImageSettings,
} from "./slide-image-cover";

describe("slide image cover settings", () => {
  it("accepts only shared image-position presets", () => {
    expect(
      SlideImageCoverSurfaceSettingsSchema.safeParse({
        image: { imageUrl: "https://example.test/cover.png", imagePosition: "top-left" },
      }).success,
    ).toBe(true);
    expect(
      SlideImageCoverSurfaceSettingsSchema.safeParse({
        image: { imageUrl: "https://example.test/cover.png", imagePosition: "middle" },
      }).success,
    ).toBe(false);
  });

  it("normalises an explicitly supplied image position", () => {
    const settings = writeSlideImageCoverImageSettings(DEFAULT_SURFACE_SETTINGS, {
      imageUrl: "https://example.test/cover.png",
      imageAlt: "Cover image",
      imagePosition: "top-left",
    });

    expect(settings.image).toEqual({
      imageUrl: "https://example.test/cover.png",
      imageAlt: "Cover image",
      imagePosition: "top-left",
    });
  });

  it("resets position on asset-only replacement without losing parent settings", () => {
    const positionedSettings = SlideImageCoverSurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      verticalPosition: "bottom",
      background: {
        color: "#161D77",
        imageUrl: "https://example.test/background.png",
        imagePosition: "bottom-right",
      },
      image: {
        imageUrl: "https://example.test/old-cover.png",
        imageAlt: "Old cover",
        imagePosition: "top-left",
      },
      imageSide: "left",
    });

    expect(
      writeSlideImageCoverImageSettings(positionedSettings, {
        imageUrl: "https://example.test/new-cover.png",
        imageAlt: "New cover",
      }),
    ).toEqual({
      ...positionedSettings,
      image: {
        imageUrl: "https://example.test/new-cover.png",
        imageAlt: "New cover",
      },
    });
  });
});
