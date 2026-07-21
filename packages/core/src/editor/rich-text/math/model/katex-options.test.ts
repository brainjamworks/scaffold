import { describe, expect, it } from "vite-plus/test";

import { KATEX_OPTIONS } from "./katex-options";

describe("KaTeX options ownership", () => {
  it("preserves the canonical rendered-math configuration", () => {
    expect(KATEX_OPTIONS).toEqual({
      throwOnError: false,
      strict: "ignore",
    });
  });
});
