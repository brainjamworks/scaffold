import { describe, expect, it } from "vite-plus/test";

import {
  MAX_SEMANTIC_LABEL_LENGTH,
  disambiguateSemanticLabels,
  normalizeAuthoredSemanticLabel,
  normalizeSemanticLabel,
  readAuthoredSemanticLabel,
} from "./semantic-labels";

describe("semantic labels", () => {
  it("normalizes whitespace and applies a safe type fallback to empty labels", () => {
    expect(normalizeSemanticLabel("  Welcome\n\tto   Scaffold  ", "Paragraph")).toBe(
      "Welcome to Scaffold",
    );
    expect(normalizeSemanticLabel(" \n\t ", "Paragraph")).toBe("Paragraph");
    expect(normalizeSemanticLabel(undefined, "Published child")).toBe("Published child");
  });

  it("bounds long display labels without retaining a full-content preview", () => {
    const label = normalizeSemanticLabel("A".repeat(200), "Heading");

    expect(label).toHaveLength(MAX_SEMANTIC_LABEL_LENGTH);
    expect(label).toBe(`${"A".repeat(MAX_SEMANTIC_LABEL_LENGTH - 1)}…`);
  });

  it("normalizes authored overrides while preserving blank as an explicit reset", () => {
    expect(normalizeAuthoredSemanticLabel("  Author\n  overview\t ")).toBe("Author overview");
    expect(normalizeAuthoredSemanticLabel(" \n\t ")).toBeNull();
  });

  it("reads only usable persisted authored overrides", () => {
    expect(readAuthoredSemanticLabel("  Author\n  overview\t ")).toBe("Author overview");
    expect(readAuthoredSemanticLabel(null)).toBeNull();
    expect(readAuthoredSemanticLabel({ label: "not a string" })).toBeNull();
    expect(readAuthoredSemanticLabel("A".repeat(MAX_SEMANTIC_LABEL_LENGTH + 1))).toBeNull();
  });

  it("adds ordinals only to normalized sibling collisions", () => {
    const labels = disambiguateSemanticLabels([
      " Repeat ",
      "Repeat",
      "Different",
      "repeat",
      "Another",
    ]);

    expect(labels).toEqual(["Repeat 1", "Repeat 2", "Different", "repeat 3", "Another"]);
    expect(Object.isFrozen(labels)).toBe(true);
  });

  it("reserves bounded label space for collision ordinals", () => {
    const longLabel = "A".repeat(MAX_SEMANTIC_LABEL_LENGTH);

    const labels = disambiguateSemanticLabels([longLabel, longLabel]);

    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[0]).toMatch(/… 1$/);
    expect(labels[1]).toMatch(/… 2$/);
    expect(labels.every((label) => label.length <= MAX_SEMANTIC_LABEL_LENGTH)).toBe(true);
  });
});
