import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

export interface SettingsContextTarget {
  nodeType: string;
  pos: number;
}

export interface ManagedSettingsField {
  name: string;
  reason: string;
  hint?: string;
}

export interface SettingsContext {
  managedFields: ReadonlyMap<string, ManagedSettingsField>;
}

export function resolveSettingsContext({
  blockDefinitions,
  editor,
  target,
}: {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  target: SettingsContextTarget | null | undefined;
}): SettingsContext {
  if (!target || !isValidEditorDocPos(editor, target.pos)) {
    return emptySettingsContext();
  }

  const targetNode = editor.state.doc.nodeAt(target.pos);
  if (!targetNode || targetNode.type.name !== target.nodeType) {
    return emptySettingsContext();
  }

  const managedFields = new Map<string, ManagedSettingsField>();
  for (const parent of findParentNodes(editor, target.pos)) {
    const definition = blockDefinitions.getByNodeType(parent.node.type.name);
    for (const policy of definition?.childSettings?.managedFields ?? []) {
      if (!nodeBelongsToGroup(targetNode, policy.childGroup)) continue;
      for (const name of policy.names) {
        managedFields.set(name, {
          name,
          reason: policy.reason,
          ...(policy.hints?.[name] ? { hint: policy.hints[name] } : {}),
        });
      }
    }
  }

  return { managedFields };
}

function emptySettingsContext(): SettingsContext {
  return { managedFields: new Map() };
}

function findParentNodes(
  editor: Editor,
  targetPos: number,
): Array<{ node: ProseMirrorNode; pos: number }> {
  const parents: Array<{ node: ProseMirrorNode; pos: number }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (pos === targetPos) return false;
    const start = pos;
    const end = pos + node.nodeSize;
    if (targetPos > start && targetPos < end) {
      parents.unshift({ node, pos });
      return true;
    }
    return true;
  });

  return parents;
}

function nodeBelongsToGroup(node: ProseMirrorNode, group: string): boolean {
  return (node.type.spec.group ?? "").split(/\s+/).includes(group);
}
