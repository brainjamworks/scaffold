import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import {
  CourseModeSchema,
  CourseDocumentAttrsSchema,
  OverflowModeSchema,
  SurfaceSizeSchema,
} from "@/schemas/course-document";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { defineCourseDocumentMigration } from "../migration-registry";
import { asRecord, findCourseDocument } from "./helpers";

const V3CourseDocumentAttrsSchema = z
  .object({
    schemaVersion: z.literal(3),
    mode: CourseModeSchema,
    surfaceSize: SurfaceSizeSchema.default("fluid"),
    overflowMode: OverflowModeSchema.default("grow"),
    theme: z.string().trim().min(1).nullable().optional(),
    branching: z.unknown().optional(),
  })
  .refine(
    (attrs) =>
      attrs.mode === "slideshow" ? attrs.surfaceSize === "16x9" : attrs.surfaceSize === "fluid",
    {
      message: "surfaceSize must match the course mode",
      path: ["surfaceSize"],
    },
  );

interface MatchingIdentityMigration {
  readonly itemIds: Map<string, Set<string>>;
}

function readNodeAttrs(node: JSONContent): Record<string, unknown> | null {
  if (!Object.hasOwn(node, "attrs")) return null;
  const attrs = asRecord(node.attrs);
  if (!attrs) throw new Error("node attrs must be a record when present");
  return attrs;
}

function readNodeContent(node: JSONContent): JSONContent[] {
  if (!Object.hasOwn(node, "content")) return [];
  if (!Array.isArray(node.content)) {
    throw new Error("node content must be an array when present");
  }
  return node.content;
}

function readMatchingFeedbackByItemId(
  assessment: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!Object.hasOwn(assessment, "feedbackByItemId")) return null;
  const feedbackByItemId = asRecord(assessment["feedbackByItemId"]);
  if (!feedbackByItemId) {
    throw new Error("Matching feedbackByItemId must be a record when present");
  }
  return feedbackByItemId;
}

function readMatchingAssessment(node: JSONContent): Record<string, unknown> | null {
  const attrs = readNodeAttrs(node);
  if (!attrs || !Object.hasOwn(attrs, "assessment")) return null;
  const assessment = asRecord(attrs["assessment"]);
  if (!assessment) throw new Error("Matching assessment must be a record when present");
  readMatchingFeedbackByItemId(assessment);
  return assessment;
}

function validateLegacyMatchingPair(node: JSONContent): void {
  const children = readNodeContent(node);
  if (
    children.length !== 2 ||
    children[0]?.type !== "matching_item" ||
    children[1]?.type !== "matching_target"
  ) {
    throw new Error(
      "legacy matching_pair must contain one matching_item followed by one matching_target",
    );
  }
}

function reserveActualNodeIds(node: JSONContent, owners: Map<string, JSONContent>): void {
  const attrs = readNodeAttrs(node);
  if (node.type === "matching") readMatchingAssessment(node);
  if (node.type === "matching_pair") validateLegacyMatchingPair(node);
  if (node.type !== "doc" && node.type !== "text") {
    const id = attrs?.["id"];
    if (EmbeddedNodeIdSchema.safeParse(id).success && !owners.has(id as string)) {
      owners.set(id as string, node);
    }
  }

  for (const child of readNodeContent(node)) {
    reserveActualNodeIds(child, owners);
  }
}

function createUniqueNodeId(
  allocatedIds: Set<string>,
  reservedOwners: Map<string, JSONContent>,
): string {
  let id = createEmbeddedNodeId();
  while (allocatedIds.has(id) || reservedOwners.has(id)) id = createEmbeddedNodeId();
  return id;
}

function assignCanonicalNodeId(
  node: JSONContent,
  allocatedIds: Set<string>,
  reservedOwners: Map<string, JSONContent>,
  preferredId?: unknown,
): string | null {
  if (node.type === "doc" || node.type === "text") return null;

  const attrs = readNodeAttrs(node) ?? {};
  const currentId = attrs["id"];
  const id =
    EmbeddedNodeIdSchema.safeParse(currentId).success &&
    reservedOwners.get(currentId as string) === node
      ? (currentId as string)
      : EmbeddedNodeIdSchema.safeParse(preferredId).success &&
          !reservedOwners.has(preferredId as string) &&
          !allocatedIds.has(preferredId as string)
        ? (preferredId as string)
        : createUniqueNodeId(allocatedIds, reservedOwners);

  attrs["id"] = id;
  node.attrs = attrs;
  allocatedIds.add(id);
  return id;
}

