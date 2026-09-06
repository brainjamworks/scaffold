import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildDocumentTree, type DocumentTreeSnapshot, type DocumentTreeItem } from "../index";
import { createRepresentativeDocumentTreeFixture } from "./testing/document-tree-fixtures";

describe.each(["page", "slideshow"] as const)("integrated %s semantic projection", (kind) => {
  it("produces one complete immutable hierarchy with exact indexes and contained diagnostics", () => {
    const fixture = createRepresentativeDocumentTreeFixture({ kind });

    const snapshot = buildDocumentTree({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 42,
    });

    const expectedRootIds = fixture.courseSectionId
      ? [fixture.courseSectionId]
      : fixture.surfaces.map(({ surface }) => surface);
    expect(snapshot.revision).toBe(42);
    expect(snapshot.mode).toBe(kind === "page" ? "page" : "slideshow");
    expect(snapshot.roots.map(({ id }) => id)).toEqual(expectedRootIds);
    if (fixture.courseSectionId) {
      expect(snapshot.itemById.get(fixture.courseSectionId)?.children.map(({ id }) => id)).toEqual(
        fixture.surfaces.map(({ surface }) => surface),
      );
    }
    expect(new Set([...snapshot.itemById.values()].map(({ kind }) => kind))).toEqual(
      new Set([
        ...(fixture.courseSectionId ? ["course-section"] : []),
        "surface",
        "region",
        "layout",
        "layout-section",
        "rich-text",
        "grid",
        "cell",
        "block",
        "exposed-child",
      ]),
    );
    assertExactIndexes(snapshot);

    for (const ids of fixture.surfaces) {
      expect(ids.repeatedParagraphs.map((id) => snapshot.itemById.get(id)?.label)).toEqual([
        "Repeat 1",
        "Repeat 2",
      ]);
      expect(snapshot.locationById.get(ids.listItem)?.selectionTarget).toEqual({
        kind: "text",
        from: (snapshot.locationById.get(ids.listItem)?.from ?? 0) + 2,
        to: (snapshot.locationById.get(ids.listItem)?.from ?? 0) + 2,
      });
      expect(snapshot.parentById.get(ids.publishedParagraph)).toBe(ids.publishedContainer);
      expect(snapshot.itemById.get(ids.nestedBlock)).toMatchObject({
        kind: "block",
        label: "Nested card",
      });
      expect(snapshot.itemById.has(ids.privateAssessmentParagraph)).toBe(false);
      expect(snapshot.itemById.has(ids.privateThrowingParagraph)).toBe(false);
      expect(snapshot.itemById.get(ids.surface)?.presentation.actionIds).toEqual(["reveal"]);
      expect(snapshot.itemById.get(ids.layout)?.presentation.actionIds).toEqual(["reveal"]);
      expect(snapshot.itemById.get(ids.layoutSection)?.presentation.actionIds).toEqual(["reveal"]);
      expect(snapshot.itemById.get(ids.ownerBlock)?.presentation.actionIds).toEqual(["reveal"]);
      expect(snapshot.itemById.get(ids.publishedContainer)?.presentation.actionIds).toEqual([
        "emphasize",
      ]);
      expect(snapshot.itemById.get(ids.assessmentBlock)?.presentation.actionIds).toEqual([]);
      expect(snapshot.itemById.get(ids.assessmentBlock)?.label).toBe("Safe assessment");
      expect(snapshot.itemById.get(ids.grid)?.presentation.actionIds).toEqual([]);
      expect(snapshot.itemById.get(ids.cells[0])?.presentation.actionIds).toEqual([]);
    }
    expect(snapshot.diagnostics).toEqual(
      fixture.surfaces.map(({ throwingBlock }) => ({
        code: "definition-callback-failed",
        ownerId: throwingBlock,
        candidateId: null,
        ownerNodeType: "throwing_block",
        candidateNodeType: null,
      })),
    );
    expect(fixture.callbackCounts).toEqual({
      layoutSection: fixture.surfaces.length,
      ownerBlock: fixture.surfaces.length,
      assessmentBlock: 0,
      throwingBlock: fixture.surfaces.length,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.roots)).toBe(true);
  });
});

describe("standard Layout Section exposure", () => {
  it("publishes prose when the mounted Section definition does not override content roots", () => {
    const fixture = createRepresentativeDocumentTreeFixture({ kind: "page" });
    const definitions = {
      ...fixture.definitions,
      layouts: {
        get: (variant: string) => {
          const definition = fixture.definitions.layouts.get(variant);
          if (!definition?.section) return definition;
          return {
            ...definition,
            section: {
              ...definition.section,
              documentTree: {
                presentation: { actionIds: ["reveal"] as const },
              },
            },
          };
        },
      },
    };

    const snapshot = buildDocumentTree({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions,
      revision: 43,
    });
    const ids = fixture.surfaces[0]!;

    expect(ids.repeatedParagraphs.map((id) => snapshot.itemById.get(id)?.label)).toEqual([
      "Repeat 1",
      "Repeat 2",
    ]);
    expect(ids.repeatedParagraphs.map((id) => snapshot.parentById.get(id))).toEqual([
      ids.layoutSection,
      ids.layoutSection,
    ]);
  });
});

function assertExactIndexes(snapshot: DocumentTreeSnapshot): void {
  const visited = new Set<EmbeddedNodeId>();
  const visit = (item: DocumentTreeItem, parentId: EmbeddedNodeId | null) => {
    expect(visited.has(item.id)).toBe(false);
    visited.add(item.id);
    expect(snapshot.itemById.get(item.id)).toBe(item);
    expect(snapshot.parentById.get(item.id)).toBe(parentId);
    const location = snapshot.locationById.get(item.id);
    expect(location).toMatchObject({ id: item.id, nodeType: item.nodeType });
    expect(location?.from).toBeLessThan(location?.to ?? 0);
    for (const child of item.children) visit(child, item.id);
  };
  for (const root of snapshot.roots) visit(root, null);
  expect(visited.size).toBe(snapshot.itemById.size);
  expect(snapshot.parentById.size).toBe(snapshot.itemById.size);
  expect(snapshot.locationById.size).toBe(snapshot.itemById.size);
}
