import { describe, expect, it } from "vite-plus/test";

import { EmbeddedDataIdSchema, EmbeddedIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createEmbeddedDataId, createEmbeddedNodeId, createStableId } from "./stable-ids";

describe("stable id utilities", () => {
  it("generates semantic node ids through the contextual API", () => {
    const first = createEmbeddedNodeId();
    const second = createEmbeddedNodeId();

    expect(EmbeddedIdSchema.parse(first)).toBe(first);
    expect(EmbeddedNodeIdSchema.parse(first)).toBe(first);
    expect(EmbeddedNodeIdSchema.parse(second)).toBe(second);
  });

  it("generates capability-local data ids through the contextual API", () => {
    const first = createEmbeddedDataId();
    const second = createEmbeddedDataId();

    expect(EmbeddedIdSchema.parse(first)).toBe(first);
    expect(EmbeddedDataIdSchema.parse(first)).toBe(first);
    expect(EmbeddedDataIdSchema.parse(second)).toBe(second);
  });

  it("keeps the deprecated migration alias wire-compatible", () => {
    const id = createStableId();

    expect(EmbeddedIdSchema.parse(id)).toBe(id);
  });

  it("never embeds runtime artifact scope in embedded ids", () => {
    const id = createEmbeddedNodeId();

    expect(id).not.toMatch(/^artifact:/);
    expect(id).not.toMatch(/^(block|component|grid|cell|layout|section)-/);
  });
});
