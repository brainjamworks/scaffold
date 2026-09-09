import { isEmbeddedId } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { getBlockAttrSchema } from "@/editor/blocks/block-definition";
import { projectCourseStructure } from "@/document/model/course-structure";
import {
  layerContextDiagnosticPath,
  layerNodePathToJsonPath,
  validateLayerContext,
  validateLayerIdentities,
  type LayerContextDiagnostic,
  type LayerIdentityDiagnostic,
  type LayerNodePath,
} from "@/document/model/layers/layer-validation";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";

import { cloneBoundedJson, inspectBoundedJson } from "./document-bounds";
import type { EstablishAuthoringDocumentInput } from "./document-capability-lookups";
import type {
  AuthoringDocumentEstablishmentResult,
  DocumentEstablishmentIssue,
  UnavailableCapabilityKind,
  UnavailableContentRef,
} from "./document-establishment";
import { establishDocumentFormat } from "./document-format";
import {
  assertMountedNodeIdentitySchema,
  assertParsedMountedNodeIdentity,
} from "./mounted-node-identity";

const COMPATIBILITY_KINDS = Object.freeze({
  unavailable_block: "block",
  unavailable_layout: "layout",
  unavailable_surface: "surface",
} as const);

interface MutableNode extends Record<string, unknown> {
  type: string;
  attrs?: Record<string, unknown>;
  content?: MutableNode[];
}

interface ClassifiedUnavailable {
  readonly replacement: MutableNode;
  readonly reference: UnavailableContentRef;
}

export function establishAuthoringDocument({
  canonicalDocument,
  capabilities,
  authoringSchema,
  productAccess,
}: EstablishAuthoringDocumentInput): AuthoringDocumentEstablishmentResult {
  const inspection = inspectBoundedJson(canonicalDocument);
  if (!inspection.ok) return { status: "invalid", issues: [inspection.issue] };

  const formatResult = establishDocumentFormat(inspection.ownedValue);
  if (formatResult.status === "invalid" || formatResult.status === "unsupported-core-format") {
    return formatResult;
  }

  const migratedInspection = inspectBoundedJson(formatResult.canonicalDocument);
  if (!migratedInspection.ok) return { status: "invalid", issues: [migratedInspection.issue] };

  const migratedCanonicalDocument = migratedInspection.ownedValue as JSONContent;
  const courseAttrs = CourseDocumentAttrsSchema.safeParse(
    migratedCanonicalDocument.content?.[0]?.attrs,
  );
  if (!courseAttrs.success) {
    return {
      status: "invalid",
      issues: [
        issue(
          "invalid_course_document_attrs",
          "Scaffold content has invalid courseDocument attrs.",
          ["content", 0, "attrs"],
        ),
      ],
    };
  }
  if (courseAttrs.data.requiresScaffoldPlus && !productAccess.scaffoldPlusAuthorized) {
    return { status: "requires-scaffold-plus" };
  }

  assertMountedNodeIdentitySchema(authoringSchema);

  if (!projectCourseStructure(migratedCanonicalDocument)) {
    return {
      status: "invalid",
      issues: [
        issue("invalid_course_structure", "Scaffold content has invalid Course Structure.", [
          "content",
          0,
          "content",
        ]),
      ],
    };
  }

  const workingDocument = migratedInspection.ownedValue as MutableNode;
  const unavailableContent: UnavailableContentRef[] = [];
  const issues: DocumentEstablishmentIssue[] = [];
  const stack: Array<{
    node: MutableNode;
    parent: MutableNode | null;
    index: number;
    path: readonly (string | number)[];
  }> = [{ node: workingDocument, parent: null, index: 0, path: [] }];

  while (stack.length > 0 && issues.length === 0) {
    const current = stack.pop()!;
    const { node, path } = current;
    if (!isNode(node)) {
      issues.push(
        issue("invalid_document_node", "Document content contains a malformed node.", path),
      );
      break;
    }

    if (Object.hasOwn(COMPATIBILITY_KINDS, node.type)) {
      issues.push(
        issue(
          "canonical_compatibility_node",
          "Canonical content must not contain authoring compatibility nodes.",
          path,
        ),
      );
      break;
    }

    const blockDefinition = capabilities.blocks.getByNodeType(node.type);
    if (blockDefinition) {
      assertCapabilityNodeMounted(
        authoringSchema.nodes[node.type] !== undefined,
        "Block",
        node.type,
      );
      const semanticIssue = validateBlockAttrs(node, blockDefinition, path);
      if (semanticIssue) issues.push(semanticIssue);
      else pushChildren(stack, node, path);
      continue;
    }

    if (node.type === "layout" || node.type === "surface") {
      const kind = node.type;
      const envelope = readCapabilityEnvelope(node, kind, path);
      if (!envelope.ok) {
        issues.push(envelope.issue);
        continue;
      }
      const definition =
        kind === "layout"
          ? capabilities.layouts.getById(envelope.capabilityId)
          : capabilities.surfaces.get(envelope.capabilityId);
      if (!definition) {
        const classified = classifyUnavailable(node, kind, envelope, path);
        replaceNode(current.parent, current.index, workingDocument, classified.replacement);
        if (current.parent === null) Object.assign(workingDocument, classified.replacement);
        unavailableContent.push(classified.reference);
        continue;
      }

      assertCapabilityNodeMounted(
        authoringSchema.nodes[kind] !== undefined,
        capitalize(kind),
        envelope.capabilityId,
      );
      const semanticIssue = validateCapabilityAttrs(node, definition, kind, path);
      if (semanticIssue) issues.push(semanticIssue);
      else pushChildren(stack, node, path);
      continue;
    }

    if (authoringSchema.nodes[node.type]) {
      pushChildren(stack, node, path);
      continue;
    }

    const envelope = readCapabilityEnvelope(node, "block", path);
    if (!envelope.ok) {
      issues.push(envelope.issue);
      continue;
    }
    const classified = classifyUnavailable(node, "block", envelope, path);
    replaceNode(current.parent, current.index, workingDocument, classified.replacement);
    if (current.parent === null) Object.assign(workingDocument, classified.replacement);
    unavailableContent.push(classified.reference);
  }

  if (issues.length > 0) return { status: "invalid", issues };

  let parsed: ProseMirrorNode;
  try {
    parsed = authoringSchema.nodeFromJSON(workingDocument);
    parsed.check();
  } catch (error) {
    return {
      status: "invalid",
      issues: [
        issue(
          "invalid_authoring_schema",
          error instanceof Error
            ? error.message
            : "Projected document does not match the authoring schema.",
          [],
        ),
      ],
    };
  }

  const layerIdentityIssues = validateLayerIdentities(parsed).map(layerIdentityIssue);
  if (layerIdentityIssues.length > 0) return { status: "invalid", issues: layerIdentityIssues };

  const identityIssues = assertParsedMountedNodeIdentity(parsed);
  if (identityIssues.length > 0) return { status: "invalid", issues: identityIssues };

  const layerContextIssues = validateLayerContext({
    document: parsed,
    blockDefinitions: capabilities.blocks,
    layoutDefinitions: capabilities.layouts,
  }).map(layerContextIssue);
  if (layerContextIssues.length > 0) return { status: "invalid", issues: layerContextIssues };

  return unavailableContent.length === 0
    ? {
        status: "supported",
        workingDocument: workingDocument as JSONContent,
        format: formatResult.format,
        unavailableContent: [],
        requiresScaffoldPlus: courseAttrs.data.requiresScaffoldPlus,
      }
    : {
        status: "unavailable",
        workingDocument: workingDocument as JSONContent,
        format: formatResult.format,
        unavailableContent,
        requiresScaffoldPlus: courseAttrs.data.requiresScaffoldPlus,
      };
}