function rewriteMatchingAssessment(node: JSONContent, matching: MatchingIdentityMigration): void {
  const assessment = readMatchingAssessment(node);
  if (!assessment) return;

  delete assessment["correctPairs"];
  const feedbackByItemId = readMatchingFeedbackByItemId(assessment);
  if (!feedbackByItemId) return;
  const migratedFeedback: Array<[string, unknown]> = [];
  for (const [legacyItemId, migratedItemIds] of matching.itemIds) {
    if (!Object.hasOwn(feedbackByItemId, legacyItemId)) continue;
    if (migratedItemIds.size > 1) {
      throw new Error("ambiguous Matching feedback relationship");
    }
    const migratedItemId = [...migratedItemIds][0];
    if (!migratedItemId) continue;
    migratedFeedback.push([migratedItemId, feedbackByItemId[legacyItemId]]);
  }
  assessment["feedbackByItemId"] = Object.fromEntries(migratedFeedback);
}

function registerMatchingItemId(
  matching: MatchingIdentityMigration,
  legacyItemId: string,
  migratedItemId: string,
): void {
  const destinations = matching.itemIds.get(legacyItemId) ?? new Set<string>();
  destinations.add(migratedItemId);
  matching.itemIds.set(legacyItemId, destinations);
}

function migrateContentNodeIdentity(
  node: JSONContent,
  allocatedIds: Set<string>,
  reservedOwners: Map<string, JSONContent>,
  matching?: MatchingIdentityMigration,
  preferredId?: unknown,
): string | null {
  const assignedId = assignCanonicalNodeId(node, allocatedIds, reservedOwners, preferredId);
  const currentMatching = node.type === "matching" ? { itemIds: new Map() } : matching;
  const attrs = readNodeAttrs(node);
  const legacyItemId = node.type === "matching_pair" ? attrs?.["itemId"] : undefined;
  const legacyTargetId = node.type === "matching_pair" ? attrs?.["targetId"] : undefined;

  if (node.type === "matching_pair" && attrs) {
    delete attrs["itemId"];
    delete attrs["targetId"];
  }

  for (const child of readNodeContent(node)) {
    const childPreferredId =
      node.type === "matching_pair" && child.type === "matching_item"
        ? legacyItemId
        : node.type === "matching_pair" && child.type === "matching_target"
          ? legacyTargetId
          : undefined;
    const childId = migrateContentNodeIdentity(
      child,
      allocatedIds,
      reservedOwners,
      currentMatching,
      childPreferredId,
    );
    if (
      node.type === "matching_pair" &&
      child.type === "matching_item" &&
      typeof legacyItemId === "string" &&
      childId &&
      currentMatching
    ) {
      registerMatchingItemId(currentMatching, legacyItemId, childId);
    }
  }

  if (node.type === "matching" && currentMatching) {
    rewriteMatchingAssessment(node, currentMatching);
  }
  return assignedId;
}

function migrateContentTreeIdentity(document: JSONContent): void {
  const reservedOwners = new Map<string, JSONContent>();
  reserveActualNodeIds(document, reservedOwners);
  migrateContentNodeIdentity(document, new Set(), reservedOwners);
}

export const v3ToV4CourseDocumentMigration = defineCourseDocumentMigration({
  from: 3,
  to: 4,
  description: "Migrate exact course theme references and canonical node identity.",
  migrate(document) {
    const courseDocument = findCourseDocument(document);
    if (!courseDocument) throw new Error("the courseDocument node is missing");

    const attrs = asRecord(courseDocument.node.attrs);
    if (!attrs) throw new Error("the courseDocument attrs are missing");

    const legacy = V3CourseDocumentAttrsSchema.safeParse(attrs);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      const path = issue?.path.length ? `.${issue.path.join(".")}` : "";
      throw new Error(`courseDocument.attrs${path} does not match the v3 courseDocument format`);
    }

    const { theme: _theme, ...attrsWithoutTheme } = legacy.data;
    migrateContentTreeIdentity(document);
    const migratedCourseDocumentAttrs = asRecord(courseDocument.node.attrs);
    const migrated = CourseDocumentAttrsSchema.safeParse({
      ...attrsWithoutTheme,
      id: migratedCourseDocumentAttrs?.["id"],
      schemaVersion: 4,
      theme: createDefaultPersistedCourseTheme(),
    });
    if (!migrated.success) {
      throw new Error("courseDocument.attrs do not match the v4 courseDocument format");
    }

    courseDocument.node.attrs = migrated.data;
    return document;
  },
});
