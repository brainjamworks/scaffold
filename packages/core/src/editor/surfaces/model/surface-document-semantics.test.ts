import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  PresentationContentLayoutSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { projectCourseStructure } from "@/document/model/course-structure/course-structure-projection";
import {
  projectSemanticDocument,
  type PublishedSemanticChild,
  type SemanticDefinitionLookup,
  type SemanticSurfaceDefinition,
} from "@/document/model/semantic-document";

import { builtInSurfaceVariantRegistry } from "./built-in-surface-variant-definitions";
import { createSurfaceDocumentSemantics } from "./surface-document-semantics";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "(courseSection | surface)+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    courseSection: {
      atom: true,
      attrs: { id: { default: null }, title: { default: null } },
    },
    surface: {
      content: "block+",
      attrs: { id: { default: null }, variant: { default: null }, settings: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      attrs: {
        id: { default: null },
        role: { default: "main" },
        contentLayout: {
          default: PresentationContentLayout.Flow,
          validate: (value: unknown) => PresentationContentLayoutSchema.parse(value),
        },
      },
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

  it("consumes direct page prose candidates without repeatedly rescanning them", () => {
    const paragraphs = Array.from({ length: 64 }, (_, index) =>
      textblock(
        "paragraph",
        id(`direct${index.toString().padStart(6, "0")}`),
        `Paragraph ${index + 1}`,
      ),
    );
    const surfaceId = id("surface00003");
    const surface = schema.node("surface", { id: surfaceId, variant: "page-default" }, paragraphs);
    const candidates: PublishedSemanticChild[] = [];
    let offset = 0;
    surface.forEach((node) => {
      candidates.push(
        Object.freeze({
          relativePos: offset,
          semanticRole: "rich-text" as const,
          label: node.textContent,
        }),
      );
      offset += node.nodeSize;
    });

    let candidateReads = 0;
    const orderedCandidates = new Proxy(candidates, {
      get: (target, property, receiver) => {
        if (typeof property === "string" && /^\d+$/.test(property)) candidateReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const projectChildren = createSurfaceDocumentSemantics({
      directRichText: true,
    }).projectChildren;
    if (!projectChildren) throw new Error("Expected Surface semantic child projection.");

    const published = projectChildren({
      owner: surface,
      ownerId: surfaceId,
      definitionId: "page-default",
      helpers: {
        projectDirectOwnedMembers: () => Object.freeze([]),
        projectStandardRichText: () => orderedCandidates,
        projectStructuralChildren: () => Object.freeze([]),
      },
    });

    expect(published).toHaveLength(paragraphs.length);
    expect(candidateReads).toBeLessThanOrEqual(paragraphs.length);
  });

  it("publishes only approved slide title and subtitle content roots", () => {
    const titleId = id("slidetitle01");
    const subtitleWrapperId = id("subtitle0001");
    const subtitleId = id("subtitle0002");
    const privateRegionParagraphId = id("privatepara1");
    const privateSlotFamilies = [
      {
        family: "image",
        slotId: id("imageslot001"),
        proseId: id("imageprv0001"),
        text: "Private image slot prose",
      },
      {
        family: "background",
        slotId: id("backgrnd0001"),
        proseId: id("backprv00001"),
        text: "Private background slot prose",
      },
      {
        family: "band",
        slotId: id("bandslot0001"),
        proseId: id("bandprv00001"),
        text: "Private band slot prose",
      },
      {
        family: "backdrop",
        slotId: id("backdrop0001"),
        proseId: id("dropprv00001"),
        text: "Private backdrop slot prose",
      },
      {
        family: "diptych",
        slotId: id("diptych00001"),
        proseId: id("dipprv000001"),
        text: "Private diptych slot prose",
      },
      {
        family: "triptych",
        slotId: id("triptych0001"),
        proseId: id("triprv000001"),
        text: "Private triptych slot prose",
      },
    ] as const;
    const surface = schema.node(
      "surface",
      {
        id: id("surface00002"),
        variant: "slide-cover",
        settings: Object.fromEntries(
          privateSlotFamilies.map(({ family, slotId, proseId, text }) => [
            family,
            { id: slotId, privateProse: { id: proseId, text } },
          ]),
        ),
      },
      [
        textblock("heading", titleId, "Authored title"),
        schema.node("slide_cover_subtitle", { id: subtitleWrapperId }, [
          textblock("paragraph", subtitleId, "Authored subtitle"),
        ]),
        schema.node("region", { id: id("region000002"), role: "private" }, [
          textblock("paragraph", privateRegionParagraphId, "Region-owned prose"),
        ]),
      ],
    );

    const snapshot = project(documentNode("slideshow", surface));

    expect(snapshot.itemById.get(titleId)?.label).toBe("Authored title");
    expect(snapshot.itemById.get(subtitleId)?.label).toBe("Authored subtitle");
    expect(snapshot.parentById.get(titleId)).toBe(surface.attrs["id"]);
    expect(snapshot.parentById.get(subtitleId)).toBe(surface.attrs["id"]);
    for (const privateId of [
      subtitleWrapperId,
      ...privateSlotFamilies.flatMap(({ slotId, proseId }) => [slotId, proseId]),
    ]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
      expect(
        snapshot.itemById
          .get(surface.attrs["id"])
          ?.children.map(({ id: childId }) => childId),
      ).not.toContain(privateId);
    }
    const publicDescriptions = JSON.stringify(
      [...snapshot.itemById.values()].map(({ label, summary }) => ({ label, summary })),
    );
    for (const { text } of privateSlotFamilies) {
      expect(publicDescriptions).not.toContain(text);
      expect(JSON.stringify(snapshot.diagnostics)).not.toContain(text);
    }
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
    schema.node("courseDocument", { id: id("course000001"), mode }, [
      ...(mode === "slideshow"
        ? [schema.node("courseSection", { id: id("section00001"), title: "Slides" })]
        : []),
      surface,
    ]),
  ]);
}

function textblock(type: string, nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node(type, { id: nodeId }, [schema.text(text)]);
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
