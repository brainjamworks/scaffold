import { isEmbeddedId } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { CourseDocumentAttrsSchema } from "@/schemas/course-document";
import { toPortableCourseDocumentAttrs } from "@/document/model/course-document-attrs";

import { cloneBoundedJson, inspectBoundedJson } from "./document-bounds";
import type { CanonicalizeAuthoringDocumentInput } from "./document-capability-lookups";
import type {
  AuthoringDocumentCanonicalizationResult,
  DocumentEstablishmentIssue,
  UnavailableCapabilityKind,
} from "./document-establishment";
import { establishDocumentFormat } from "./document-format";
import { establishAuthoringDocument } from "./establish-authoring-document";

const COMPATIBILITY_KINDS: Readonly<Record<string, UnavailableCapabilityKind>> = Object.freeze({
  unavailable_block: "block",
  unavailable_layout: "layout",
  unavailable_surface: "surface",
});

interface MutableNode extends Record<string, unknown> {
  type: string;
  attrs?: Record<string, unknown>;
  content?: MutableNode[];
}

export function canonicalizeAuthoringDocument({
  workingDocument,
  capabilities,
  authoringSchema,
  expectedRequiresScaffoldPlus,
  productAccess,
}: CanonicalizeAuthoringDocumentInput): AuthoringDocumentCanonicalizationResult {
  const inspection = inspectBoundedJson(workingDocument);
  if (!inspection.ok) return { status: "invalid", issues: [inspection.issue] };

  const canonicalDocument = inspection.ownedValue as MutableNode;
  const stack: Array<{
    node: MutableNode;
    parent: MutableNode | null;
    index: number;
    path: readonly (string | number)[];
  }> = [{ node: canonicalDocument, parent: null, index: 0, path: [] }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!isNode(current.node)) {
      return invalid(
        "invalid_document_node",
        "Working content contains a malformed node.",
        current.path,
      );
    }

    const kind = compatibilityKind(current.node.type);
    if (kind) {
      const reversed = reverseCompatibilityItem(current.node, kind, current.path);
      if (!reversed.ok) return { status: "invalid", issues: [reversed.issue] };
      if (current.parent?.content) current.parent.content[current.index] = reversed.original;
      else {
        for (const key of Object.keys(canonicalDocument)) delete canonicalDocument[key];
        Object.assign(canonicalDocument, reversed.original);
      }
      continue;
    }

    if (current.node.content === undefined) continue;
    if (!Array.isArray(current.node.content)) {
      return invalid("invalid_document_node", "Node content must be an array.", [
        ...current.path,
        "content",
      ]);
    }
    for (let index = current.node.content.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: current.node.content[index]!,
        parent: current.node,
        index,
        path: [...current.path, "content", index],
      });
    }
  }

  const formatResult = establishDocumentFormat(canonicalDocument);
  if (formatResult.status === "invalid" || formatResult.status === "unsupported-core-format") {
    return formatResult;
  }
  const canonicalCurrentDocument = formatResult.canonicalDocument as JSONContent;
  const courseNode = canonicalCurrentDocument.content?.[0];
  const portableCourseAttrs = toPortableCourseDocumentAttrs(courseNode?.attrs);
  if (courseNode && isRecord(portableCourseAttrs)) courseNode.attrs = portableCourseAttrs;
  const courseAttrs = CourseDocumentAttrsSchema.safeParse(portableCourseAttrs);
  if (!courseAttrs.success) {
    return invalid(
      "invalid_course_document_attrs",
      "Scaffold content has invalid courseDocument attrs.",
      ["content", 0, "attrs"],
    );
  }
  if (courseAttrs.data.requiresScaffoldPlus !== expectedRequiresScaffoldPlus) {
    return invalid(
      "scaffold_plus_requirement_changed",
      "Ordinary editing cannot change whether a document requires Scaffold Plus.",
      ["content", 0, "attrs", "requiresScaffoldPlus"],
    );
  }

  const established = establishAuthoringDocument({
    canonicalDocument: canonicalCurrentDocument,
    capabilities,
    authoringSchema,
    productAccess,
  });
  if (established.status === "invalid") return established;
  if (
    established.status === "unsupported-core-format" ||
    established.status === "requires-scaffold-plus"
  ) {
    return established;
  }

  return {
    status: "ready",
    canonicalDocument: cloneBoundedJson(canonicalCurrentDocument) as JSONContent,
    unavailableContent: established.unavailableContent,
  };
}

function reverseCompatibilityItem(
  node: MutableNode,
  kind: UnavailableCapabilityKind,
  path: readonly (string | number)[],
):
  | { readonly ok: true; readonly original: MutableNode }
  | { readonly ok: false; readonly issue: DocumentEstablishmentIssue } {
  if (
    !hasExactKeys(node, ["type", "attrs"]) ||
    !isRecord(node.attrs) ||
    !hasExactKeys(node.attrs, ["id", "capabilityId", "original"])
  ) {
    return mismatch("Compatibility item shape is malformed.", path);
  }
  const id = node.attrs?.["id"];
  const capabilityId = node.attrs?.["capabilityId"];
  const original = node.attrs?.["original"];
  if (!isEmbeddedId(id) || typeof capabilityId !== "string" || capabilityId.trim().length === 0) {
    return mismatch("Compatibility metadata is malformed.", path);
  }
  if (!isNode(original))
    return mismatch("Compatibility original is not a JSON node.", [...path, "attrs", "original"]);

  const originalId = original.attrs?.["id"];
  const originalCapabilityId = kind === "block" ? original.type : original.attrs?.["variant"];
  const expectedType = kind === "block" ? capabilityId : kind;
  if (
    !isEmbeddedId(originalId) ||
    originalId !== id ||
    originalCapabilityId !== capabilityId ||
    original.type !== expectedType ||
    (kind === "block" && (original.type === "layout" || original.type === "surface")) ||
    compatibilityKind(original.type) !== undefined
  ) {
    return mismatch("Compatibility metadata does not match its owned original root.", path);
  }

  return { ok: true, original: cloneBoundedJson(original) };
}

function mismatch(
  message: string,
  path: readonly (string | number)[],
): { readonly ok: false; readonly issue: DocumentEstablishmentIssue } {
  return { ok: false, issue: { code: "invalid_compatibility_item", message, path } };
}

function invalid(
  code: string,
  message: string,
  path: readonly (string | number)[],
): AuthoringDocumentCanonicalizationResult {
  return { status: "invalid", issues: [{ code, message, path }] };
}

function isNode(value: unknown): value is MutableNode {
  return (
    value !== null && typeof value === "object" && typeof (value as MutableNode).type === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function compatibilityKind(type: string): UnavailableCapabilityKind | undefined {
  return Object.hasOwn(COMPATIBILITY_KINDS, type) ? COMPATIBILITY_KINDS[type] : undefined;
}
