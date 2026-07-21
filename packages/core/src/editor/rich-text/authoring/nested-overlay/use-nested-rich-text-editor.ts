import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor, Extensions } from "@tiptap/core";

import {
  createNestedRichTextEditor,
  type CreateNestedRichTextEditorOptions,
  type NestedRichTextEditorController,
  type NestedRichTextEditorSyncTarget,
  type NestedRichTextEditorTarget,
} from "@/editor/prosemirror/nested-rich-text-editor";

export interface UseNestedRichTextEditorOptions {
  outerEditor: Editor;
  target: NestedRichTextEditorTarget | null | undefined;
  extensions: Extensions;
  open?: boolean | undefined;
  editable?: boolean | undefined;
  onMappingFailure?: CreateNestedRichTextEditorOptions["onMappingFailure"] | undefined;
}

export interface UseNestedRichTextEditorResult {
  editor: Editor | null;
  appendBubbleMenuTo: () => HTMLElement;
  syncFromTarget: (target: NestedRichTextEditorSyncTarget) => void;
}

interface NestedRichTextEditorControllerSlot {
  controller: NestedRichTextEditorController;
  editable: boolean | undefined;
  extensions: Extensions;
  open: true;
  outerEditor: Editor;
  target: NestedRichTextEditorTarget;
}

export function useNestedRichTextEditor({
  editable,
  extensions,
  onMappingFailure,
  open = true,
  outerEditor,
  target,
}: UseNestedRichTextEditorOptions): UseNestedRichTextEditorResult {
  const [controllerSlot, setControllerSlot] = useState<NestedRichTextEditorControllerSlot | null>(
    null,
  );

  const onMappingFailureRef = useRef(onMappingFailure);

  useEffect(() => {
    onMappingFailureRef.current = onMappingFailure;
  }, [onMappingFailure]);

  const exposedSlot = controllerSlotMatches(controllerSlot, {
    editable,
    extensions,
    open,
    outerEditor,
    target,
  })
    ? controllerSlot
    : null;
  const editor = exposedSlot?.controller.editor ?? null;

  const appendBubbleMenuTo = useCallback(() => {
    const editorDom = safeEditorDom(editor);
    return editorDom?.parentElement ?? editorDom ?? document.body;
  }, [editor]);

  const syncFromTarget = useCallback(
    (syncTarget: NestedRichTextEditorSyncTarget) => {
      const controller = exposedSlot?.controller;
      if (!controller || controller.editor.isDestroyed) return;
      controller.syncFromTarget(syncTarget);
    },
    [exposedSlot],
  );

  useEffect(() => {
    if (!open || !target) return;

    const controller = createNestedRichTextEditor({
      extensions,
      outerEditor,
      target,
      onMappingFailure: (result) => {
        onMappingFailureRef.current?.(result);
      },
      ...(editable !== undefined ? { editable } : {}),
    });
    const nextSlot: NestedRichTextEditorControllerSlot = {
      controller,
      editable,
      extensions,
      open: true,
      outerEditor,
      target,
    };

    setControllerSlot(nextSlot);

    return () => {
      controller.destroy();
      setControllerSlot((currentSlot) => (currentSlot === nextSlot ? null : currentSlot));
    };
  }, [editable, extensions, open, outerEditor, target]);

  return {
    editor,
    appendBubbleMenuTo,
    syncFromTarget,
  };
}

function controllerSlotMatches(
  slot: NestedRichTextEditorControllerSlot | null,
  inputs: {
    editable: boolean | undefined;
    extensions: Extensions;
    open: boolean;
    outerEditor: Editor;
    target: NestedRichTextEditorTarget | null | undefined;
  },
): slot is NestedRichTextEditorControllerSlot {
  return (
    slot !== null &&
    !slot.controller.editor.isDestroyed &&
    inputs.open &&
    inputs.target !== null &&
    inputs.target !== undefined &&
    slot.open === true &&
    slot.target === inputs.target &&
    slot.extensions === inputs.extensions &&
    slot.outerEditor === inputs.outerEditor &&
    slot.editable === inputs.editable
  );
}

function safeEditorDom(editor: Editor | null): HTMLElement | null {
  if (!editor || editor.isDestroyed) return null;
  try {
    return editor.view.dom;
  } catch {
    return null;
  }
}
