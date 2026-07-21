import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { getLayoutKindFromAttrs } from "@/editor/arrangements/layout/model/layout-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

import { STRUCTURAL_INSERTION_PARENT_TYPES } from "./structural-insertion-parent-types";

export const GENERIC_TEXTBLOCK_PLACEHOLDER = "Type / to insert a block, or just start writing...";
export const HEADING_PLACEHOLDER = "Heading";

export interface EditorPlaceholderContext {
  editor: Editor;
  node: ProseMirrorNode;
  pos: number;
}

export function resolveEditorPlaceholder({ editor, node, pos }: EditorPlaceholderContext): string {
  if (node.type.name === "slide_title") return "Slide title";

  try {
    const $pos = editor.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const parent = $pos.node(depth);
      const parentName = parent.type.name;

      if (parentName === "slide_cover_subtitle") {
        return resolveSlideCoverSubtitlePlaceholder($pos, depth, parent);
      }
      if (parentName === "surface_header_footer_slot") {
        return resolveSurfaceHeaderFooterSlotPlaceholder($pos, depth);
      }
      if (parentName === "surface") {
        const surfacePlaceholder = resolveSurfacePlaceholder(parent, node);
        if (surfacePlaceholder !== undefined) return surfacePlaceholder;
      }

      const context = {
        $pos,
        ancestor: parent,
        depth,
        editor,
        node,
        pos,
      };
      const textblockPlaceholder = resolveOwnerPlaceholder(node.type.name, depth, context);
      if (textblockPlaceholder !== undefined) return textblockPlaceholder;

      const placeholder = resolveOwnerPlaceholder(parentName, depth, context);
      if (placeholder !== undefined) return placeholder;
    }

    if (
      node.type.name === "paragraph" &&
      STRUCTURAL_INSERTION_PARENT_TYPES.has($pos.parent.type.name)
    ) {
      return "";
    }
  } catch {
    /* pos may be invalid mid-transaction; fall through */
  }

  if (node.type.name === "heading") return HEADING_PLACEHOLDER;
  return GENERIC_TEXTBLOCK_PLACEHOLDER;
}

function resolveSurfaceHeaderFooterSlotPlaceholder($pos: ResolvedPos, slotDepth: number): string {
  const owner = slotDepth > 0 ? $pos.node(slotDepth - 1) : null;
  if (owner?.type.name === "surface_footer") return "Footer";
  return "Header";
}

function resolveSurfacePlaceholder(
  surface: ProseMirrorNode,
  node: ProseMirrorNode,
): string | undefined {
  const variant = surface.attrs["variant"];

  if (variant === "slide-cover" && node.type.name === "heading") {
    return "Lesson title";
  }

  if (variant === "slide-module-cover" && node.type.name === "heading") {
    return "Module title";
  }

  return undefined;
}

function resolveSlideCoverSubtitlePlaceholder(
  $pos: ResolvedPos,
  subtitleDepth: number,
  subtitle: ProseMirrorNode,
): string {
  const surface = findAncestorSurface($pos, subtitleDepth);
  if (surface?.attrs["variant"] !== "slide-module-cover") {
    return "Short description";
  }

  const subtitleIndex = findSubtitleIndex(surface, subtitle);
  if (subtitleIndex === 0) return "Module label";
  if (subtitleIndex === 1) return "Module summary";
  if (subtitleIndex === 2) return "Duration, cohort, or date";
  return "Short description";
}

function findAncestorSurface($pos: ResolvedPos, startDepth: number): ProseMirrorNode | null {
  for (let depth = startDepth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "surface") return node;
  }
  return null;
}

function findSubtitleIndex(surface: ProseMirrorNode, subtitle: ProseMirrorNode): number {
  let subtitleIndex = -1;
  let currentIndex = 0;

  surface.forEach((child) => {
    if (child.type.name !== "slide_cover_subtitle") return;
    if (subtitleIndex === -1 && child.eq(subtitle)) {
      subtitleIndex = currentIndex;
    }
    currentIndex += 1;
  });

  return subtitleIndex;
}

function resolveOwnerPlaceholder(
  placeholderNodeType: string,
  placeholderDepth: number,
  context: EditorPlaceholderContext & {
    $pos: ResolvedPos;
    ancestor: ProseMirrorNode;
    depth: number;
  },
): string | undefined {
  for (let ownerDepth = placeholderDepth; ownerDepth >= 0; ownerDepth -= 1) {
    const owner = context.$pos.node(ownerDepth);
    const placeholders = builtInBlockRegistry.getByNodeType(owner.type.name)?.placeholders;
    const value = placeholders?.[placeholderNodeType];
    const blockPlaceholder = typeof value === "function" ? value(context) : value;
    if (blockPlaceholder !== undefined) return blockPlaceholder;

    if (owner.type.name === "layout") {
      const layoutKind = getLayoutKindFromAttrs(owner.attrs);
      const layoutPlaceholder = layoutKind
        ? builtInLayoutRegistry.resolvePlaceholder(layoutKind, placeholderNodeType, context)
        : undefined;
      if (layoutPlaceholder !== undefined) return layoutPlaceholder;
    }
  }

  return undefined;
}
