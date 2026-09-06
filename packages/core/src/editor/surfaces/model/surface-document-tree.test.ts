import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { projectCourseStructure } from "@/document/model/course-structure/course-structure-projection";
import {
  buildDocumentTree,
  type ExposedDocumentChild,
  type DocumentTreeDefinitionLookup,
  type DocumentTreeSurfaceDefinition,
} from "@/document/model/document-tree";

import { builtInSurfaceVariantRegistry } from "./built-in-surface-variant-definitions";
import { createSurfaceDocumentTree } from "./surface-document-tree";

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

    expect(snapshot.itemById.get(surface.attrs["id"])?.presentation.actionIds).toEqual([
      "reveal",
      "hide",
      "move",
      "emphasize",
    ]);
    expect(snapshot.itemById.get(directParagraphId)?.presentation.actionIds).toEqual([
      "reveal",
      "hide",
      "move",
      "emphasize",
    ]);
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
    const candidates: ExposedDocumentChild[] = [];
    let offset = 0;
    surface.forEach((node) => {
      candidates.push(
        Object.freeze({
          relativePos: offset,
          treeRole: "rich-text" as const,
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
    const projectChildren = createSurfaceDocumentTree({
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
    const surface = schema.node(
      "surface",
      {
        id: id("surface00002"),
        variant: "slide-cover",
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
    expect(snapshot.itemById.has(subtitleWrapperId)).toBe(false);
    expect(snapshot.parentById.has(subtitleWrapperId)).toBe(false);
    expect(snapshot.locationById.has(subtitleWrapperId)).toBe(false);
    expect(snapshot.parentById.get(privateRegionParagraphId)).toBe(id("region000002"));
  });

  it.each([
    "slide-image-cover",
    "slide-image-band",
    "slide-image-content-split",
    "slide-image-content-stacked",
    "slide-full-bleed-image",
    "slide-image-backdrop-panel",
    "slide-diptych",
    "slide-triptych",
  ])("keeps schema-valid private media settings out of %s semantics", (variant) => {
    const definition = builtInSurfaceVariantRegistry.get(variant);
    if (!definition) throw new Error(`Missing built-in Surface definition: ${variant}`);
    const created = definition.createSurface({ surfaceId: id("surface00004") });
    const baselineSettings = definition.settingsSchema.parse(created.attrs?.["settings"] ?? {});
    const privateSettings = definition.settingsSchema.parse(
      addPrivateMediaSettings(variant, baselineSettings),
    );
    const baselineSurface = surfaceFromDefinition(created, baselineSettings);
    const privateSurface = surfaceFromDefinition(created, privateSettings);

    const baseline = project(documentNode("slideshow", baselineSurface));
    const withPrivateMedia = project(documentNode("slideshow", privateSurface));

    expect(publicSemanticShape(withPrivateMedia)).toEqual(publicSemanticShape(baseline));
    expect(JSON.stringify(publicSemanticShape(withPrivateMedia))).not.toContain(PRIVATE_MEDIA_TEXT);
    expect(JSON.stringify(withPrivateMedia.diagnostics)).not.toContain(PRIVATE_MEDIA_TEXT);
  });
});

const PRIVATE_MEDIA_TEXT = "Private Surface media must not enter semantic publication";

function addPrivateMediaSettings(variant: string, settings: unknown): unknown {
  if (typeof settings !== "object" || settings === null) {
    throw new Error(`Invalid settings fixture for ${variant}`);
  }
  const base = settings as Record<string, unknown>;
  const image = {
    imageUrl: "https://private.example.test/surface-media.png",
    imageAlt: PRIVATE_MEDIA_TEXT,
  };

  if (variant === "slide-image-cover" || variant === "slide-image-band") {
    return { ...base, image };
  }
  if (variant === "slide-full-bleed-image" || variant === "slide-image-backdrop-panel") {
    return { ...base, background: image };
  }

  const roles =
    variant === "slide-diptych"
      ? ["primary", "secondary"]
      : variant === "slide-triptych"
        ? ["primary", "secondary", "tertiary"]
        : ["primary"];
  return { ...base, images: Object.fromEntries(roles.map((role) => [role, image])) };
}

function surfaceFromDefinition(
  created: ReturnType<
    NonNullable<ReturnType<typeof builtInSurfaceVariantRegistry.get>>["createSurface"]
  >,
  settings: unknown,
): ProseMirrorNode {
  let nextId = 0;
  const withIds = (content: typeof created): typeof created => ({
    ...content,
    attrs: {
      ...content.attrs,
      id:
        content.type === "surface"
          ? id("surface00004")
          : id(`slot${String(nextId++).padStart(8, "0")}`),
      ...(content.type === "surface" ? { settings } : {}),
    },
    ...(content.content ? { content: content.content.map(withIds) } : {}),
  });
  return schema.nodeFromJSON(withIds(created));
}

function publicSemanticShape(snapshot: ReturnType<typeof project>) {
  return {
    roots: snapshot.roots,
    parents: [...snapshot.parentById],
    locations: [...snapshot.locationById],
    diagnostics: snapshot.diagnostics,
  };
}

function project(doc: ProseMirrorNode) {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid Surface semantics fixture.");
  const definitions: DocumentTreeDefinitionLookup = Object.freeze({
    blocks: Object.freeze({ get: () => undefined }),
    layouts: Object.freeze({ get: () => undefined }),
    surfaces: Object.freeze({
      get: (variant: string): DocumentTreeSurfaceDefinition | undefined => {
        const definition = builtInSurfaceVariantRegistry.get(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentTree ? { documentTree: definition.documentTree } : {}),
            }
          : undefined;
      },
    }),
  });
  return buildDocumentTree({ doc, courseStructure, definitions, revision: 1 });
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
