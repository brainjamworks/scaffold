import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DocumentTreeSnapshotItemInput } from "./document-tree-snapshot-builder";
import { createDocumentTreeSnapshotBuilder } from "./document-tree-snapshot-builder";
import { resolveDocumentItemPresentationContainer } from "./document-item-presentation-container";

const IDS = {
  surface: id("surface00001"),
  unknown: id("missing00001"),
  region: id("region000001"),
  directChild: id("direct000001"),
  layout: id("layout000001"),
  layoutSection: id("lsection0001"),
  block: id("block0000001"),
  publishedChild: id("pubchild0001"),
  outerFlowRegion: id("region000002"),
  outerFlowGrid: id("grid00000002"),
  innerSequenceCell: id("cell00000003"),
  innerSequenceParagraph: id("cellpara0002"),
  outerFlowBlock: id("block0000003"),
  outerFlowPublishedChild: id("pubchild0002"),
  outerSequenceRegion: id("region000003"),
  outerSequenceLayout: id("layout000002"),
  innerFlowSection: id("lsection0003"),
  innerFlowParagraph: id("secpara00001"),
  outerSequenceParagraph: id("seqpara00001"),
} as const;

describe("resolveDocumentItemPresentationContainer", () => {
  it("returns null for an unknown target", () => {
    const snapshot = buildSnapshot([
      {
        id: IDS.surface,
        parentId: null,
        kind: "surface",
        nodeType: "surface",
        presentationContainer: null,
      },
    ]);

    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.unknown)).toBeNull();
  });

  it("returns null for a published root without a containing boundary", () => {
    const snapshot = buildSnapshot([
      {
        id: IDS.surface,
        parentId: null,
        kind: "surface",
        nodeType: "surface",
        presentationContainer: null,
      },
    ]);

    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.surface)).toBeNull();
  });

  it("resolves a direct child to its nearest boundary and freezes the result", () => {
    const snapshot = buildSnapshot([
      {
        id: IDS.surface,
        parentId: null,
        kind: "surface",
        nodeType: "surface",
        presentationContainer: null,
      },
      {
        id: IDS.region,
        parentId: IDS.surface,
        kind: "region",
        nodeType: "region",
        presentationContainer: { contentLayout: PresentationContentLayout.Sequence },
      },
      {
        id: IDS.directChild,
        parentId: IDS.region,
        kind: "rich-text",
        nodeType: "paragraph",
        presentationContainer: null,
      },
    ]);

    const resolved = resolveDocumentItemPresentationContainer(snapshot, IDS.directChild);

    expect(resolved).toEqual({
      boundaryId: IDS.region,
      contentLayout: PresentationContentLayout.Sequence,
      directChildId: IDS.directChild,
    });
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it("resolves a Layout target through its outer Region", () => {
    expect(
      resolveDocumentItemPresentationContainer(buildLayoutSectionSnapshot(), IDS.layout),
    ).toEqual({
      boundaryId: IDS.region,
      contentLayout: PresentationContentLayout.Flow,
      directChildId: IDS.layout,
    });
  });

  it("resolves a published Block descendant through its eligible Layout Section", () => {
    expect(
      resolveDocumentItemPresentationContainer(buildLayoutSectionSnapshot(), IDS.publishedChild),
    ).toEqual({
      boundaryId: IDS.layoutSection,
      contentLayout: PresentationContentLayout.Sequence,
      directChildId: IDS.block,
    });
  });

  it("does not resolve an eligible container as its own direct child", () => {
    const snapshot = buildSnapshot([
      {
        id: IDS.region,
        parentId: null,
        kind: "region",
        nodeType: "region",
        presentationContainer: { contentLayout: PresentationContentLayout.Sequence },
      },
    ]);

    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.region)).toBeNull();
  });

  it("gives an inner Sequence Cell ownership over an outer Flow Region", () => {
    const snapshot = buildSnapshot([
      {
        id: IDS.surface,
        parentId: null,
        kind: "surface",
        nodeType: "surface",
        presentationContainer: null,
      },
      {
        id: IDS.outerFlowRegion,
        parentId: IDS.surface,
        kind: "region",
        nodeType: "region",
        presentationContainer: { contentLayout: PresentationContentLayout.Flow },
      },
      {
        id: IDS.outerFlowGrid,
        parentId: IDS.outerFlowRegion,
        kind: "grid",
        nodeType: "grid",
        presentationContainer: null,
      },
      {
        id: IDS.innerSequenceCell,
        parentId: IDS.outerFlowGrid,
        kind: "cell",
        nodeType: "cell",
        presentationContainer: { contentLayout: PresentationContentLayout.Sequence },
      },
      {
        id: IDS.innerSequenceParagraph,
        parentId: IDS.innerSequenceCell,
        kind: "rich-text",
        nodeType: "paragraph",
        presentationContainer: null,
      },
      {
        id: IDS.outerFlowBlock,
        parentId: IDS.outerFlowRegion,
        kind: "block",
        nodeType: "test-block",
        presentationContainer: null,
      },
      {
        id: IDS.outerFlowPublishedChild,
        parentId: IDS.outerFlowBlock,
        kind: "exposed-child",
        nodeType: "test-exposed-child",
        presentationContainer: null,
      },
    ]);

    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.innerSequenceParagraph)).toEqual({
      boundaryId: IDS.innerSequenceCell,
      contentLayout: PresentationContentLayout.Sequence,
      directChildId: IDS.innerSequenceParagraph,
    });
    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.outerFlowPublishedChild)).toEqual(
      {
        boundaryId: IDS.outerFlowRegion,
        contentLayout: PresentationContentLayout.Flow,
        directChildId: IDS.outerFlowBlock,
      },
    );
  });

  it("gives an inner Flow Section ownership over an outer Sequence Region", () => {
    const snapshot = buildSnapshot([
      {
        id: IDS.surface,
        parentId: null,
        kind: "surface",
        nodeType: "surface",
        presentationContainer: null,
      },
      {
        id: IDS.outerSequenceRegion,
        parentId: IDS.surface,
        kind: "region",
        nodeType: "region",
        presentationContainer: { contentLayout: PresentationContentLayout.Sequence },
      },
      {
        id: IDS.outerSequenceLayout,
        parentId: IDS.outerSequenceRegion,
        kind: "layout",
        nodeType: "layout",
        presentationContainer: null,
      },
      {
        id: IDS.innerFlowSection,
        parentId: IDS.outerSequenceLayout,
        kind: "layout-section",
        nodeType: "section",
        presentationContainer: { contentLayout: PresentationContentLayout.Flow },
      },
      {
        id: IDS.innerFlowParagraph,
        parentId: IDS.innerFlowSection,
        kind: "rich-text",
        nodeType: "paragraph",
        presentationContainer: null,
      },
      {
        id: IDS.outerSequenceParagraph,
        parentId: IDS.outerSequenceRegion,
        kind: "rich-text",
        nodeType: "paragraph",
        presentationContainer: null,
      },
    ]);

    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.innerFlowParagraph)).toEqual({
      boundaryId: IDS.innerFlowSection,
      contentLayout: PresentationContentLayout.Flow,
      directChildId: IDS.innerFlowParagraph,
    });
    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.outerSequenceParagraph)).toEqual({
      boundaryId: IDS.outerSequenceRegion,
      contentLayout: PresentationContentLayout.Sequence,
      directChildId: IDS.outerSequenceParagraph,
    });
    expect(resolveDocumentItemPresentationContainer(snapshot, IDS.innerFlowSection)).toEqual({
      boundaryId: IDS.outerSequenceRegion,
      contentLayout: PresentationContentLayout.Sequence,
      directChildId: IDS.outerSequenceLayout,
    });
  });
});

