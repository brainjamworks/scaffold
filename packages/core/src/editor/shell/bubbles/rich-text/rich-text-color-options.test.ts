import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_TEXT_COLOR,
  HIGHLIGHT_OPTIONS,
  TEXT_COLOR_OPTIONS,
} from "./rich-text-color-options";

describe("rich text bubble color options", () => {
  it("keeps text color swatches with the color picker controls", () => {
    expect(DEFAULT_TEXT_COLOR).toBe("#18181b");
    expect(TEXT_COLOR_OPTIONS.map((option) => option.value)).toContain("#161D77");
  });

  it("keeps highlight swatches with the highlight popover controls", () => {
    // Anchored to Notion's reference palette (mid-saturation pastels)
    // so they don't ghost on white. Previous values (`#fff4cc` etc)
    // were too faded.
    expect(DEFAULT_HIGHLIGHT_COLOR).toBe("#FBF3DB");
    expect(HIGHLIGHT_OPTIONS.map((option) => option.value)).toContain("#FBF3DB");
  });
});
