import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { getSchema, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

import { builtInSurfaceVariantDefinitions } from "../built-in-surface-variant-definitions";

const EXPECTED_REGION_ROLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "slide-content": ["main"],
  "slide-two-columns": ["primary", "secondary"],
  "slide-two-stacked": ["primary", "secondary"],
  "slide-side-title": ["main"],
  "slide-three-columns": ["primary", "secondary", "tertiary"],
  "slide-centred-stage": ["main"],
  "slide-editorial": ["primary", "secondary", "tertiary"],
  "slide-image-content-split": ["main"],
  "slide-image-content-stacked": ["main"],
  "slide-image-backdrop-panel": ["main"],
});

const composition = createCoreScaffoldAuthoringComposition();
const schema = getSchema(createCourseDocumentAuthoringExtensions({ editable: true, composition }));

describe("built-in Surface default Layer construction", () => {
  it("creates one fresh blank Layer in every Region and remains production-schema compatible", () => {
    const generatedIds: string[] = [];

    for (const definition of builtInSurfaceVariantDefinitions) {
      const firstSurfaceId = createEmbeddedNodeId();
      const secondSurfaceId = createEmbeddedNodeId();
      const first = definition.createSurface({ surfaceId: firstSurfaceId });
      const second = definition.createSurface({ surfaceId: secondSurfaceId });
      const label = definition.id;

      expect(first.attrs?.["id"], label).toBe(firstSurfaceId);
      expect(second.attrs, label).toEqual({ ...first.attrs, id: secondSurfaceId });
      expect(() => candidateDocument(first).check(), label).not.toThrow();

      const expectedRoles = EXPECTED_REGION_ROLES[label] ?? [];
      const firstRegions = findNodes(first, "region");
      const secondRegions = findNodes(second, "region");
      expect(
        firstRegions.map((region) => region.attrs?.["role"]),
        label,
      ).toEqual(expectedRoles);
      expect(
        secondRegions.map((region) => region.attrs?.["role"]),
        label,
      ).toEqual(expectedRoles);

      for (const region of [...firstRegions, ...secondRegions]) {
        expect(region.content, label).toHaveLength(1);
        const layer = region.content?.[0];
        const paragraph = layer?.content?.[0];

        expect(layer?.type, label).toBe(LAYER_NODE_TYPE);
        expect(layer?.content, label).toHaveLength(1);
        expect(paragraph, label).toMatchObject({ type: "paragraph" });
        expect(paragraph?.content, label).toBeUndefined();

        const layerId = EmbeddedNodeIdSchema.parse(layer?.attrs?.["id"]);
        const paragraphId = EmbeddedNodeIdSchema.parse(paragraph?.attrs?.["id"]);
        expect(layerId, label).not.toBe(paragraphId);
        generatedIds.push(layerId, paragraphId);
      }

      for (const { node, parent } of walk(first)) {
        if (node.type === LAYER_NODE_TYPE) {
          expect(parent?.type, label).toBe("region");
        }
      }
    }

    expect(new Set(generatedIds).size).toBe(generatedIds.length);
  });
});

function candidateDocument(surface: JSONContent) {
  return schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "courseDocument", content: [surface] }],
  });
}

function findNodes(root: JSONContent, type: string): JSONContent[] {
  return walk(root)
    .map(({ node }) => node)
    .filter((node) => node.type === type);
}

function walk(
  root: JSONContent,
  parent?: JSONContent,
): Array<{ readonly node: JSONContent; readonly parent?: JSONContent }> {
  return [
    { node: root, ...(parent ? { parent } : {}) },
    ...(root.content?.flatMap((child) => walk(child, root)) ?? []),
  ];
}
