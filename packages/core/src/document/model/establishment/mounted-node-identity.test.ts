import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import {
  assertMountedNodeIdentitySchema,
  assertParsedMountedNodeIdentity,
} from "./mounted-node-identity";

describe("assertMountedNodeIdentitySchema", () => {
  it("accepts only schemas whose mounted nodes expose attrs.id", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "owner" },
        owner: { attrs: { id: { default: null } } },
        text: {},
      },
    });

    expect(() => assertMountedNodeIdentitySchema(schema)).not.toThrow();
  });

  it("reports missing global id ownership as a configuration fault", () => {
    const schema = new Schema({ nodes: { doc: { content: "owner" }, owner: {}, text: {} } });

    expect(() => assertMountedNodeIdentitySchema(schema)).toThrow(
      'Mounted authoring node "owner" must expose attrs.id.',
    );
  });

  it.each([
    [null, "missing_embedded_node_id"],
    ["short", "invalid_embedded_node_id"],
  ] as const)("reports a path-aware %s identity failure", (id, code) => {
    const schema = identitySchema();
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "owner", attrs: { id } }],
    });

    expect(assertParsedMountedNodeIdentity(document)).toEqual([
      expect.objectContaining({ code, path: ["content", 0, "attrs", "id"] }),
    ]);
  });

  it("reports duplicate understood identities", () => {
    const schema = identitySchema();
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "owner", attrs: { id: "owner0000001" } },
        { type: "owner", attrs: { id: "owner0000001" } },
      ],
    });

    expect(assertParsedMountedNodeIdentity(document)).toEqual([
      expect.objectContaining({
        code: "duplicate_embedded_node_id",
        path: ["content", 1, "attrs", "id"],
      }),
    ]);
  });
});

function identitySchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: "owner+" },
      owner: { attrs: { id: { default: null } } },
      text: {},
    },
  });
}
