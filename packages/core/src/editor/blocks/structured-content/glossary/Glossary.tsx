import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createStableId } from "@/document/model/identity/stable-ids";

import { GLOSSARY_ENTRY_NODE, GLOSSARY_NODE, glossaryEntryContent } from "./content";
import { GlossarySurface } from "./GlossarySurface";

/* ──────────────────────────────────────────────────────────────────────────
 * Parent block: stack of glossary entries
 * ────────────────────────────────────────────────────────────────────── */

export function GlossaryView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  const addEntry = () => {
    const pos = readNodePos(props);
    if (!isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== GLOSSARY_NODE) return;

    props.editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        type: GLOSSARY_ENTRY_NODE,
        attrs: { id: createStableId() },
        content: glossaryEntryContent(),
      })
      .run();
  };

  return (
    <GlossarySurface
      trailing={
        editable ? (
          <button
            type="button"
            contentEditable={false}
            onClick={addEntry}
            aria-label="Add term"
            className="sc-glossary__add"
          >
            <span className="sc-glossary__add-term">
              <span aria-hidden className="sc-glossary__add-icon">
                <Plus size={12} weight="bold" />
              </span>
              Add term
            </span>
            <span className="sc-glossary__add-definition">Brief definition</span>
          </button>
        ) : null
      }
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Entry wrapper: holds one term + one definition as siblings
 * ────────────────────────────────────────────────────────────────────── */

export function GlossaryEntryNodeView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const { count, index } = readEntryPosition(props);
  const canDelete = editable && count > 1;

  const deleteEntry = () => {
    const pos = readNodePos(props);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== GLOSSARY_ENTRY_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper data-node="glossary-entry" className="sc-glossary__entry">
      <NodeViewContent />
      {editable ? (
        <button
          type="button"
          contentEditable={false}
          disabled={!canDelete}
          aria-label={`Delete term ${index}`}
          onClick={deleteEntry}
          className="sc-glossary__delete"
        >
          <Trash size={14} aria-hidden />
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Term: dictionary-emphasised single line
 * ────────────────────────────────────────────────────────────────────── */

export function GlossaryTermNodeView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!editable && isEmpty) {
    return (
      <NodeViewWrapper data-slot="glossary-term" aria-hidden className="sc-glossary__suppressed">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-slot="glossary-term" className="sc-glossary__term">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Definition: body type
 * ────────────────────────────────────────────────────────────────────── */

export function GlossaryDefinitionNodeView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!editable && isEmpty) {
    return (
      <NodeViewWrapper
        data-slot="glossary-definition"
        aria-hidden
        className="sc-glossary__suppressed"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-slot="glossary-definition" className="sc-glossary__definition">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────── */

function readNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

function readEntryPosition(props: NodeViewProps): {
  count: number;
  index: number;
} {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return { count: 1, index: 1 };
  const $pos = props.editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  let count = 0;
  let index = 1;
  parent.forEach((child, offset) => {
    if (child.type.name !== GLOSSARY_ENTRY_NODE) return;
    count += 1;
    if (parentStart + offset <= pos) {
      index = count;
    }
  });
  return { count: Math.max(count, 1), index };
}
