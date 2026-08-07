import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { projectCourseStructure } from "@/document/model/course-structure/course-structure-projection";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
  type SemanticSurfaceDefinition,
} from "@/document/model/semantic-document";

import { builtInSurfaceVariantRegistry } from "./built-in-surface-variant-definitions";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "surface+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    surface: {
      content: "block+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    slide_title: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    slide_cover_subtitle: {
      group: "block",
      content: "paragraph+",
      attrs: { id: { default: null } },
    },
  },
});

describe("built-in Surface document semantics", () => {
  it("publishes direct page prose and delegates Region prose to its structural owner", () => {
    const directParagraphId = id("directpara01");
    const regionId = id("region000001");
    const regionParagraphId = id("regionpara01");
    const surface = schema.node("surface", { id: id("surface00001"), variant: "page-default" }, [
      textblock("paragraph", directParagraphId, "Direct page prose"),
      schema.node("region", { id: regionId, role: "main" }, [
        textblock("paragraph", regionParagraphId, "Region prose"),
      ]),
    ]);

    const snapshot = project(documentNode("page", surface));

    expect(snapshot.itemById.get(directParagraphId)?.label).toBe("Direct page prose");
    expect(snapshot.parentById.get(directParagraphId)).toBe(surface.attrs["id"]);
    expect(snapshot.itemById.get(regionParagraphId)?.label).toBe("Region prose");
    expect(snapshot.parentById.get(regionParagraphId)).toBe(regionId);
  });

  it("publishes only approved slide title and subtitle content roots", () => {
    const titleId = id("slidetitle01");
    const subtitleWrapperId = id("subtitle0001");
    const subtitleId = id("subtitle0002");
    const privateRegionParagraphId = id("privatepara1");
    const surface = schema.node("surface", { id: id("surface00002"), variant: "slide-cover" }, [
      textblock("heading", titleId, "Authored title"),
      schema.node("slide_cover_subtitle", { id: subtitleWrapperId }, [
        textblock("paragraph", subtitleId, "Authored subtitle"),
      ]),
      schema.node("region", { id: id("region000002"), role: "private" }, [
        textblock("paragraph", privateRegionParagraphId, "Region-owned prose"),
      ]),
    ]);

    const snapshot = project(documentNode("slideshow", surface));

    expect(snapshot.itemById.get(titleId)?.label).toBe("Authored title");
    expect(snapshot.itemById.get(subtitleId)?.label).toBe("Authored subtitle");
    expect(snapshot.itemById.has(subtitleWrapperId)).toBe(false);
    expect(snapshot.parentById.get(privateRegionParagraphId)).toBe(id("region000002"));
  });
});

function project(doc: ProseMirrorNode) {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid Surface semantics fixture.");
  const definitions: SemanticDefinitionLookup = Object.freeze({
    blocks: Object.freeze({ get: () => undefined }),
    layouts: Object.freeze({ get: () => undefined }),
    surfaces: Object.freeze({
      get: (variant: string): SemanticSurfaceDefinition | undefined => {
        const definition = builtInSurfaceVariantRegistry.get(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentSemantics
                ? { documentSemantics: definition.documentSemantics }
                : {}),
            }
          : undefined;
      },
    }),
  });
  return projectSemanticDocument({ doc, courseStructure, definitions, revision: 1 });
}

function documentNode(mode: "page" | "slideshow", surface: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: id("course000001"), mode }, [surface]),
  ]);
}

function textblock(type: string, nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node(type, { id: nodeId }, [schema.text(text)]);
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
