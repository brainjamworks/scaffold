import type { JSONContent } from "@tiptap/core";
import { CourseDocumentAttrsSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DEFAULT_PRESET } from "@/theme/model";

import { migrateCourseDocumentJSON } from "../migrations";
import { v3ToV4CourseDocumentMigration } from "./v3-to-v4";

describe("v3-to-v4 Scaffold document migration", () => {
  it.each([undefined, null])(
    "materialises Scaffold Default for a legacy %s theme",
    (legacyTheme) => {
      const source = v3Document("page", legacyTheme);
      const migrated = v3ToV4CourseDocumentMigration.migrate(structuredClone(source));
      const attrs = migrated.content?.[0]?.attrs;

      expect(attrs).toMatchObject({
        schemaVersion: 4,
        mode: "page",
        theme: {
          schemaVersion: 1,
          preset: {
            id: SCAFFOLD_DEFAULT_PRESET.id,
            revision: SCAFFOLD_DEFAULT_PRESET.revision,
          },
          values: SCAFFOLD_DEFAULT_PRESET.values,
        },
      });
      expect((attrs?.["theme"] as { values?: unknown } | undefined)?.values).not.toBe(
        SCAFFOLD_DEFAULT_PRESET.values,
      );
      expect(attrs?.["theme"]?.values.colors).toMatchObject({
        author: {
          light: {
            background: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.background,
            primary: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.primary,
            link: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.primary,
          },
        },
        recipe: SCAFFOLD_DEFAULT_PRESET.values.colors.recipe,
        resolved: {
          light: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light,
          dark: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.dark,
        },
      });
      expect(attrs?.["theme"]?.values.colors).not.toHaveProperty("light");
      expect(attrs?.["theme"]?.values.colors).not.toHaveProperty("dark");
    },
  );

  it("preserves a named legacy theme as a recoverable reference", () => {
    const migrated = v3ToV4CourseDocumentMigration.migrate(
      v3Document("slideshow", "uk.ac.example.editorial"),
    );

    expect(migrated.content?.[0]?.attrs).toMatchObject({
      schemaVersion: 4,
      mode: "slideshow",
      surfaceSize: "16x9",
      overflowMode: "clip",
      theme: {
        schemaVersion: 1,
        preset: { id: "uk.ac.example.editorial", revision: null },
        values: null,
      },
    });
  });

  it("rejects malformed legacy theme values without mutating the source", () => {
    const source = v3Document("page", { css: "body {}" });
    const snapshot = structuredClone(source);

    expect(() => v3ToV4CourseDocumentMigration.migrate(source)).toThrow(
      "courseDocument.attrs.theme does not match the v3 courseDocument format",
    );
    expect(source).toEqual(snapshot);
  });

  it("establishes valid document-unique identity only across the content tree", () => {
    const attrsPayload = {
      type: "payload_record",
      id: "payload-id",
      content: [{ type: "payload_child", attrs: { id: "payload-child-id" } }],
    };
    const source = v3Document("page", null);
    source.attrs = { id: "doc-id-must-remain" };
    const courseDocument = source.content?.[0];
    const surface = courseDocument?.content?.[0];
    if (!courseDocument?.attrs || !surface?.attrs) throw new Error("Expected document fixture");

    courseDocument.attrs["id"] = "course000001";
    surface.attrs["id"] = "duplicate001";
    surface.content = [
      {
        type: "paragraph",
        attrs: { id: "duplicate001", data: structuredClone(attrsPayload) },
        content: [{ type: "text", text: "Keep text opaque", attrs: { id: "text-id" } }],
      },
      { type: "heading", attrs: { id: "not-an-id" }, content: [] },
      { type: "horizontalRule" },
    ];

    const migrated = v3ToV4CourseDocumentMigration.migrate(source);
    const eligible = contentTreeNodes(migrated).filter(
      (node) => node.type !== "doc" && node.type !== "text",
    );
    const ids = eligible.map((node) => node.attrs?.["id"]);

    expect(ids.every((id) => EmbeddedNodeIdSchema.safeParse(id).success)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(courseDocument.attrs["id"]).toBe("course000001");
    expect(surface.attrs["id"]).toBe("duplicate001");
    expect(surface.content[0]?.attrs?.["id"]).not.toBe("duplicate001");
    expect(surface.content[0]?.attrs?.["data"]).toEqual(attrsPayload);
    expect(surface.content[0]?.content?.[0]?.attrs).toEqual({ id: "text-id" });
    expect(migrated.attrs).toEqual({ id: "doc-id-must-remain" });
  });

  it("moves legacy Matching relationships to child identity and preserves feedback references", () => {
    const source = v3Document("page", null);
    const courseDocument = source.content?.[0];
    const surface = courseDocument?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");
    surface.content = [
      { type: "paragraph", attrs: { id: "item00000001" } },
      {
        type: "matching",
        attrs: {
          assessment: {
            correctPairs: [
              { itemId: "item00000001", targetId: "target000001" },
              { itemId: "malformed item", targetId: "target000001" },
            ],
            feedbackByItemId: {
              item00000001: { kind: "rich-text", document: { type: "doc" } },
              "malformed item": { kind: "rich-text", document: { type: "doc" } },
            },
            summaryFeedback: null,
          },
        },
        content: [
          {
            type: "matching_pairs_group",
            content: [
              legacyMatchingPair("item00000001", "target000001", "First", "One"),
              legacyMatchingPair("malformed item", "target000001", "Second", "Two"),
            ],
          },
        ],
      },
    ];

    const migrated = v3ToV4CourseDocumentMigration.migrate(source);
    const matching = contentTreeNodes(migrated).find((node) => node.type === "matching");
    const pairs = contentTreeNodes(matching).filter((node) => node.type === "matching_pair");
    const itemIds = pairs.map((pair) => pair.content?.[0]?.attrs?.["id"]);
    const targetIds = pairs.map((pair) => pair.content?.[1]?.attrs?.["id"]);
    const assessment = matching?.attrs?.["assessment"] as Record<string, unknown>;
    const feedbackByItemId = assessment["feedbackByItemId"] as Record<string, unknown>;

    expect(pairs).toHaveLength(2);
    expect(pairs.every((pair) => !Object.hasOwn(pair.attrs ?? {}, "itemId"))).toBe(true);
    expect(pairs.every((pair) => !Object.hasOwn(pair.attrs ?? {}, "targetId"))).toBe(true);
    expect(itemIds.every((id) => EmbeddedNodeIdSchema.safeParse(id).success)).toBe(true);
    expect(targetIds.every((id) => EmbeddedNodeIdSchema.safeParse(id).success)).toBe(true);
    expect(itemIds[0]).not.toBe("item00000001");
    expect(targetIds[0]).toBe("target000001");
    expect(targetIds[1]).not.toBe("target000001");
    expect(assessment).not.toHaveProperty("correctPairs");
    expect(Object.keys(feedbackByItemId)).toEqual(itemIds);
    expect(CourseDocumentAttrsSchema.safeParse(courseDocument?.attrs).success).toBe(true);
  });

  it.each([
    { relationship: "item", position: "before" },
    { relationship: "item", position: "after" },
    { relationship: "target", position: "before" },
    { relationship: "target", position: "after" },
  ] as const)(
    "reserves an actual $relationship owner $position Matching before allocating its legacy preference",
    ({ relationship, position }) => {
      const source = v3Document("page", null);
      const surface = source.content?.[0]?.content?.[0];
      if (!surface) throw new Error("Expected surface fixture");

      const ownerId = "conflict0001";
      const owner = {
        type: "paragraph",
        attrs: { id: ownerId },
        content: [{ type: "text", text: "Actual owner" }],
      } satisfies JSONContent;
      const matching = legacyMatchingNode([
        legacyMatchingPair(
          relationship === "item" ? ownerId : "freeitem0001",
          relationship === "target" ? ownerId : "freetarget01",
          "First",
          "One",
        ),
      ]);
      surface.content = position === "before" ? [owner, matching] : [matching, owner];

      const migrated = migrateV3Public(source);
      const migratedMatching = contentTreeNodes(migrated).find((node) => node.type === "matching");
      const migratedOwner = contentTreeNodes(migrated).find(
        (node) => node.content?.[0]?.text === "Actual owner",
      );
      const pair = contentTreeNodes(migratedMatching).find((node) => node.type === "matching_pair");
      const itemId = pair?.content?.[0]?.attrs?.["id"];
      const targetId = pair?.content?.[1]?.attrs?.["id"];
      const migratedRelationshipId = relationship === "item" ? itemId : targetId;

      expect(migratedOwner?.attrs?.["id"]).toBe(ownerId);
      expect(EmbeddedNodeIdSchema.safeParse(migratedRelationshipId).success).toBe(true);
      expect(migratedRelationshipId).not.toBe(ownerId);
      expect(relationship === "item" ? targetId : itemId).toBe(
        relationship === "item" ? "freetarget01" : "freeitem0001",
      );
    },
  );

  it.each(["legacy-first", "child-first"] as const)(
    "keeps authoritative legacy feedback when an unmapped child key is inserted %s",
    (order) => {
      const source = v3Document("page", null);
      const surface = source.content?.[0]?.content?.[0];
      if (!surface) throw new Error("Expected surface fixture");

      const legacyItemId = "legacy000001";
      const childItemId = "child0000001";
      const authoritativeFeedback = feedbackSentinel("authoritative legacy payload");
      const unmappedFeedback = feedbackSentinel("unmapped child-key payload");
      const pair = legacyMatchingPair(legacyItemId, "target000001", "First", "One");
      if (!pair.content?.[0]) throw new Error("Expected matching item fixture");
      pair.content[0].attrs = { id: childItemId };
      const entries =
        order === "legacy-first"
          ? [
              [legacyItemId, authoritativeFeedback],
              [childItemId, unmappedFeedback],
            ]
          : [
              [childItemId, unmappedFeedback],
              [legacyItemId, authoritativeFeedback],
            ];
      surface.content = [legacyMatchingNode([pair], Object.fromEntries(entries))];

      const migrated = migrateV3Public(source);
      const matching = contentTreeNodes(migrated).find((node) => node.type === "matching");
      const assessment = matching?.attrs?.["assessment"] as Record<string, unknown>;

      expect(assessment["feedbackByItemId"]).toEqual({
        [childItemId]: authoritativeFeedback,
      });
    },
  );

  it("drops feedback keys that are not published-v3 pair relationship IDs", () => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");

    const legacyItemId = "legacy000001";
    const childItemId = "child0000001";
    const authoritativeFeedback = feedbackSentinel("mapped payload");
    const pair = legacyMatchingPair(legacyItemId, "target000001", "First", "One");
    if (!pair.content?.[0]) throw new Error("Expected matching item fixture");
    pair.content[0].attrs = { id: childItemId };
    surface.content = [
      legacyMatchingNode([pair], {
        unmapped0001: feedbackSentinel("must be dropped"),
        [legacyItemId]: authoritativeFeedback,
      }),
    ];

    const migrated = migrateV3Public(source);
    const matching = contentTreeNodes(migrated).find((node) => node.type === "matching");
    const assessment = matching?.attrs?.["assessment"] as Record<string, unknown>;

    expect(assessment["feedbackByItemId"]).toEqual({
      [childItemId]: authoritativeFeedback,
    });
  });

  it.each(["missing", "reversed", "duplicate", "extra"] as const)(
    "rejects %s legacy Matching pair children through the public migration boundary",
    (shape) => {
      const source = v3Document("page", null);
      const surface = source.content?.[0]?.content?.[0];
      if (!surface) throw new Error("Expected surface fixture");
      surface.content = [legacyMatchingNode([malformedLegacyMatchingPair(shape)])];

      expect(migrateCourseDocumentJSON(source)).toMatchObject({
        ok: false,
        code: "migration_failed",
        message: expect.stringContaining(
          "legacy matching_pair must contain one matching_item followed by one matching_target",
        ),
        fromVersion: 3,
        toVersion: 4,
      });
    },
  );

  it.each([
    { container: "assessment" as const, description: "null", value: null },
    { container: "assessment" as const, description: "an array", value: [] },
    { container: "assessment" as const, description: "a primitive", value: "invalid" },
    { container: "feedbackByItemId" as const, description: "null", value: null },
    { container: "feedbackByItemId" as const, description: "an array", value: [] },
    { container: "feedbackByItemId" as const, description: "a primitive", value: 42 },
  ])("rejects present Matching $container when it is $description", ({ container, value }) => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");

    const matching = legacyMatchingNode([
      legacyMatchingPair("legacy000001", "target000001", "First", "One"),
    ]);
    const attrs = matching.attrs as Record<string, unknown>;
    if (container === "assessment") {
      attrs["assessment"] = value;
    } else {
      (attrs["assessment"] as Record<string, unknown>)["feedbackByItemId"] = value;
    }
    surface.content = [matching];
    const snapshot = structuredClone(source);

    expect(migrateCourseDocumentJSON(source)).toMatchObject({
      ok: false,
      code: "migration_failed",
      message: expect.stringContaining(`Matching ${container} must be a record when present`),
      fromVersion: 3,
      toVersion: 4,
    });
    expect(source).toEqual(snapshot);
  });

  it("preserves duplicate legacy item relationships when no keyed feedback is ambiguous", () => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");

    const legacyItemId = "legacy000001";
    surface.content = [
      legacyMatchingNode([
        legacyMatchingPair(legacyItemId, "target000001", "First", "One"),
        legacyMatchingPair(legacyItemId, "target000002", "Second", "Two"),
      ]),
    ];

    const migrated = migrateV3Public(source);
    const matching = contentTreeNodes(migrated).find((node) => node.type === "matching");
    const pairs = contentTreeNodes(matching).filter((node) => node.type === "matching_pair");
    const itemIds = pairs.map((pair) => pair.content?.[0]?.attrs?.["id"]);

    expect(pairs).toHaveLength(2);
    expect(pairs.every((pair) => pair.content?.[0]?.type === "matching_item")).toBe(true);
    expect(pairs.every((pair) => pair.content?.[1]?.type === "matching_target")).toBe(true);
    expect(itemIds.every((id) => EmbeddedNodeIdSchema.safeParse(id).success)).toBe(true);
    expect(new Set(itemIds).size).toBe(2);
  });

  it("rejects an authoritative legacy item reference shared by multiple migrated items", () => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");

    const legacyItemId = "legacy000001";
    const first = legacyMatchingPair(legacyItemId, "target000001", "First", "One");
    const second = legacyMatchingPair(legacyItemId, "target000002", "Second", "Two");
    if (!first.content?.[0] || !second.content?.[0]) {
      throw new Error("Expected matching item fixtures");
    }
    first.content[0].attrs = { id: "child0000001" };
    second.content[0].attrs = { id: "child0000002" };
    surface.content = [
      legacyMatchingNode([first, second], {
        [legacyItemId]: feedbackSentinel("ambiguous payload"),
      }),
    ];
    const snapshot = structuredClone(source);

    expect(migrateCourseDocumentJSON(source)).toMatchObject({
      ok: false,
      code: "migration_failed",
      message: expect.stringContaining("ambiguous Matching feedback relationship"),
      fromVersion: 3,
      toVersion: 4,
    });
    expect(source).toEqual(snapshot);
  });

  it("keeps duplicate legacy feedback keys isolated between sibling Matching roots", () => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");

    const legacyItemId = "legacy000001";
    const firstPair = legacyMatchingPair(legacyItemId, "target000001", "First", "One");
    const secondPair = legacyMatchingPair(legacyItemId, "target000002", "Second", "Two");
    if (!firstPair.content?.[0] || !secondPair.content?.[0]) {
      throw new Error("Expected matching item fixtures");
    }
    firstPair.content[0].attrs = { id: "child0000001" };
    secondPair.content[0].attrs = { id: "child0000002" };
    const firstFeedback = feedbackSentinel("first Matching payload");
    const secondFeedback = feedbackSentinel("second Matching payload");
    surface.content = [
      legacyMatchingNode([firstPair], { [legacyItemId]: firstFeedback }),
      legacyMatchingNode([secondPair], { [legacyItemId]: secondFeedback }),
    ];

    const migrated = migrateV3Public(source);
    const matchingNodes = contentTreeNodes(migrated).filter((node) => node.type === "matching");
    const assessments = matchingNodes.map(
      (node) => node.attrs?.["assessment"] as Record<string, unknown>,
    );

    expect(assessments).toHaveLength(2);
    expect(assessments[0]?.["feedbackByItemId"]).toEqual({ child0000001: firstFeedback });
    expect(assessments[1]?.["feedbackByItemId"]).toEqual({ child0000002: secondFeedback });
  });

  it("rejects present non-record attrs without normalising or mutating the source", () => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");
    surface.content = [{ type: "paragraph", attrs: ["KEEP-ME"] } as unknown as JSONContent];
    const snapshot = structuredClone(source);

    expect(migrateCourseDocumentJSON(source)).toMatchObject({
      ok: false,
      code: "migration_failed",
      message: expect.stringContaining("node attrs must be a record when present"),
      fromVersion: 3,
      toVersion: 4,
    });
    expect(source).toEqual(snapshot);
  });

  it("rejects present non-array content without skipping or mutating the source", () => {
    const source = v3Document("page", null);
    const surface = source.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture");
    (surface as unknown as { content: unknown }).content = {
      type: "paragraph",
      attrs: { id: "hidden000001" },
    };
    const snapshot = structuredClone(source);

    expect(migrateCourseDocumentJSON(source)).toMatchObject({
      ok: false,
      code: "migration_failed",
      message: expect.stringContaining("node content must be an array when present"),
      fromVersion: 3,
      toVersion: 4,
    });
    expect(source).toEqual(snapshot);
  });

  it("produces a document accepted by current v4 validation", () => {
    const result = migrateCourseDocumentJSON(v3Document("page", null));

    expect(result).toMatchObject({
      ok: true,
      fromVersion: 3,
      toVersion: 4,
      migrated: true,
    });
  });
});