interface TestItem {
  readonly id: EmbeddedNodeId;
  readonly parentId: EmbeddedNodeId | null;
  readonly kind: DocumentTreeSnapshotItemInput["kind"];
  readonly nodeType: string;
  readonly presentationContainer: DocumentTreeSnapshotItemInput["presentationContainer"];
}

function buildLayoutSectionSnapshot() {
  return buildSnapshot([
    {
      id: IDS.surface,
      parentId: null,
      kind: "surface",
      nodeType: "surface",
      presentationContainer: null,
    },
    {
      id: IDS.region,
      parentId: IDS.surface,
      kind: "region",
      nodeType: "region",
      presentationContainer: { contentLayout: PresentationContentLayout.Flow },
    },
    {
      id: IDS.layout,
      parentId: IDS.region,
      kind: "layout",
      nodeType: "layout",
      presentationContainer: null,
    },
    {
      id: IDS.layoutSection,
      parentId: IDS.layout,
      kind: "layout-section",
      nodeType: "section",
      presentationContainer: { contentLayout: PresentationContentLayout.Sequence },
    },
    {
      id: IDS.block,
      parentId: IDS.layoutSection,
      kind: "block",
      nodeType: "test-block",
      presentationContainer: null,
    },
    {
      id: IDS.publishedChild,
      parentId: IDS.block,
      kind: "exposed-child",
      nodeType: "test-exposed-child",
      presentationContainer: null,
    },
  ]);
}

function buildSnapshot(items: readonly TestItem[]) {
  const builder = createDocumentTreeSnapshotBuilder({ revision: 1, mode: "slideshow" });

  items.forEach(({ id: itemId, parentId, kind, nodeType, presentationContainer }, index) => {
    const from = index * 10 + 1;
    builder.addItem({
      item: {
        id: itemId,
        kind,
        nodeType,
        definitionId: null,
        label: itemId,
        summary: null,
        presentation: { actionIds: [] as const, disabledReason: null },
        presentationContainer,
      },
      parentId,
      location: {
        authoringAnchorId: null,
        id: itemId,
        nodeType,
        from,
        to: from + 2,
        selectionTarget: { kind: "node", pos: from },
        surfaceId: null,
        activationPath: [],
      },
    });
  });

  return builder.build();
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
