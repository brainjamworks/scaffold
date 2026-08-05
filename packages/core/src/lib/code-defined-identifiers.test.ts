import { describe, expect, it } from "vite-plus/test";

import {
  isBlockNodeType,
  isExtensionPackName,
  isInsertActionId,
  isLayoutVariantId,
  isSurfaceVariantId,
} from "./code-defined-identifiers";

describe("code-defined identifier families", () => {
  it("recognises persisted Block node types as snake_case", () => {
    expect(isBlockNodeType("stat_highlight")).toBe(true);
    expect(isBlockNodeType("chart_block")).toBe(true);
    expect(isBlockNodeType("stat-highlight")).toBe(false);
    expect(isBlockNodeType("Stat_Highlight")).toBe(false);
    expect(isBlockNodeType(" stat_highlight ")).toBe(false);
  });

  it("recognises Layout and Surface variants as separate kebab-case families", () => {
    expect(isLayoutVariantId("process-flow")).toBe(true);
    expect(isSurfaceVariantId("slide-cover")).toBe(true);
    expect(isLayoutVariantId("process_flow")).toBe(false);
    expect(isSurfaceVariantId("slide_cover")).toBe(false);
  });

  it("recognises insertion actions independently from persisted node types", () => {
    expect(isInsertActionId("stat-highlight")).toBe(true);
    expect(isInsertActionId("stat_highlight")).toBe(false);
    expect(isBlockNodeType("stat_highlight")).toBe(true);
  });

  it("recognises stable extension pack names", () => {
    expect(isExtensionPackName("scaffold-plus")).toBe(true);
    expect(isExtensionPackName("scaffold_plus")).toBe(false);
  });
});
