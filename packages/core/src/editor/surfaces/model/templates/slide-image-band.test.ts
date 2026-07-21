import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";
import {
  SlideImageBandSurfaceSettingsSchema,
  writeSlideImageBandImageSettings,
} from "./slide-image-band";

describe("slide image band settings", () => {
  it("accepts only shared image-position presets", () => {
    expect(
      SlideImageBandSurfaceSettingsSchema.safeParse({
        image: { imageUrl: "https://example.test/band.png", imagePosition: "bottom-center" },
      }).success,
    ).toBe(true);
    expect(
      SlideImageBandSurfaceSettingsSchema.safeParse({
        image: { imageUrl: "https://example.test/band.png", imagePosition: "middle" },
      }).success,
    ).toBe(false);
  });

  it("normalises an explicitly supplied image position", () => {
    const settings = writeSlideImageBandImageSettings(DEFAULT_SURFACE_SETTINGS, {
      imageUrl: "https://example.test/band.png",
      imageAlt: "Band image",
      imagePosition: "bottom-center",
    });

    expect(settings.image).toEqual({
      imageUrl: "https://example.test/band.png",
      imageAlt: "Band image",
      imagePosition: "bottom-center",
    });
  });

  it("resets position on asset-only replacement without losing parent settings", () => {
    const positionedSettings = SlideImageBandSurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      verticalPosition: "top",
      background: {
        color: "#161D77",
        imageUrl: "https://example.test/background.png",
        imagePosition: "bottom-right",
      },
      image: {
        imageUrl: "https://example.test/old-band.png",
        imageAlt: "Old band",
        imagePosition: "top-left",
      },
    });

    expect(
      writeSlideImageBandImageSettings(positionedSettings, {
        imageUrl: "https://example.test/new-band.png",
        imageAlt: "New band",
      }),
    ).toEqual({
      ...positionedSettings,
      image: {
        imageUrl: "https://example.test/new-band.png",
        imageAlt: "New band",
      },
    });
  });
});