function contentTreeNodes(node: JSONContent | undefined): JSONContent[] {
  if (!node) return [];
  return [node, ...(node.content ?? []).flatMap((child) => contentTreeNodes(child))];
}

function legacyMatchingPair(
  itemId: string,
  targetId: string,
  itemText: string,
  targetText: string,
): JSONContent {
  return {
    type: "matching_pair",
    attrs: { itemId, targetId },
    content: [
      { type: "matching_item", content: paragraphContent(itemText) },
      { type: "matching_target", content: paragraphContent(targetText) },
    ],
  };
}

function malformedLegacyMatchingPair(
  shape: "missing" | "reversed" | "duplicate" | "extra",
): JSONContent {
  const pair = legacyMatchingPair("legacy000001", "target000001", "First", "One");
  const item = pair.content?.[0];
  const target = pair.content?.[1];
  if (!item || !target) throw new Error("Expected matching pair fixture");

  pair.content =
    shape === "missing"
      ? [item]
      : shape === "reversed"
        ? [target, item]
        : shape === "duplicate"
          ? [item, structuredClone(item)]
          : [item, target, { type: "paragraph" }];
  return pair;
}

function paragraphContent(text: string): JSONContent[] {
  return [{ type: "paragraph", content: [{ type: "text", text }] }];
}

