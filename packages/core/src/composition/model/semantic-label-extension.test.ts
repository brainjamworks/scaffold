import { Node, getSchema } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { SemanticLabel } from "./semantic-label-extension";

const TestDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});

const TestParagraph = Node.create({
  name: "paragraph",
  group: "block",
});

const TestText = Node.create({
  name: "text",
  group: "inline",
});

const TestUnavailableBlock = Node.create({
  name: "unavailable_block",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      capabilityId: { default: null },
      original: { default: null },
    };
  },
});

describe("SemanticLabel", () => {
  it("leaves unavailable compatibility roots outside semantic-label ownership", () => {
    const schema = getSchema([
      TestDocument,
      TestParagraph,
      TestText,
      TestUnavailableBlock,
      SemanticLabel,
    ]);
    const original = {
      type: "plus_private_block",
      attrs: { id: "plusblock001", private: "preserve exactly" },
    };

    expect(schema.nodes["paragraph"]?.spec.attrs?.["semanticLabel"]?.default).toBeNull();
    expect(schema.nodes["unavailable_block"]?.spec.attrs?.["semanticLabel"]).toBeUndefined();
    expect(
      schema
        .nodeFromJSON({
          type: "doc",
          content: [
            {
              type: "unavailable_block",
              attrs: {
                id: "plusblock001",
                capabilityId: "plus_private_block",
                original,
              },
            },
          ],
        })
        .toJSON(),
    ).toEqual({
      type: "doc",
      attrs: { semanticLabel: null },
      content: [
        {
          type: "unavailable_block",
          attrs: {
            id: "plusblock001",
            capabilityId: "plus_private_block",
            original,
          },
        },
      ],
    });
  });
});