function layerIdentityIssue(diagnostic: LayerIdentityDiagnostic): DocumentEstablishmentIssue {
  switch (diagnostic.reason) {
    case "node-id-missing":
      return {
        kind: "layer-identity",
        code: diagnostic.reason,
        message: `${diagnostic.nodeType} at ${formatLayerPath(diagnostic.path)} is missing its stable identity.`,
        path: [...layerNodePathToJsonPath(diagnostic.path), "attrs", "id"],
        diagnostic,
      };
    case "node-id-invalid":
      return {
        kind: "layer-identity",
        code: diagnostic.reason,
        message: `${diagnostic.nodeType} at ${formatLayerPath(diagnostic.path)} has invalid stable identity ${JSON.stringify(diagnostic.actualValue)}.`,
        path: [...layerNodePathToJsonPath(diagnostic.path), "attrs", "id"],
        diagnostic,
      };
    case "node-id-duplicated":
      return {
        kind: "layer-identity",
        code: diagnostic.reason,
        message: `Stable identity "${diagnostic.id}" is shared by ${diagnostic.firstNodeType} at ${formatLayerPath(diagnostic.firstPath)} and ${diagnostic.duplicateNodeType} at ${formatLayerPath(diagnostic.duplicatePath)}.`,
        path: [...layerNodePathToJsonPath(diagnostic.duplicatePath), "attrs", "id"],
        diagnostic,
      };
  }
}

function layerContextIssue(diagnostic: LayerContextDiagnostic): DocumentEstablishmentIssue {
  const path = layerContextDiagnosticPath(diagnostic);
  return {
    kind: "layer-context",
    code: diagnostic.reason,
    message: `Layer structure at ${formatLayerPath(path)} violates ${diagnostic.reason}.`,
    path: layerNodePathToJsonPath(path),
    diagnostic,
  } as DocumentEstablishmentIssue;
}

function formatLayerPath(path: LayerNodePath): string {
  return `[${path.join(", ")}]`;
}

