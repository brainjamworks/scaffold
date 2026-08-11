import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useId } from "react";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

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
        attrs: { id: createEmbeddedNodeId() },
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
            className="sc-app-glossary-add"
          >
            Add term
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
  const deleteExplanationId = useId();

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
    <NodeViewWrapper as="div" data-node="glossary-entry" className="sc-course-glossary__entry">
      <NodeViewContent as="div" />
      {editable ? (
        <button
          type="button"
          contentEditable={false}
          aria-disabled={!canDelete || undefined}
          aria-describedby={!canDelete ? deleteExplanationId : undefined}
          aria-label={`Delete term ${index}`}
          onClick={deleteEntry}
          className="sc-app-glossary-delete sc-course-glossary__delete"
        >
          <Trash size={14} aria-hidden />
          {!canDelete ? (
            <span id={deleteExplanationId} className="sc-app-glossary-delete__explanation">
              A glossary must contain at least one term.
            </span>
          ) : null}
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
      <NodeViewWrapper
        as="dt"
        data-slot="glossary-term"
        aria-hidden
        className="sc-course-glossary__suppressed"
      >
        <NodeViewContent as="div" />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="dt" data-slot="glossary-term" className="sc-course-glossary__term">
      <NodeViewContent as="div" />
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
        as="dd"
        data-slot="glossary-definition"
        aria-hidden
        className="sc-course-glossary__suppressed"
      >
        <NodeViewContent as="div" />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="dd"
      data-slot="glossary-definition"
      className="sc-course-glossary__definition"
    >
      <NodeViewContent as="div" />
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
