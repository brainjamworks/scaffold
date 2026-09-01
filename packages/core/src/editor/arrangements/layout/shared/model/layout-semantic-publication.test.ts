import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { builtInLayoutDefinitions } from "../../model/built-in-layout-definitions";

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
  it.each(["accordion", "paginated", "tabs"] as const)(
    "publishes direct %s Sections in order with exact Layout activation relationships",
    (variant) => {
      const ownerId = "layout000001" as EmbeddedNodeId;
      const firstId = "section00001" as EmbeddedNodeId;
      const secondId = "section00002" as EmbeddedNodeId;
      const owner = schema.node("layout", { id: ownerId }, [
        schema.node("section", { id: firstId }, [schema.node("paragraph")]),
        schema.node("section", { id: secondId }, [schema.node("paragraph")]),
      ]);

      const definition = builtInLayoutDefinitions.find(({ id }) => id === variant);
      if (!definition?.documentSemantics?.projectChildren) {
        throw new Error(`Missing ${variant} Layout semantic publication.`);
      }
      const children = definition.documentSemantics.projectChildren({
        definitionId: variant,
        helpers: {
          projectDirectOwnedMembers: () => [],
          projectStandardRichText: () => [],
          projectStructuralChildren: () => [],
        },
        owner,
        ownerId,
      });

      expect(children).toEqual([
        {
          relativePos: 0,
          presentation: {
            actionIds: ["reveal", "hide", "move", "emphasize"],
          },
          activation: [{ ownerId, childId: firstId, ownerKind: "layout" }],
        },
        {
          relativePos: owner.child(0).nodeSize,
          presentation: {
            actionIds: ["reveal", "hide", "move", "emphasize"],
          },
          activation: [{ ownerId, childId: secondId, ownerKind: "layout" }],
        },
      ]);
      expect(definition.documentSemantics.presentation?.actionIds).toEqual([
        "reveal",
        "hide",
        "move",
        "emphasize",
      ]);
      expect(Object.isFrozen(children)).toBe(true);
      expect(children.every(({ activation }) => activation?.length === 1)).toBe(true);
    },
  );
});
