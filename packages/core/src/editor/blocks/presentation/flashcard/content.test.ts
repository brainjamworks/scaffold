import { describe, expect, it } from "vite-plus/test";

import { emptyFlashcardData } from "./content";

describe("Flashcard content", () => {
  it("constructs serialized defaults in the Flashcard feature", () => {
    expect(emptyFlashcardData()).toEqual({
      type: "flashcard",
      shuffle: false,
    });
    expect(emptyFlashcardData({ shuffle: true })).toEqual({
      type: "flashcard",
      shuffle: true,
    });
  });
});