function classifyUnavailable(
  node: MutableNode,
  kind: UnavailableCapabilityKind,
  envelope: { readonly id: string; readonly capabilityId: string },
  path: readonly (string | number)[],
): ClassifiedUnavailable {
  return {
    replacement: {
      type: `unavailable_${kind}`,
      attrs: {
        id: envelope.id,
        capabilityId: envelope.capabilityId,
        original: cloneBoundedJson(node),
      },
    },
    reference: {
      kind,
      capabilityId: envelope.capabilityId,
      stableId: envelope.id,
      path,
    },
  };
}

function readCapabilityEnvelope(
  node: MutableNode,
  kind: UnavailableCapabilityKind,
  path: readonly (string | number)[],
):
  | { readonly ok: true; readonly id: string; readonly capabilityId: string }
  | { readonly ok: false; readonly issue: DocumentEstablishmentIssue } {
  const id = node.attrs?.["id"];
  if (!isEmbeddedId(id)) {
    return {
      ok: false,
      issue: issue(
        id === null || id === undefined ? "missing_embedded_node_id" : "invalid_embedded_node_id",
        `Unavailable ${kind} root requires a valid attrs.id.`,
        [...path, "attrs", "id"],
      ),
    };
  }

  const capabilityId = kind === "block" ? node.type : node.attrs?.["variant"];
  if (typeof capabilityId !== "string" || capabilityId.trim().length === 0) {
    return {
      ok: false,
      issue: issue(
        "invalid_capability_identity",
        `${capitalize(kind)} root requires a non-blank capability identity.`,
        kind === "block" ? [...path, "type"] : [...path, "attrs", "variant"],
      ),
    };
  }

  return { ok: true, id, capabilityId };
}

function validateBlockAttrs(
  node: MutableNode,
  definition: NonNullable<
    ReturnType<EstablishAuthoringDocumentInput["capabilities"]["blocks"]["getByNodeType"]>
  >,
  path: readonly (string | number)[],
): DocumentEstablishmentIssue | null {
  for (const attr of ["data", "settings", "options"] as const) {
    const schema = getBlockAttrSchema(definition, attr);
    if (schema && !schema.safeParse(node.attrs?.[attr]).success) {
      return issue("invalid_capability_attrs", `Block "${node.type}" has invalid ${attr}.`, [
        ...path,
        "attrs",
        attr,
      ]);
    }
  }
  return null;
}

function validateCapabilityAttrs(
  node: MutableNode,
  definition: unknown,
  kind: "layout" | "surface",
  path: readonly (string | number)[],
): DocumentEstablishmentIssue | null {
  const capability = definition as Record<string, unknown>;
  const configuration = capability["configuration"] as
    | { attr: string; schema: { safeParse(value: unknown): { success: boolean } } }
    | undefined;
  if (configuration && !configuration.schema.safeParse(node.attrs?.[configuration.attr]).success) {
    return issue("invalid_capability_attrs", `${capitalize(kind)} has invalid configuration.`, [
      ...path,
      "attrs",
      configuration.attr,
    ]);
  }
  if (kind === "surface") {
    const settingsSchema = capability["settingsSchema"] as
      | { safeParse(value: unknown): { success: boolean } }
      | undefined;
    if (settingsSchema && !settingsSchema.safeParse(node.attrs?.["settings"] ?? {}).success) {
      return issue("invalid_capability_attrs", "Surface has invalid settings.", [
        ...path,
        "attrs",
        "settings",
      ]);
    }
  }
  return null;
}

function pushChildren(
  stack: Array<{
    node: MutableNode;
    parent: MutableNode | null;
    index: number;
    path: readonly (string | number)[];
  }>,
  node: MutableNode,
  path: readonly (string | number)[],
): void {
  if (node.content === undefined) return;
  if (!Array.isArray(node.content)) {
    stack.push({ node: node.content as never, parent: node, index: 0, path: [...path, "content"] });
    return;
  }
  for (let index = node.content.length - 1; index >= 0; index -= 1) {
    stack.push({
      node: node.content[index]!,
      parent: node,
      index,
      path: [...path, "content", index],
    });
  }
}

function replaceNode(
  parent: MutableNode | null,
  index: number,
  root: MutableNode,
  replacement: MutableNode,
): void {
  if (parent?.content) parent.content[index] = replacement;
  else if (parent === null) {
    for (const key of Object.keys(root)) delete root[key];
  }
}

function isNode(value: unknown): value is MutableNode {
  return (
    value !== null && typeof value === "object" && typeof (value as MutableNode).type === "string"
  );
}

function assertCapabilityNodeMounted(mounted: boolean, kind: string, identity: string): void {
  if (!mounted)
    throw new Error(
      `${kind} capability "${identity}" is registered but absent from the authoring schema.`,
    );
}

function issue(
  code: string,
  message: string,
  path: readonly (string | number)[],
): DocumentEstablishmentIssue {
  return { code, message, path };
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
