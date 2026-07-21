import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import type { SectionRuntimeViewProps } from "./layout-view-definition";

export function resolveSectionIndex(props: SectionRuntimeViewProps): number {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return 0;
    const $pos = props.editor.state.doc.resolve(pos);
    return $pos.index();
  } catch {
    return 0;
  }
}

export function resolveSectionPosition(props: SectionRuntimeViewProps): {
  index: number;
  isLast: boolean;
} {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return { index: 0, isLast: false };
    const $pos = props.editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    let sectionCount = 0;
    parent.forEach((child) => {
      if (child.type.name === "section") sectionCount += 1;
    });
    return { index, isLast: index === sectionCount - 1 };
  } catch {
    return { index: 0, isLast: false };
  }
}

export function parseOptions(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function readRequiredNodeId(value: unknown, nodeType: "layout" | "section"): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`${nodeType} node is missing a stable id.`);
}