function legacyMatchingNode(
  pairs: JSONContent[],
  feedbackByItemId: Record<string, unknown> = {},
): JSONContent {
  return {
    type: "matching",
    attrs: {
      assessment: {
        correctPairs: pairs.map((pair) => ({
          itemId: pair.attrs?.["itemId"],
          targetId: pair.attrs?.["targetId"],
        })),
        feedbackByItemId,
        summaryFeedback: null,
      },
    },
    content: [{ type: "matching_pairs_group", content: pairs }],
  };
}

function feedbackSentinel(text: string): Record<string, unknown> {
  return {
    kind: "rich-text",
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

function migrateV3Public(source: JSONContent): JSONContent {
  const result = migrateCourseDocumentJSON(source);
  expect(result).toMatchObject({
    ok: true,
    fromVersion: 3,
    toVersion: 4,
    migrated: true,
  });
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

function v3Document(mode: "page" | "slideshow", theme: unknown): JSONContent {
  const attrs: Record<string, unknown> = {
    schemaVersion: 3,
    mode,
    surfaceSize: mode === "slideshow" ? "16x9" : "fluid",
    overflowMode: mode === "slideshow" ? "clip" : "grow",
  };
  if (theme !== undefined) attrs["theme"] = theme;

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs,
        content: [
          {
            type: "surface",
            attrs: {
              id: "surface00001",
              variant: mode === "slideshow" ? "slide-cover" : "page-default",
            },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}
