import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  EmbeddedDataIdSchema,
  EmbeddedIdSchema,
  EmbeddedNodeIdSchema,
  type EmbeddedDataId,
  type EmbeddedId,
  type EmbeddedNodeId,
  isEmbeddedId,
} from "./index";

describe("embedded id contracts", () => {
  it("accepts the exact persisted 12-character token", () => {
    expect(EmbeddedIdSchema.parse("Abc_123-xYz9")).toBe("Abc_123-xYz9");
  });

  it.each(["", "short", "Abc_123-xYz90", "Abc.123/xYz9", null, 123])(
    "rejects a non-token value: %j",
    (value) => {
      expect(EmbeddedIdSchema.safeParse(value).success).toBe(false);
    },
  );

  it("exposes semantic node and data views over the same wire token", () => {
    expect(EmbeddedNodeIdSchema.parse("node_1234567")).toBe("node_1234567");
    expect(EmbeddedDataIdSchema.parse("data_1234567")).toBe("data_1234567");
  });

  it("keeps semantic node and data identity types distinct", () => {
    expectTypeOf<EmbeddedNodeId>().toMatchTypeOf<EmbeddedId>();
    expectTypeOf<EmbeddedDataId>().toMatchTypeOf<EmbeddedId>();
    expectTypeOf<EmbeddedNodeId>().not.toMatchTypeOf<EmbeddedDataId>();
    expectTypeOf<EmbeddedDataId>().not.toMatchTypeOf<EmbeddedNodeId>();
  });

  it("recognises only exact embedded tokens", () => {
    expect(isEmbeddedId("Abc_123-xYz9")).toBe(true);
    expect(isEmbeddedId(" surface-1 ")).toBe(false);
    expect(isEmbeddedId({ id: "Abc_123-xYz9" })).toBe(false);
  });
});
