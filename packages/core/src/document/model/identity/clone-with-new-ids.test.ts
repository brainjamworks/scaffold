import type { JSONContent } from "@tiptap/core";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_AUTHORING_STATE,
  createSemanticLifecycleDocument,
  projectSemanticLifecycleDocument,
  requireLifecycleNodeById,
} from "@/composition/application/testing/semantic-publication-lifecycle-fixtures";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createEmbeddedNodeId } from "./stable-ids";

import {
  cloneJsonWithNewStableIds as cloneJsonWithNewStableIdsUsingLookup,
  createContentIdentityRewriteLookup,
  type ContentIdentityRewrite,
  type ContentIdentityRewriteLookup,
  type CloneJsonWithNewStableIdsOptions,
} from "./clone-with-new-ids";

const STABLE_ID_PATTERN = /^[0-9A-Z_a-z-]{12}$/;
const SOURCE_SURFACE_ID = createEmbeddedNodeId();
const CORE_IDENTITY_REWRITES = createScaffoldApplication().capabilities.contentIdentity.rewrites;
const EMPTY_IDENTITY_REWRITES: ContentIdentityRewriteLookup = Object.freeze({
  getByNodeType: () => undefined,
  hasNodeType: () => false,
});

function cloneJsonWithNewStableIds<T extends JSONContent | JSONContent[]>(
  content: T,
  options: Omit<CloneJsonWithNewStableIdsOptions, "identityRewrites"> & {
    identityRewrites?: ContentIdentityRewriteLookup;
  } = {},
): T {
  return cloneJsonWithNewStableIdsUsingLookup(content, {
    identityRewrites: CORE_IDENTITY_REWRITES,
    ...options,
  });
}

function identityRewriteLookup(
  operations: Readonly<Record<string, ContentIdentityRewrite>>,
  mountedNodeTypes: readonly string[] = Object.keys(operations),
): ContentIdentityRewriteLookup {
  const mountedNodeTypeSet = new Set(mountedNodeTypes);
  return Object.freeze({
    getByNodeType: (nodeType: string) => operations[nodeType],
    hasNodeType: (nodeType: string) => mountedNodeTypeSet.has(nodeType),
  });
}

function firstNodeByType(node: JSONContent, type: string): JSONContent | undefined {
  if (node.type === type) return node;

  for (const child of node.content ?? []) {
    const match = firstNodeByType(child, type);
    if (match) return match;
  }

  return undefined;
}

function attrsOf(node: JSONContent | undefined): Record<string, unknown> {
  return node?.attrs && typeof node.attrs === "object" ? node.attrs : {};
}

function assessmentOf(node: JSONContent | undefined): Record<string, unknown> {
  const assessment = attrsOf(node)["assessment"];
  return assessment && typeof assessment === "object" && !Array.isArray(assessment)
    ? (assessment as Record<string, unknown>)
    : {};
}

