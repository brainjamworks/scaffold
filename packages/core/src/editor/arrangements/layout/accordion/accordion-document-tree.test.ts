import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure/course-structure-projection";
import {
  buildDocumentTree,
  type DocumentTreeDefinitionLookup,
  type DocumentTreeLayoutDefinition,
} from "@/document/model/document-tree";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";

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
    layout: {
      group: "block",
      content: "section+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    section: {
      content: "block+",
      attrs: { id: { default: null } },
    },
    accordion_section_title: {
      group: "block",
      content: "paragraph+",
      attrs: { id: { default: null } },
    },
    accordion_section_panel: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null } },
    },
    grid: {
      group: "block",
      content: "cell+",
      attrs: { id: { default: null } },
    },
    cell: {
      content: "block+",
      attrs: { id: { default: null } },
    },
    nested_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Accordion document semantics", () => {
  it("uses title wrappers as Section labels and publishes only panel-owned descendants", () => {
    const accordionId = makeId("ac", 1);
    const firstSectionId = makeId("as", 1);
    const secondSectionId = makeId("as", 2);
    const thirdSectionId = makeId("as", 3);
    const directParagraphId = makeId("pa", 1);
    const gridId = makeId("gr", 1);
    const cellId = makeId("ce", 1);
    const nestedBlockId = makeId("bl", 1);
    const nestedLayoutId = makeId("ly", 2);
    const nestedSectionId = makeId("ts", 1);
    const nestedParagraphId = makeId("pa", 2);
    const firstTitleId = makeId("at", 1);
    const firstPanelId = makeId("ap", 1);

    const accordion = schema.node("layout", { id: accordionId, variant: "accordion" }, [
      accordionSection({
        id: firstSectionId,
        titleId: firstTitleId,
        panelId: firstPanelId,
        title: "  Authored\n section   title ",
        panel: [
          paragraph(directParagraphId, "Panel prose"),
          schema.node("grid", { id: gridId }, [
            schema.node("cell", { id: cellId }, [
              schema.node("nested_block", { id: nestedBlockId }),
            ]),
          ]),
          schema.node("layout", { id: nestedLayoutId, variant: "tabs" }, [
            schema.node("section", { id: nestedSectionId }, [
              paragraph(nestedParagraphId, "Nested section prose"),
            ]),
          ]),
        ],
      }),
      accordionSection({
        id: secondSectionId,
        titleId: makeId("at", 2),
        panelId: makeId("ap", 2),
        title: "",
        panel: [paragraph(makeId("pa", 3), "Second")],
      }),
      accordionSection({
        id: thirdSectionId,
        titleId: makeId("at", 3),
        panelId: makeId("ap", 3),
        title: "",
        panel: [paragraph(makeId("pa", 4), "Third")],
      }),
    ]);
    const doc = documentNode(accordion);
    const snapshot = buildDocumentTree({
      doc,
      courseStructure: requireCourseStructure(doc),
      definitions: definitions(),
      revision: 2,
    });

    expect(snapshot.itemById.get(firstSectionId)?.label).toBe("Authored section title");
    expect(snapshot.itemById.get(secondSectionId)?.label).toBe("Accordion section 1");
    expect(snapshot.itemById.get(thirdSectionId)?.label).toBe("Accordion section 2");
    expect(snapshot.itemById.has(firstTitleId)).toBe(false);
    expect(snapshot.itemById.has(firstPanelId)).toBe(false);
    expect(snapshot.itemById.get(firstSectionId)?.children.map(({ id }) => id)).toEqual([
      directParagraphId,
      gridId,
      nestedLayoutId,
    ]);
    expect(snapshot.parentById.get(cellId)).toBe(gridId);
    expect(snapshot.parentById.get(nestedBlockId)).toBe(cellId);
    expect(snapshot.parentById.get(nestedSectionId)).toBe(nestedLayoutId);
    expect(snapshot.parentById.get(nestedParagraphId)).toBe(nestedSectionId);

    const activation = [{ ownerId: accordionId, childId: firstSectionId, ownerKind: "layout" }];
    for (const targetId of [
      firstSectionId,
      directParagraphId,
      gridId,
      cellId,
      nestedBlockId,
      nestedLayoutId,
    ]) {
      expect(snapshot.locationById.get(targetId)?.activationPath).toEqual(activation);
    }
    const nestedActivation = [
      ...activation,
      { ownerId: nestedLayoutId, childId: nestedSectionId, ownerKind: "layout" },
    ];
    for (const targetId of [nestedSectionId, nestedParagraphId]) {
      expect(snapshot.locationById.get(targetId)?.activationPath).toEqual(nestedActivation);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });
});

function accordionSection(input: {
  readonly id: EmbeddedNodeId;
  readonly titleId: EmbeddedNodeId;
  readonly panelId: EmbeddedNodeId;
  readonly title: string;
  readonly panel: readonly ProseMirrorNode[];
}): ProseMirrorNode {
  return schema.node("section", { id: input.id }, [
    schema.node("accordion_section_title", { id: input.titleId }, [
      paragraph(makeId("tp", Number(input.titleId.slice(-1))), input.title),
    ]),
    schema.node("accordion_section_panel", { id: input.panelId }, input.panel),
  ]);
}

function documentNode(accordion: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [accordion]),
      ]),
    ]),
  ]);
}

function paragraph(nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node("paragraph", { id: nodeId }, text ? [schema.text(text)] : []);
}

function definitions(): DocumentTreeDefinitionLookup {
  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) =>
        nodeType === "nested_block"
          ? { nodeType, title: "Nested block", isAssessment: false }
          : undefined,
    }),
    layouts: Object.freeze({
      get: (variant: string): DocumentTreeLayoutDefinition | undefined => {
        const definition = builtInLayoutRegistry.getById(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentTree
                ? { documentTree: definition.documentTree }
                : {}),
              ...(definition.section
                ? {
                    section: {
                      label: definition.section.label,
                      ...(definition.section.documentTree
                        ? { documentTree: definition.section.documentTree }
                        : {}),
                    },
                  }
                : {}),
            }
          : undefined;
      },
    }),
    surfaces: Object.freeze({
      get: (variant: string) => {
        const definition = builtInSurfaceVariantRegistry.get(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentTree
                ? { documentTree: definition.documentTree }
                : {}),
            }
          : undefined;
      },
    }),
  });
}

function requireCourseStructure(doc: ProseMirrorNode): ProjectedCourseStructure {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid Accordion semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
