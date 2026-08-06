import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { validateEmbeddedNodeIdentities } from "../index";

describe("validateEmbeddedNodeIdentities", () => {
  it("reports a missing identity at the eligible node attrs.id path", () => {
    const schema = createSchema();

    const result = validateEmbeddedNodeIdentities(
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
      },
      schema,
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "missing_embedded_node_id",
          message: 'node "paragraph" must have attrs.id',
          path: ["content", 0, "attrs", "id"],
        },
      ],
    });
  });

  it("reports a malformed identity at the eligible node attrs.id path", () => {
    const schema = createSchema();

    const result = validateEmbeddedNodeIdentities(
      {
        type: "doc",
        content: [{ type: "paragraph", attrs: { id: "not-valid" } }],
      },
      schema,
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "invalid_embedded_node_id",
          message: 'node "paragraph" attrs.id must be a valid embedded ID',
          path: ["content", 0, "attrs", "id"],
        },
      ],
    });
  });

  it("reports the second use of an identity across known Core and contributed nodes", () => {
    const schema = createSchema();

    const result = validateEmbeddedNodeIdentities(
      {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { id: "SharedId0001" } },
          { type: "contributed_block", attrs: { id: "SharedId0001" } },
        ],
      },
      schema,
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "duplicate_embedded_node_id",
          message: 'node "contributed_block" attrs.id must be unique within the document',
          path: ["content", 1, "attrs", "id"],
        },
      ],
    });
  });

  it("excludes doc and text nodes from the identity namespace", () => {
    const schema = createSchema();

    const result = validateEmbeddedNodeIdentities(
      {
        type: "doc",
        attrs: { id: "not-valid" },
        content: [
          {
            type: "paragraph",
            attrs: { id: "ParaNode0001" },
            content: [{ type: "text", attrs: { id: "ParaNode0001" }, text: "Hello" }],
          },
        ],
      },
      schema,
    );

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("keeps unknown node roots and their content subtrees opaque", () => {
    const schema = createSchema();

    const result = validateEmbeddedNodeIdentities(
      {
        type: "doc",
        content: [
          {
            type: "unavailable_private_block",
            attrs: { id: "not-valid" },
            content: [{ type: "paragraph" }],
          },
          { type: "paragraph", attrs: { id: "ParaNode0001" } },
        ],
      },
      schema,
    );

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("does not traverse attrs payloads or include owner-local data IDs", () => {
    const schema = createSchema();

    const result = validateEmbeddedNodeIdentities(
      {
        type: "doc",
        content: [
          {
            type: "chart",
            attrs: {
              id: "ChartNode001",
              data: {
                columns: [{ id: "LocalData001" }, { id: "LocalData001" }],
                nestedNodeLikeRecord: {
                  type: "paragraph",
                  attrs: { id: "ChartNode001" },
                },
              },
            },
          },
          {
            type: "image_hotspot",
            attrs: {
              id: "HotspotNode1",
              assessment: {
                hotspots: [{ id: "LocalData001" }],
                feedbackByHotspotId: { LocalData001: "Owner-local" },
              },
            },
          },
        ],
      },
      schema,
    );

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("returns immutable issues and does not mutate the raw document JSON", () => {
    const schema = createSchema();
    const content = {
      type: "doc",
      content: [{ type: "paragraph" }, { type: "contributed_block", attrs: { id: "not-valid" } }],
    };
    const before = structuredClone(content);

    const result = validateEmbeddedNodeIdentities(content, schema);

    expect(content).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(Object.isFrozen(issue)).toBe(true);
      expect(Object.isFrozen(issue.path)).toBe(true);
    }
  });
});

function createSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: "block*" },
      paragraph: {
        attrs: { id: { default: null } },
        content: "inline*",
        group: "block",
      },
      contributed_block: {
        attrs: { id: { default: null } },
        group: "block",
      },
      chart: {
        attrs: { data: { default: null }, id: { default: null } },
        group: "block",
      },
      image_hotspot: {
        attrs: { assessment: { default: null }, id: { default: null } },
        group: "block",
      },
      text: { group: "inline" },
    },
  });
}
