import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { hiddenLayoutSectionDocumentSemantics } from "./layout-semantic-publication";

const schema = new Schema({
  nodes: {
    doc: { content: "layout" },
    text: { group: "inline" },
    paragraph: { content: "text*" },
    layout: { attrs: { id: { default: null } }, content: "section+" },
    section: { attrs: { id: { default: null } }, content: "paragraph+" },
  },
});

describe("hidden Layout Section semantic publication", () => {
  it("publishes only direct Sections with explicit Layout activation relationships", () => {
    const ownerId = "layout000001" as EmbeddedNodeId;
    const firstId = "section00001" as EmbeddedNodeId;
    const secondId = "section00002" as EmbeddedNodeId;
    const owner = schema.node("layout", { id: ownerId }, [
      schema.node("section", { id: firstId }, [schema.node("paragraph")]),
      schema.node("section", { id: secondId }, [schema.node("paragraph")]),
    ]);

    const children = hiddenLayoutSectionDocumentSemantics.projectChildren?.({
      definitionId: "hidden-layout",
      helpers: {
        projectStandardRichText: () => [],
        projectStructuralChildren: () => [],
      },
      owner,
      ownerId,
    });

    expect(children).toEqual([
      {
        relativePos: 0,
        activation: [{ ownerId, childId: firstId, ownerKind: "layout" }],
      },
      {
        relativePos: owner.child(0).nodeSize,
        activation: [{ ownerId, childId: secondId, ownerKind: "layout" }],
      },
    ]);
    expect(Object.isFrozen(children)).toBe(true);
  });
});
