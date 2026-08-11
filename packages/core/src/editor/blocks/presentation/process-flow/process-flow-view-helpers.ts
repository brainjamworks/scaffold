import type { ProcessFlowData } from "@scaffold/contracts";
import type { NodeViewProps } from "@tiptap/react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { PROCESS_FLOW_NODE } from "./content";
import { parseProcessFlowData } from "./ProcessFlowModel";

export function readProcessFlowNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

export function readRequiredProcessFlowStepId(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error("Process flow step node is missing a stable id.");
}

export function readProcessFlowStepPosition(props: NodeViewProps): {
  count: number;
  index: number;
} {
  const pos = readProcessFlowNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return { count: 1, index: 1 };
  const $pos = props.editor.state.doc.resolve(pos);
  return {
    count: Math.max($pos.parent.childCount, 1),
    index: $pos.index() + 1,
  };
}

export function resolveProcessFlowData(props: NodeViewProps): ProcessFlowData {
  const pos = readProcessFlowNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return parseProcessFlowData(undefined);

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name === PROCESS_FLOW_NODE) {
      return parseProcessFlowData(parent.attrs["data"]);
    }
  }

  return parseProcessFlowData(undefined);
}
