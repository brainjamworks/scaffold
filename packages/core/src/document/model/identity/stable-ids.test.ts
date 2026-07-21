import { describe, expect, it } from "vite-plus/test";

import { createStableId } from "./stable-ids";

const STABLE_ID_PATTERN = /^[0-9A-Z_a-z-]{12}$/;

describe("stable id utilities", () => {
  it("generates opaque non-empty ids through one import path", () => {
    expect(createStableId()).toMatch(STABLE_ID_PATTERN);
    expect(createStableId()).toMatch(STABLE_ID_PATTERN);
    expect(createStableId()).toMatch(STABLE_ID_PATTERN);
  });

  it("never embeds runtime artifact scope in authored block ids", () => {
    const id = createStableId();

    expect(id).not.toMatch(/^artifact:/);
    expect(id).not.toMatch(/^(block|component|grid|cell|layout|section)-/);
  });
});