describe("cloneJsonWithNewStableIds", () => {
  it("rewrites nested Block and Surface owners inside-out through one neutral lookup", () => {
    const order: string[] = [];
    const rewrite = (owner: string): ContentIdentityRewrite =>
      vi.fn(({ content, generators }) => {
        order.push(owner);
        return {
          ...content,
          attrs: { ...content.attrs, privateId: generators.createDataId() },
        };
      });
    const identityRewrites = createContentIdentityRewriteLookup([
      { nodeType: "block_owner", rewrite: rewrite("block") },
      { nodeType: "surface_owner", rewrite: rewrite("surface") },
    ]);
    const source: JSONContent[] = [
      {
        type: "surface_owner",
        attrs: { id: "surfaceold01", privateId: "privateold01" },
        content: [{ type: "block_owner", attrs: { id: "blockold0001" } }],
      },
      { type: "surface_owner", attrs: { id: "surfaceold02", privateId: "privateold02" } },
    ];
    const dataIds = ["datanew00001", "datanew00002", "datanew00003"];

    const clone = cloneJsonWithNewStableIdsUsingLookup(source, {
      identityRewrites,
      createDataId: () => EmbeddedDataIdSchema.parse(dataIds.shift()),
      createId: () => createEmbeddedNodeId(),
    });

    expect(order).toEqual(["block", "surface", "surface"]);
    expect(clone[0]?.attrs?.["privateId"]).toBe("datanew00002");
    expect(clone[0]?.content?.[0]?.attrs?.["privateId"]).toBe("datanew00001");
    expect(clone[1]?.attrs?.["privateId"]).toBe("datanew00003");
  });

  it("rejects duplicate owner registrations", () => {
    const rewrite: ContentIdentityRewrite = ({ content }) => content;

    expect(() =>
      createContentIdentityRewriteLookup([
        { nodeType: "surface_owner", rewrite },
        { nodeType: "surface_owner", rewrite },
      ]),
    ).toThrow('Duplicate content identity rewrite registration for "surface_owner"');
  });

  it("snapshots a retained registration's rewrite", () => {
    const originalRewrite: ContentIdentityRewrite = ({ content }) => ({
      ...content,
      attrs: { ...content.attrs, rewrite: "original" },
    });
    const replacementRewrite: ContentIdentityRewrite = ({ content }) => ({
      ...content,
      attrs: { ...content.attrs, rewrite: "replacement" },
    });
    const registration = { nodeType: "surface_owner", rewrite: originalRewrite };
    const lookup = createContentIdentityRewriteLookup([registration]);

    registration.rewrite = replacementRewrite;

    expect(lookup.getByNodeType("surface_owner")).toBe(originalRewrite);
  });

  it("rejects duplicate generated identities without mutating the source", () => {
    const source: JSONContent = {
      type: "surface_owner",
      attrs: { id: "surfaceold01" },
      content: [{ type: "paragraph", attrs: { id: "childold0001" } }],
    };
    const sourceSnapshot = structuredClone(source);

    expect(() =>
      cloneJsonWithNewStableIdsUsingLookup(source, {
        identityRewrites: createContentIdentityRewriteLookup([]),
        createId: () => "duplicatenew" as EmbeddedNodeId,
      }),
    ).toThrow('Duplicate generated document identity "duplicatenew"');
    expect(source).toEqual(sourceSnapshot);
  });

  it("leaves the source unchanged when a rewrite detects a missing reference", () => {
    const source: JSONContent = {
      type: "surface_owner",
      attrs: { id: "surfaceold01", privateRef: "missingold01" },
    };
    const sourceSnapshot = structuredClone(source);
    const identityRewrites = createContentIdentityRewriteLookup([
      {
        nodeType: "surface_owner",
        rewrite: ({ content, nodeIdChanges }) => {
          const reference = EmbeddedNodeIdSchema.parse(content.attrs?.["privateRef"]);
          if (!nodeIdChanges.has(reference)) {
            throw new Error(`Missing copied identity for "${reference}"`);
          }
          return content;
        },
      },
    ]);

    expect(() =>
      cloneJsonWithNewStableIdsUsingLookup(source, {
        identityRewrites,
        createId: () => EmbeddedNodeIdSchema.parse("surfacenew01"),
      }),
    ).toThrow('Missing copied identity for "missingold01"');
    expect(source).toEqual(sourceSnapshot);
  });

  it("gives a contributed Block one immutable node map for private Data rewriting", () => {
    const source: JSONContent = {
      type: "copy_fixture",
      attrs: {
        id: "blockold0001",
        data: {
          records: [{ id: "dataold00001", label: "Private row" }],
          selectedId: "dataold00001",
          nodeRef: "childold0001",
        },
      },
      content: [
        {
          type: "paragraph",
          attrs: { id: "childold0001" },
          content: [{ type: "text", text: "Fixture" }],
        },
        {
          type: "copy_observer",
          attrs: { id: "observeold01" },
        },
      ],
    };
    const sourceSnapshot = structuredClone(source);
    const seenMaps: ReadonlyMap<unknown, unknown>[] = [];
    const operationOrder: string[] = [];
    let parentSawChildRepair = false;
    const repairPrivateIdentity = vi.fn(({ content, nodeIdChanges, generators }) => {
      operationOrder.push("parent");
      seenMaps.push(nodeIdChanges);
      parentSawChildRepair =
        content.content?.[1]?.attrs?.["data"]?.repairedBy === "child-capability";
      const data = content.attrs?.["data"] as {
        records: Array<{ id: string; label: string }>;
        selectedId: string;
        nodeRef: string;
      };
      const nextDataId = generators.createDataId();

      return {
        ...content,
        attrs: {
          ...content.attrs,
          data: {
            ...data,
            records: data.records.map((record) => ({ ...record, id: nextDataId })),
            selectedId: nextDataId,
            nodeRef: nodeIdChanges.get(EmbeddedNodeIdSchema.parse(data.nodeRef)),
          },
        },
      };
    });
    const observeCopiedContent = vi.fn(({ content, nodeIdChanges }) => {
      operationOrder.push("child");
      seenMaps.push(nodeIdChanges);
      return {
        ...content,
        attrs: {
          ...content.attrs,
          data: { repairedBy: "child-capability" },
        },
      };
    });
    const identityRewrites = identityRewriteLookup({
      copy_fixture: repairPrivateIdentity,
      copy_observer: observeCopiedContent,
    });
    const allocatedNodeIds = [
      EmbeddedNodeIdSchema.parse("blocknew0001"),
      EmbeddedNodeIdSchema.parse("childnew0001"),
      EmbeddedNodeIdSchema.parse("observenew01"),
    ];

    const clone = cloneJsonWithNewStableIds(source, {
      identityRewrites,
      createDataId: () => EmbeddedDataIdSchema.parse("datanew00001"),
      createId: () => {
        const id = allocatedNodeIds.shift();
        if (!id) throw new Error("unexpected node identity allocation");
        return id;
      },
    });

    expect(repairPrivateIdentity).toHaveBeenCalledOnce();
    expect(observeCopiedContent).toHaveBeenCalledOnce();
    expect(seenMaps).toHaveLength(2);
    expect(operationOrder).toEqual(["child", "parent"]);
    expect(parentSawChildRepair).toBe(true);
    expect(seenMaps[0]).toBe(seenMaps[1]);
    expect(Object.isFrozen(seenMaps[0])).toBe(true);
    expect("set" in seenMaps[0]!).toBe(false);
    expect(seenMaps[0]?.get(EmbeddedNodeIdSchema.parse("blockold0001"))).toBe("blocknew0001");
    expect(seenMaps[0]?.get(EmbeddedNodeIdSchema.parse("childold0001"))).toBe("childnew0001");
    expect(clone).toEqual({
      type: "copy_fixture",
      attrs: {
        id: "blocknew0001",
        data: {
          records: [{ id: "datanew00001", label: "Private row" }],
          selectedId: "datanew00001",
          nodeRef: "childnew0001",
        },
      },
      content: [
        {
          type: "paragraph",
          attrs: { id: "childnew0001" },
          content: [{ type: "text", text: "Fixture" }],
        },
        {
          type: "copy_observer",
          attrs: {
            id: "observenew01",
            data: { repairedBy: "child-capability" },
          },
        },
      ],
    });
    expect(source).toEqual(sourceSnapshot);
  });

  it("clones an ordinary registered Block without callback ceremony", () => {
    const clone = cloneJsonWithNewStableIds(
      { type: "ordinary_fixture", attrs: { id: "ordinary0001" } },
      {
        identityRewrites: identityRewriteLookup({}, ["ordinary_fixture"]),
        createId: () => EmbeddedNodeIdSchema.parse("ordinary0002"),
      },
    );

    expect(clone.attrs?.["id"]).toBe("ordinary0002");
  });

  it.each([
    {
      label: "root document-node identity",
      tamper: (content: JSONContent): JSONContent => ({
        ...content,
        attrs: { ...content.attrs, id: "tampered0001" },
      }),
    },
    {
      label: "root node type",
      tamper: (content: JSONContent): JSONContent => ({ ...content, type: "different_owner" }),
    },
    {
      label: "structural content topology",
      tamper: (content: JSONContent): JSONContent => ({
        ...content,
        content: [...(content.content ?? []), { type: "paragraph" }],
      }),
    },
  ])("rejects an operation that changes its $label", ({ tamper }) => {
    const source: JSONContent = {
      type: "hostile_owner",
      attrs: { id: "ownerold0001", data: { privateRef: "ownerold0001" } },
      content: [{ type: "paragraph", attrs: { id: "paraold00001" } }],
    };
    const sourceSnapshot = structuredClone(source);
    const identityRewrites = identityRewriteLookup({
      hostile_owner: ({ content }) => tamper(content),
    });
    const allocatedNodeIds = ["ownernew0001", "paranew00001"];

    expect(() =>
      cloneJsonWithNewStableIds(source, {
        identityRewrites,
        createId: () => {
          const id = allocatedNodeIds.shift();
          if (!id) throw new Error("unexpected node identity allocation");
          return id;
        },
      }),
    ).toThrow(/Content identity rewrite/);
    expect(source).toEqual(sourceSnapshot);
  });

  it("rejects a parent operation that changes a nested ordinary mounted Block", () => {
    const source: JSONContent = {
      type: "hostile_parent",
      attrs: { id: "parentold001" },
      content: [
        {
          type: "ordinary_child",
          attrs: { id: "childold0001", data: { ownerValue: "preserve" } },
        },
      ],
    };
    const sourceSnapshot = structuredClone(source);
    const identityRewrites = identityRewriteLookup(
      {
        hostile_parent: ({ content }) => ({
          ...content,
          ...(content.content
            ? {
                content: content.content.map((child) => ({
                  ...child,
                  attrs: { ...child.attrs, data: { ownerValue: "overwritten" } },
                })),
              }
            : {}),
        }),
      },
      ["hostile_parent", "ordinary_child"],
    );
    const allocatedNodeIds = ["parentnew001", "childnew0001"];

    expect(() =>
      cloneJsonWithNewStableIds(source, {
        identityRewrites,
        createId: () => {
          const id = allocatedNodeIds.shift();
          if (!id) throw new Error("unexpected node identity allocation");
          return id;
        },
      }),
    ).toThrow(/nested registered owner "ordinary_child"/);
    expect(source).toEqual(sourceSnapshot);
  });

  it.each([
    {
      label: "text",
      tamper: (child: JSONContent): JSONContent => ({ ...child, text: "Changed" }),
    },
    {
      label: "marks",
      tamper: (child: JSONContent): JSONContent => ({
        ...child,
        marks: [{ type: "italic" }],
      }),
    },
  ])("rejects an operation that changes owned descendant $label", ({ tamper }) => {
    const source: JSONContent = {
      type: "hostile_owner",
      attrs: { id: "ownerold0002" },
      content: [{ type: "text", text: "Original", marks: [{ type: "bold" }] }],
    };
    const identityRewrites = identityRewriteLookup({
      hostile_owner: ({ content }) => ({
        ...content,
        ...(content.content ? { content: content.content.map(tamper) } : {}),
      }),
    });

    expect(() =>
      cloneJsonWithNewStableIds(source, {
        identityRewrites,
        createId: () => "ownernew0002",
      }),
    ).toThrow(/Content identity rewrite/);
  });

  it("does not discover private payload references without a mounted owner callback", () => {
    const allocatedNodeIds = [
      EmbeddedNodeIdSchema.parse("blocknew0002"),
      EmbeddedNodeIdSchema.parse("choicenew002"),
    ];
    const source: JSONContent = {
      type: "mcq",
      attrs: {
        id: "blockold0002",
        assessment: { correctOptionId: "choiceold002" },
      },
      content: [{ type: "selectable_choice", attrs: { id: "choiceold002" } }],
    };

    const clone = cloneJsonWithNewStableIds(source, {
      identityRewrites: EMPTY_IDENTITY_REWRITES,
      createId: () => {
        const id = allocatedNodeIds.shift();
        if (!id) throw new Error("unexpected node identity allocation");
        return id;
      },
    });

    expect(firstNodeByType(clone, "selectable_choice")?.attrs?.["id"]).toBe("choicenew002");
    expect(assessmentOf(clone)["correctOptionId"]).toBe("choiceold002");
  });

  it("remaps a complete course section fragment through one coordinated identity source", () => {
    const source: JSONContent[] = [
      {
        type: "courseSection",
        attrs: { id: "section-original", title: "Introduction" },
      },
      {
        type: "surface",
        attrs: { id: "surface-a-original", variant: "slide-cover", settings: {} },
        content: [
          {
            type: "mcq",
            attrs: {
              id: "mcq-original",
              assessment: {
                correctOptionId: "choice-original",
                feedbackByOptionId: { "choice-original": { kind: "rich-text" } },
              },
            },
          },
        ],
      },
      {
        type: "surface",
        attrs: { id: "surface-b-original", variant: "slide-cover", settings: {} },
        content: [{ type: "selectable_choice", attrs: { id: "choice-original" } }],
      },
    ];
    const allocatedIds = [
      "section_copy",
      "surface_a_cp",
      "mcq_copy_001",
      "surface_b_cp",
      "choice_cp_01",
    ];
    const createId = () => {
      const id = allocatedIds.shift();
      if (!id) throw new Error("unexpected identity allocation");
      return id;
    };

    const clone = cloneJsonWithNewStableIds(source, { createId });
    const clonedMcq = firstNodeByType(clone[1]!, "mcq");
    const clonedChoice = firstNodeByType(clone[2]!, "selectable_choice");

    expect(clone.map((node) => node.attrs?.["id"])).toEqual([
      "section_copy",
      "surface_a_cp",
      "surface_b_cp",
    ]);
    expect(clonedMcq?.attrs?.["id"]).toBe("mcq_copy_001");
    expect(clonedChoice?.attrs?.["id"]).toBe("choice_cp_01");
    expect(assessmentOf(clonedMcq)["correctOptionId"]).toBe("choice_cp_01");
    expect(
      Object.keys(assessmentOf(clonedMcq)["feedbackByOptionId"] as Record<string, unknown>),
    ).toEqual(["choice_cp_01"]);
    expect(
      new Set([
        ...clone.map((node) => node.attrs?.["id"]),
        clonedMcq?.attrs?.["id"],
        clonedChoice?.attrs?.["id"],
      ]).size,
    ).toBe(5);
    expect(source).toEqual([
      {
        type: "courseSection",
        attrs: { id: "section-original", title: "Introduction" },
      },
      {
        type: "surface",
        attrs: { id: "surface-a-original", variant: "slide-cover", settings: {} },
        content: [
          {
            type: "mcq",
            attrs: {
              id: "mcq-original",
              assessment: {
                correctOptionId: "choice-original",
                feedbackByOptionId: { "choice-original": { kind: "rich-text" } },
              },
            },
          },
        ],
      },
      {
        type: "surface",
        attrs: { id: "surface-b-original", variant: "slide-cover", settings: {} },
        content: [{ type: "selectable_choice", attrs: { id: "choice-original" } }],
      },
    ]);
  });

  it("allocates a fresh surface instance id without changing its variant or current shape", () => {
    const source = slideCoverSurfaceDefinition.createSurface({ surfaceId: SOURCE_SURFACE_ID });

    const clone = cloneJsonWithNewStableIds(source);

    expect(source.attrs?.["id"]).toBe(SOURCE_SURFACE_ID);
    expect(clone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone.attrs?.["id"]).not.toBe(SOURCE_SURFACE_ID);
    expect(clone.attrs?.["variant"]).toBe("slide-cover");
    expect(clone.attrs?.["settings"]).toEqual(source.attrs?.["settings"]);
    expect(clone.content).toEqual(source.content);
  });

  it("regenerates block and ProseMirror component ids without mutating the source", () => {
    const source: JSONContent = {
      type: "mcq",
      attrs: {
        id: "block-original",
        assessment: { correctOptionId: "choice-a", feedbackByOptionId: {} },
      },
      content: [
        {
          type: "assessment_choices_group",
          content: [
            {
              type: "selectable_choice",
              attrs: { id: "choice-a", isCorrect: true },
              content: [
                {
                  type: "selectable_choice_body",
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const clone = cloneJsonWithNewStableIds(source);
    const choice = firstNodeByType(clone, "selectable_choice");
    const assessment = assessmentOf(clone);

    expect(clone).not.toBe(source);
    expect(source.attrs?.["id"]).toBe("block-original");
    expect(firstNodeByType(source, "selectable_choice")?.attrs?.["id"]).toBe("choice-a");
    expect(clone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone.attrs?.["id"]).not.toBe("block-original");
    expect(choice?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(choice?.attrs?.["id"]).not.toBe("choice-a");
    expect(assessment["correctOptionId"]).not.toBe("choice-a");
  });

  it("regenerates structural cell and section ids", () => {
    const layoutClone = cloneJsonWithNewStableIds({
      type: "layout",
      attrs: { id: "layout-original" },
      content: [
        {
          type: "section",
          attrs: { id: "section-original" },
        },
      ],
    });
    const gridClone = cloneJsonWithNewStableIds({
      type: "grid",
      attrs: { id: "grid-original" },
      content: [
        {
          type: "cell",
          attrs: { id: "cell-original" },
        },
      ],
    });

    const section = firstNodeByType(layoutClone, "section");
    const cell = firstNodeByType(gridClone, "cell");

    expect(layoutClone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(section?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(gridClone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(cell?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(section?.attrs?.["id"]).not.toBe("section-original");
    expect(cell?.attrs?.["id"]).not.toBe("cell-original");
  });

  it("regenerates gallery block and item ids", () => {
    const source: JSONContent = {
      type: "gallery",
      attrs: {
        id: "block-gallery-original",
        data: {
          type: "gallery",
          layout: "carousel",
          caption: { type: "doc", content: [{ type: "paragraph" }] },
        },
      },
      content: [
        {
          type: "gallery_item",
          attrs: {
            id: "component-gallery-item-a",
            data: {
              image: { mode: "external", src: "https://example.com/a.jpg", alt: "A" },
              caption: {
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Caption A" }] }],
              },
            },
          },
        },
        {
          type: "gallery_item",
          attrs: {
            id: "component-gallery-item-b",
            data: {
              image: { mode: "external", src: "https://example.com/b.jpg", alt: "B" },
              caption: {
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Caption B" }] }],
              },
            },
          },
        },
      ],
    };

    const clone = cloneJsonWithNewStableIds(source);
    const cloneItems = clone.content ?? [];

    expect(source.attrs?.["id"]).toBe("block-gallery-original");
    expect(source.content?.[0]?.attrs?.["id"]).toBe("component-gallery-item-a");
    expect(clone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone.attrs?.["id"]).not.toBe("block-gallery-original");
    expect(cloneItems.map((item) => item.attrs?.["id"])).toEqual([
      expect.stringMatching(STABLE_ID_PATTERN),
      expect.stringMatching(STABLE_ID_PATTERN),
    ]);
    expect(cloneItems[0]?.attrs?.["id"]).not.toBe("component-gallery-item-a");
    expect(cloneItems[1]?.attrs?.["id"]).not.toBe("component-gallery-item-b");
  });

  it("regenerates Annotated Figure and annotation ids without changing compound content", () => {
    const source: JSONContent = {
      type: "annotated_figure",
      attrs: {
        id: "annotated-figure-original",
        data: {
          type: "annotated_figure",
          source: { mode: "external", src: "https://example.com/figure.png" },
          alt: "Map",
          captionDisplay: "list",
        },
      },
      content: [
        { type: "annotated_figure_canvas" },
        {
          type: "annotated_figure_legend",
          content: [
            {
              type: "annotated_figure_annotation",
              attrs: { id: "annotation-original", x: 23, y: 67 },
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Preserved ", marks: [{ type: "bold" }] },
                    { type: "text", text: "caption" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const clone = cloneJsonWithNewStableIds(source);
    const annotation = firstNodeByType(clone, "annotated_figure_annotation");

    expect(clone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone.attrs?.["id"]).not.toBe("annotated-figure-original");
    expect(annotation?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(annotation?.attrs?.["id"]).not.toBe("annotation-original");
    expect(annotation?.attrs).toMatchObject({ x: 23, y: 67 });
    expect(annotation?.content).toEqual(source.content?.[1]?.content?.[0]?.content);
    expect(clone.attrs?.["data"]).toEqual(source.attrs?.["data"]);
  });

  it.each(APPROVED_SEMANTIC_MEMBER_FAMILY_CASES)(
    "$label gives repeated copies pairwise-disjoint persisted and semantic identities",
    (family) => {
      const sourceOwner = family.createOwner();
      const source = sourceOwner.toJSON() as JSONContent;
      const sourceBefore = structuredClone(source);
      const firstCopy = cloneJsonWithNewStableIds(source);
      const secondCopy = cloneJsonWithNewStableIds(source);
      const sourceIds = collectPersistedNodeIds(source);
      const firstCopyIds = collectPersistedNodeIds(firstCopy);
      const secondCopyIds = collectPersistedNodeIds(secondCopy);

      expect(source).toEqual(sourceBefore);
      expect(withoutPersistedNodeIds(firstCopy)).toEqual(withoutPersistedNodeIds(source));
      expect(withoutPersistedNodeIds(secondCopy)).toEqual(withoutPersistedNodeIds(source));
      expectPairwiseDisjoint(sourceIds, firstCopyIds, secondCopyIds);
      expect([...firstCopyIds, ...secondCopyIds]).not.toContain(family.unrelatedSiblingId);

      const sourceDocument = family.createDocument();
      const sibling = requireLifecycleNodeById(sourceDocument, family.unrelatedSiblingId).node;
      const firstCopyNode = SEMANTIC_LIFECYCLE_AUTHORING_STATE.schema.nodeFromJSON(firstCopy);
      const secondCopyNode = SEMANTIC_LIFECYCLE_AUTHORING_STATE.schema.nodeFromJSON(secondCopy);
      const combined = createSemanticLifecycleDocument([
        sourceOwner,
        firstCopyNode,
        secondCopyNode,
        sibling,
      ]);
      const snapshot = projectSemanticLifecycleDocument(combined, 31);
      const ownerIds = [sourceOwner, firstCopyNode, secondCopyNode].map((node) =>
        EmbeddedNodeIdSchema.parse(node.attrs["id"]),
      );
      const semanticIdentitySets = ownerIds.map(
        (ownerId) =>
          new Set([
            ownerId,
            ...(snapshot.itemById.get(ownerId)?.children.map(({ id }) => id) ?? []),
          ]),
      );

      expect(snapshot.diagnostics).toEqual([]);
      expectPairwiseDisjoint(...semanticIdentitySets);
      const semanticLocations = ownerIds.flatMap((ownerId) =>
        (snapshot.itemById.get(ownerId)?.children ?? []).map(({ id }) =>
          snapshot.locationById.get(id),
        ),
      );
      expect(new Set(semanticLocations).size).toBe(semanticLocations.length);
      for (const ownerId of ownerIds) {
        const children = snapshot.itemById.get(ownerId)?.children ?? [];
        expect(children.map(({ nodeType }) => nodeType)).toEqual([
          family.memberNodeType,
          family.memberNodeType,
        ]);
        for (const child of children) {
          expect(snapshot.parentById.get(child.id)).toBe(ownerId);
        }
      }
      expect(snapshot.itemById.has(family.unrelatedSiblingId)).toBe(true);
    },
  );

  it("needs no feature-specific identity rewrite for approved public member IDs", () => {
    expect(
      APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.map(({ ownerNodeType }) => ({
        ownerNodeType,
        operation: CORE_IDENTITY_REWRITES.getByNodeType(ownerNodeType),
      })),
    ).toEqual(
      APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.map(({ ownerNodeType }) => ({
        ownerNodeType,
        operation: undefined,
      })),
    );
  });

  it("regenerates Matching pair and child node identities without relationship attrs", () => {
    const clone = cloneJsonWithNewStableIds({
      type: "matching_pair",
      attrs: { id: "pair-a" },
      content: [
        { type: "matching_item", attrs: { id: "item-a" }, content: [{ type: "paragraph" }] },
        {
          type: "matching_target",
          attrs: { id: "target-a" },
          content: [{ type: "paragraph" }],
        },
      ],
    });
    const item = firstNodeByType(clone, "matching_item");
    const target = firstNodeByType(clone, "matching_target");

    expect(clone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone.attrs).not.toHaveProperty("itemId");
    expect(clone.attrs).not.toHaveProperty("targetId");
    expect(item?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(item?.attrs?.["id"]).not.toBe("item-a");
    expect(target?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(target?.attrs?.["id"]).not.toBe("target-a");
  });

  it("regenerates sequencing, categorise, and hotspot component ids", () => {
    const sequencing = cloneJsonWithNewStableIds({
      type: "sequencing_item",
      attrs: { id: "seq-a" },
      content: [{ type: "paragraph" }],
    });
    const categorise = cloneJsonWithNewStableIds({
      type: "categorise",
      attrs: {
        id: "categorise-block",
        assessment: {
          feedbackByItemId: { "cat-a": { kind: "rich-text" } },
        },
      },
      content: [
        {
          type: "categorise_content",
          content: [
            {
              type: "categorise_bins_group",
              content: [
                {
                  type: "categorise_bin",
                  attrs: { id: "bin-a" },
                  content: [
                    {
                      type: "categorise_bin_title",
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "categorise_items_group",
                      content: [
                        {
                          type: "categorise_item",
                          attrs: { id: "cat-a" },
                          content: [
                            {
                              type: "categorise_item_body",
                              content: [{ type: "paragraph" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const hotspot = cloneJsonWithNewStableIds({
      type: "image_hotspot",
      attrs: {
        id: "hotspot-block",
        assessment: {
          correctHotspotIds: ["hotspot-a"],
          feedbackByHotspotId: { "hotspot-a": { kind: "rich-text" } },
        },
      },
      content: [
        {
          type: "image_hotspot_canvas",
          attrs: {
            data: {
              hotspots: [
                {
                  id: "hotspot-a",
                  centerX: 50,
                  centerY: 50,
                  radius: 10,
                },
              ],
            },
          },
        },
      ],
    });

    const categoriseBin = firstNodeByType(categorise, "categorise_bin");
    const categoriseItem = firstNodeByType(categorise, "categorise_item");
    const categoriseAssessment = assessmentOf(categorise) as {
      feedbackByItemId?: Record<string, unknown>;
    };
    const hotspotCanvas = firstNodeByType(hotspot, "image_hotspot_canvas");
    const hotspots = (attrsOf(hotspotCanvas)["data"] as { hotspots: Array<{ id: string }> })
      .hotspots;
    const hotspotAssessment = assessmentOf(hotspot) as {
      correctHotspotIds?: string[];
      feedbackByHotspotId?: Record<string, unknown>;
    };

    expect(sequencing.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(sequencing.attrs?.["id"]).not.toBe("seq-a");
    expect(categoriseBin?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(categoriseBin?.attrs?.["id"]).not.toBe("bin-a");
    expect(categoriseItem?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(categoriseItem?.attrs?.["id"]).not.toBe("cat-a");
    expect(Object.keys(categoriseAssessment.feedbackByItemId ?? {})).toEqual([
      categoriseItem?.attrs?.["id"],
    ]);
    expect(hotspots[0]?.id).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(hotspotAssessment.correctHotspotIds).toEqual([hotspots[0]?.id]);
    expect(Object.keys(hotspotAssessment.feedbackByHotspotId ?? {})).toEqual([hotspots[0]?.id]);
  });

  it("rewrites private assessment payload refs when child ids change", () => {
    const mcq = cloneJsonWithNewStableIds({
      type: "mcq",
      attrs: {
        id: "mcq-block",
        assessment: {
          correctOptionId: "choice-a",
          feedbackByOptionId: { "choice-a": { kind: "rich-text" } },
        },
      },
      content: [{ type: "selectable_choice", attrs: { id: "choice-a" } }],
    });
    const multiselect = cloneJsonWithNewStableIds({
      type: "multiselect",
      attrs: {
        id: "multi-block",
        assessment: {
          correctOptionIds: ["choice-a"],
          feedbackByOptionId: { "choice-a": { kind: "rich-text" } },
        },
      },
      content: [{ type: "selectable_choice", attrs: { id: "choice-a" } }],
    });
    const dropdown = cloneJsonWithNewStableIds({
      type: "dropdown",
      attrs: {
        id: "dropdown-block",
        assessment: {
          correctOptionId: "option-a",
          feedbackByOptionId: { "option-a": { kind: "rich-text" } },
        },
      },
      content: [{ type: "dropdown_choice", attrs: { id: "option-a" } }],
    });
    const fillBlanks = cloneJsonWithNewStableIds({
      type: "fill_blanks",
      attrs: {
        id: "fill-block",
        assessment: {
          blanksById: {
            "blank-a": { acceptedAnswers: ["A"] },
          },
        },
      },
      content: [{ type: "fill_blank", attrs: { id: "blank-a" } }],
    });
    const sequencing = cloneJsonWithNewStableIds({
      type: "sequencing",
      attrs: {
        id: "sequence-block",
        assessment: {
          correctOrder: ["item-a"],
          feedbackByItemId: { "item-a": { kind: "rich-text" } },
        },
      },
      content: [{ type: "sequencing_item", attrs: { id: "item-a" } }],
    });
    const matching = cloneJsonWithNewStableIds({
      type: "matching",
      attrs: {
        id: "match-block",
        assessment: {
          feedbackByItemId: { "item-a": { kind: "rich-text" } },
        },
      },
      content: [
        {
          type: "matching_pair",
          attrs: { id: "pair-a" },
          content: [
            { type: "matching_item", attrs: { id: "item-a" } },
            { type: "matching_target", attrs: { id: "target-a" } },
          ],
        },
      ],
    });

    const mcqChoice = firstNodeByType(mcq, "selectable_choice");
    const multiChoice = firstNodeByType(multiselect, "selectable_choice");
    const dropdownChoice = firstNodeByType(dropdown, "dropdown_choice");
    const blank = firstNodeByType(fillBlanks, "fill_blank");
    const sequenceItem = firstNodeByType(sequencing, "sequencing_item");
    const matchingItem = firstNodeByType(matching, "matching_item");

    expect(assessmentOf(mcq)["correctOptionId"]).toBe(mcqChoice?.attrs?.["id"]);
    expect(Object.keys(assessmentOf(mcq)["feedbackByOptionId"] as Record<string, unknown>)).toEqual(
      [mcqChoice?.attrs?.["id"]],
    );
    expect(assessmentOf(multiselect)["correctOptionIds"]).toEqual([multiChoice?.attrs?.["id"]]);
    expect(
      Object.keys(assessmentOf(multiselect)["feedbackByOptionId"] as Record<string, unknown>),
    ).toEqual([multiChoice?.attrs?.["id"]]);
    expect(assessmentOf(dropdown)["correctOptionId"]).toBe(dropdownChoice?.attrs?.["id"]);
    expect(
      Object.keys(assessmentOf(dropdown)["feedbackByOptionId"] as Record<string, unknown>),
    ).toEqual([dropdownChoice?.attrs?.["id"]]);
    expect(Object.keys(assessmentOf(fillBlanks)["blanksById"] as Record<string, unknown>)).toEqual([
      blank?.attrs?.["id"],
    ]);
    expect(assessmentOf(sequencing)["correctOrder"]).toEqual([sequenceItem?.attrs?.["id"]]);
    expect(
      Object.keys(assessmentOf(sequencing)["feedbackByItemId"] as Record<string, unknown>),
    ).toEqual([sequenceItem?.attrs?.["id"]]);
    expect(assessmentOf(matching)).not.toHaveProperty("correctPairs");
    expect(
      Object.keys(assessmentOf(matching)["feedbackByItemId"] as Record<string, unknown>),
    ).toEqual([matchingItem?.attrs?.["id"]]);
  });

  it("regenerates chart row and column ids while rewriting table references", () => {
    const clone = cloneJsonWithNewStableIds({
      type: "chart_block",
      attrs: {
        id: "block-chart",
        data: {
          kind: "chart",
          version: 1,
          chartType: "bar",
          caption: "Votes",
          data: {
            kind: "inlineTable",
            columns: [
              { id: "category", label: "Fruit", valueType: "category" },
              { id: "value", label: "Votes", valueType: "number" },
            ],
            rows: [{ id: "row-a", cells: { category: "Apples", value: 12 } }],
          },
          encoding: {
            chartType: "bar",
            x: { columnId: "category" },
            y: [{ columnId: "value" }],
          },
        },
      },
    });

    const data = clone.attrs?.["data"] as {
      data: {
        columns: Array<{ id: string }>;
        rows: Array<{ id: string; cells: Record<string, unknown> }>;
      };
      encoding: {
        x: { columnId: string };
        y: Array<{ columnId: string }>;
      };
    };
    const categoryId = data.data.columns[0]?.id;
    const valueId = data.data.columns[1]?.id;

    if (!categoryId || !valueId) {
      throw new Error("expected cloned chart columns to have stable ids");
    }

    expect(clone.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(categoryId).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(valueId).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(data.data.rows[0]?.id).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(data.data.rows[0]?.cells).toEqual({
      [categoryId]: "Apples",
      [valueId]: 12,
    });
    expect(data.encoding.x.columnId).toBe(categoryId);
    expect(data.encoding.y[0]?.columnId).toBe(valueId);
  });
});

function collectPersistedNodeIds(node: JSONContent): ReadonlySet<EmbeddedNodeId> {
  const ids = new Set<EmbeddedNodeId>();
  const visit = (current: JSONContent): void => {
    const parsed = EmbeddedNodeIdSchema.safeParse(current.attrs?.["id"]);
    if (parsed.success) ids.add(parsed.data);
    for (const child of current.content ?? []) visit(child);
  };
  visit(node);
  return ids;
}

function withoutPersistedNodeIds(node: JSONContent): JSONContent {
  const clone = structuredClone(node);
  const visit = (current: JSONContent): void => {
    if (current.attrs && typeof current.attrs === "object") {
      const { id: _id, ...attrs } = current.attrs;
      current.attrs = attrs;
    }
    for (const child of current.content ?? []) visit(child);
  };
  visit(clone);
  return clone;
}

function expectPairwiseDisjoint(...sets: readonly ReadonlySet<EmbeddedNodeId>[]): void {
  for (const [index, current] of sets.entries()) {
    for (const other of sets.slice(index + 1)) {
      expect([...current].filter((id) => other.has(id))).toEqual([]);
    }
  }
}
