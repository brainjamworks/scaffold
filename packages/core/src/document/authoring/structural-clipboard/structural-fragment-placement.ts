import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";

import type { SurfaceDestination } from "@/document/model/course-structure/types";
import type { InsertActionRange } from "@/editor/insertion/insert-action";
import { allowsBoundedContainerRootInsertionAtPosition } from "@/editor/bounded-containers/model/bounded-container-placement";
import { resolveBoundedContainerOccupancyPolicy } from "@/editor/content-layout/model/content-layout-bounded-placement";
import { isNodeSelection, isTextSelection } from "@/editor/selection/selection-facts";
import { allowsSurfaceRootInsertionAtPosition } from "@/editor/surfaces/model/policies/surface-root-insertion-policy";

import type {
  StructuralFragmentCapabilityRegistries,
  ValidatedStructuralFragment,
} from "./structural-fragment-validation";

export type StructuralFragmentPlacementDestination =
  | { readonly kind: "selection"; readonly selection: Selection }
  | { readonly kind: "text-caret"; readonly selection: Selection }
  | { readonly kind: "surface"; readonly afterSurfaceId: string };

export type StructuralFragmentPlacement =
  | { readonly kind: "range"; readonly range: InsertActionRange }
  | { readonly kind: "surface"; readonly destination: SurfaceDestination };

export type StructuralFragmentPlacementRefusalReason =
  | "destination_kind_mismatch"
  | "source_schema_mismatch"
  | "invalid_destination_selection"
  | "stale_destination_selection"
  | "invalid_destination_identity"
  | "unavailable_destination"
  | "surface_root_insertion_refused"
  | "bounded_container_insertion_refused"
  | "schema_insertion_refused"
  | "incompatible_surface_mode"
  | "incompatible_surface_variant"
  | "invalid_surface_destination";

export type StructuralFragmentPlacementResult =
  | { readonly status: "ok"; readonly placement: StructuralFragmentPlacement }
  | { readonly status: "refused"; readonly reason: StructuralFragmentPlacementRefusalReason };

export function resolveStructuralFragmentPlacement(input: {
  readonly fragment: ValidatedStructuralFragment;
  readonly doc: ProseMirrorNode;
  readonly destination: StructuralFragmentPlacementDestination;
  readonly capabilities: StructuralFragmentCapabilityRegistries;
}): StructuralFragmentPlacementResult {
  if (input.fragment.node.type.schema !== input.doc.type.schema) {
    return refused("source_schema_mismatch");
  }

  return input.fragment.rootKind === "surface"
    ? resolveSurfacePlacement(input)
    : resolveAdjacentPlacement(input);
}

function resolveAdjacentPlacement(input: {
  readonly fragment: ValidatedStructuralFragment;
  readonly doc: ProseMirrorNode;
  readonly destination: StructuralFragmentPlacementDestination;
  readonly capabilities: StructuralFragmentCapabilityRegistries;
}): StructuralFragmentPlacementResult {
  if (input.destination.kind !== "selection" && input.destination.kind !== "text-caret") {
    return refused("destination_kind_mismatch");
  }

  const { selection } = input.destination;
  if (selection.$from.doc !== input.doc) return refused("stale_destination_selection");
  let checkedRange: CheckedStructuralRange;
  if (input.destination.kind === "selection") {
    if (!isNodeSelection(selection)) return refused("invalid_destination_selection");
    if (!EmbeddedNodeIdSchema.safeParse(selection.node.attrs["id"]).success) {
      return refused("invalid_destination_identity");
    }

    const mountedBlock = input.capabilities.blocks.getByNodeType(selection.node.type.name);
    const mountedLayout = input.capabilities.layouts.getForNode(selection.node);
    if (!mountedBlock && !mountedLayout) return refused("unavailable_destination");
    const insertPos = selection.to;
    const $insert = input.doc.resolve(insertPos);
    const parentDepth =
      $insert.parent.isTextblock && $insert.depth > 0 ? $insert.depth - 1 : $insert.depth;
    checkedRange = {
      from: insertPos,
      index: $insert.index(parentDepth),
      parent: $insert.node(parentDepth),
      parentPos: parentDepth > 0 ? $insert.before(parentDepth) : 0,
      to: insertPos,
    };
  } else {
    const textCaretRange = resolveTextCaretRange(selection, input.fragment.node);
    if (!textCaretRange) return refused("invalid_destination_selection");
    checkedRange = textCaretRange;
  }

  if (
    !Number.isInteger(checkedRange.from) ||
    !Number.isInteger(checkedRange.to) ||
    checkedRange.from < 0 ||
    checkedRange.to < checkedRange.from ||
    checkedRange.to > input.doc.content.size
  ) {
    return refused("invalid_destination_selection");
  }
  if (
    !allowsSurfaceRootInsertionAtPosition(input.doc, checkedRange.from, input.capabilities.surfaces)
  ) {
    return refused("surface_root_insertion_refused");
  }

  try {
    if (
      !checkedRange.parent.contentMatchAt(checkedRange.index).matchType(input.fragment.node.type)
    ) {
      return refused("schema_insertion_refused");
    }
  } catch {
    return refused("invalid_destination_selection");
  }

  if (
    !allowsBoundedContainerRootInsertionAtPosition({
      blockDefinitions: input.capabilities.blocks,
      doc: input.doc,
      layoutDefinitions: input.capabilities.layouts,
      pos: checkedRange.parentPos,
      resolveBoundedContainerOccupancyPolicy,
    })
  ) {
    return refused("bounded_container_insertion_refused");
  }

  return {
    status: "ok",
    placement: {
      kind: "range",
      range: { from: checkedRange.from, to: checkedRange.to },
    },
  };
}

