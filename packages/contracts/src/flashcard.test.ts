import { describe, expect, it } from "vite-plus/test";

import { FlashcardDataSchema, type FlashcardData } from "./index";

describe("flashcard content contract", () => {
  it("preserves the canonical serialized Flashcard data shape", () => {
    const data: FlashcardData = {
      type: "flashcard",
      shuffle: true,
    };

    expect(FlashcardDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the existing serialized defaults", () => {
    expect(FlashcardDataSchema.parse({})).toEqual({
      type: "flashcard",
      shuffle: false,
    });
  });

  it("preserves the existing object strictness", () => {
    expect(
      FlashcardDataSchema.parse({
        type: "flashcard",
        shuffle: true,
        learnerProgress: { currentCard: 2 },
      }),
    ).toEqual({
      type: "flashcard",
      shuffle: true,
    });

    expect(FlashcardDataSchema.safeParse({ type: "deck", shuffle: true }).success).toBe(false);
    expect(FlashcardDataSchema.safeParse({ type: "flashcard", shuffle: "yes" }).success).toBe(
      false,
    );
  });
});