interface CheckedStructuralRange extends InsertActionRange {
  readonly index: number;
  readonly parent: ProseMirrorNode;
  readonly parentPos: number;
}

function resolveTextCaretRange(
  selection: Selection,
  fragment: ProseMirrorNode,
): CheckedStructuralRange | null {
  if (
    !isTextSelection(selection) ||
    !selection.empty ||
    selection.$from.parent.type.name !== "paragraph"
  ) {
    return null;
  }

  const { $from } = selection;
  for (let depth = $from.depth - 1; depth >= 0; depth -= 1) {
    const parent = $from.node(depth);
    const directChildDepth = depth + 1;
    const replaceEmptyTextblock =
      directChildDepth === $from.depth && $from.parent.content.size === 0;
    const index = replaceEmptyTextblock ? $from.index(depth) : $from.indexAfter(depth);
    const replaceTo = replaceEmptyTextblock ? index + 1 : index;
    if (!parent.canReplaceWith(index, replaceTo, fragment.type)) continue;

    const from = replaceEmptyTextblock ? $from.before($from.depth) : $from.after(directChildDepth);
    return {
      from,
      index,
      parent,
      parentPos: depth > 0 ? $from.before(depth) : 0,
      to: replaceEmptyTextblock ? $from.after($from.depth) : from,
    };
  }

  return null;
}

function resolveSurfacePlacement(input: {
  readonly fragment: ValidatedStructuralFragment;
  readonly doc: ProseMirrorNode;
  readonly destination: StructuralFragmentPlacementDestination;
  readonly capabilities: StructuralFragmentCapabilityRegistries;
}): StructuralFragmentPlacementResult {
  if (input.destination.kind !== "surface") return refused("destination_kind_mismatch");

  const courseDocument = input.doc.firstChild;
  if (
    !courseDocument ||
    courseDocument.type.name !== "courseDocument" ||
    courseDocument.attrs["mode"] !== "slideshow"
  ) {
    return refused("incompatible_surface_mode");
  }

  const sourceVariant = input.fragment.node.attrs["variant"];
  const sourceDefinition =
    typeof sourceVariant === "string" ? input.capabilities.surfaces.get(sourceVariant) : undefined;
  if (!sourceDefinition?.modes.includes("slideshow")) {
    return refused("incompatible_surface_variant");
  }

  const afterSurfaceId = EmbeddedNodeIdSchema.safeParse(input.destination.afterSurfaceId);
  if (!afterSurfaceId.success) return refused("invalid_surface_destination");

  const destinationSurface = findDirectSurface(courseDocument, afterSurfaceId.data);
  if (!destinationSurface) return refused("invalid_surface_destination");
  const destinationVariant = destinationSurface.attrs["variant"];
  const destinationDefinition =
    typeof destinationVariant === "string"
      ? input.capabilities.surfaces.get(destinationVariant)
      : undefined;
  if (!destinationDefinition) return refused("unavailable_destination");
  if (!destinationDefinition.modes.includes("slideshow")) {
    return refused("incompatible_surface_variant");
  }

  return {
    status: "ok",
    placement: {
      kind: "surface",
      destination: { afterSurfaceId: afterSurfaceId.data },
    },
  };
}

function findDirectSurface(courseDocument: ProseMirrorNode, id: string): ProseMirrorNode | null {
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    if (child.type.name === "surface" && child.attrs["id"] === id) return child;
  }
  return null;
}

function refused(
  reason: StructuralFragmentPlacementRefusalReason,
): StructuralFragmentPlacementResult {
  return { status: "refused", reason };
}
