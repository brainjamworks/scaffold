import { Editor, Extension, type Extensions, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  ScaffoldRichTextDocumentSchema,
  EmptyScaffoldRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";

import {
  mapInnerTransactionToOuter,
  NESTED_RICH_TEXT_EXTERNAL_SYNC_META,
  type MapInnerTransactionToOuterResult,
} from "./map-inner-transaction-to-outer";

export interface NestedRichTextContentTarget {
  kind: "content";
  node: ProseMirrorNode;
  getPos: () => number | undefined;
}

export interface NestedRichTextAttrTarget {
  kind: "attr";
  read: () => ScaffoldRichTextDocument | null | undefined;
  write: (nextDoc: ScaffoldRichTextDocument) => void;
}

export type NestedRichTextEditorTarget = NestedRichTextContentTarget | NestedRichTextAttrTarget;

export interface NestedRichTextContentSyncTarget {
  kind: "content";
  node: ProseMirrorNode;
}

export interface NestedRichTextAttrSyncTarget {
  kind: "attr";
}

export type NestedRichTextEditorSyncTarget =
  | NestedRichTextContentSyncTarget
  | NestedRichTextAttrSyncTarget;

export interface CreateNestedRichTextEditorOptions {
  outerEditor: Editor;
  target: NestedRichTextEditorTarget;
  extensions: Extensions;
  editable?: boolean;
  onMappingFailure?: (
    result: Extract<MapInnerTransactionToOuterResult, { status: "failed" }>,
  ) => void;
}

export interface NestedRichTextEditorController {
  editor: Editor;
  destroy: () => void;
  syncFromTarget: (target: NestedRichTextEditorSyncTarget) => void;
}

export function createNestedRichTextEditor({
  editable,
  extensions,
  onMappingFailure,
  outerEditor,
  target,
}: CreateNestedRichTextEditorOptions): NestedRichTextEditorController {
  switch (target.kind) {
    case "content":
      return createContentTargetEditor({
        extensions,
        outerEditor,
        target,
        ...(editable !== undefined ? { editable } : {}),
        ...(onMappingFailure ? { onMappingFailure } : {}),
      });
    case "attr":
      return createAttrTargetEditor({
        extensions,
        outerEditor,
        target,
        ...(editable !== undefined ? { editable } : {}),
      });
  }
}

function createContentTargetEditor({
  editable,
  extensions,
  onMappingFailure,
  outerEditor,
  target,
}: CreateNestedRichTextEditorOptions & {
  target: NestedRichTextContentTarget;
}): NestedRichTextEditorController {
  let editor: Editor | null = null;
  let destroyed = false;
  const historyBridgeExtension = createOuterHistoryBridgeExtension(outerEditor);
  const bridgeExtension = Extension.create({
    name: "nestedRichTextContentBridge",
    priority: 1_000,
    dispatchTransaction({ transaction, next }) {
      if (destroyed || !editor || editor.isDestroyed) return;

      const result = mapInnerTransactionToOuter({
        getPos: target.getPos,
        innerTransaction: transaction,
        outerState: outerEditor.state,
      });

      if (result.status === "mapped") {
        outerEditor.view.dispatch(result.transaction);
        next(transaction);
        return;
      }

      if (result.status === "failed") {
        onMappingFailure?.(result);
        return;
      }

      next(transaction);
    },
  });

  editor = new Editor({
    extensions: [historyBridgeExtension, bridgeExtension, ...extensions],
    content: contentDocFromNode(target.node),
    ...(editable !== undefined ? { editable } : {}),
    editorProps: {
      handleKeyDown(_view, event) {
        return routeUndoRedoToOuterEditor(outerEditor, event);
      },
    },
  });
  const controllerEditor = editor;

  return {
    editor: controllerEditor,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editor = null;
      controllerEditor.destroy();
    },
    syncFromTarget(syncTarget) {
      if (destroyed || controllerEditor.isDestroyed || syncTarget.kind !== "content") return;
      syncContentFromNode(controllerEditor, syncTarget.node);
    },
  };
}

function createAttrTargetEditor({
  editable,
  extensions,
  outerEditor,
  target,
}: CreateNestedRichTextEditorOptions & {
  target: NestedRichTextAttrTarget;
}): NestedRichTextEditorController {
  let editor: Editor | null = null;
  let destroyed = false;

  const historyBridgeExtension = createOuterHistoryBridgeExtension(outerEditor);
  const bridgeExtension = Extension.create({
    name: "nestedRichTextAttrBridge",
    priority: 1_000,
    dispatchTransaction({ transaction, next }) {
      if (destroyed || !editor || editor.isDestroyed) return;

      const isExternalSync = transaction.getMeta(NESTED_RICH_TEXT_EXTERNAL_SYNC_META);
      next(transaction);

      if (isExternalSync || !transaction.docChanged) return;

      const currentEditor = editor;
      if (!currentEditor) return;

      const parsed = ScaffoldRichTextDocumentSchema.safeParse(currentEditor.getJSON());
      if (parsed.success) {
        target.write(parsed.data);
      }
    },
  });

  editor = new Editor({
    extensions: [historyBridgeExtension, bridgeExtension, ...extensions],
    content: readAttrDocument(target),
    ...(editable !== undefined ? { editable } : {}),
    editorProps: {
      handleKeyDown(_view, event) {
        return routeUndoRedoToOuterEditor(outerEditor, event);
      },
    },
  });
  const controllerEditor = editor;

  return {
    editor: controllerEditor,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editor = null;
      controllerEditor.destroy();
    },
    syncFromTarget(syncTarget) {
      if (destroyed || controllerEditor.isDestroyed || syncTarget.kind !== "attr") return;
      syncAttrFromTarget(controllerEditor, target);
    },
  };
}

function syncContentFromNode(editor: Editor, node: ProseMirrorNode): void {
  const nextDoc = editor.schema.nodeFromJSON(contentDocFromNode(node));
  if (editor.state.doc.eq(nextDoc)) return;

  const transaction = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
    .setMeta(NESTED_RICH_TEXT_EXTERNAL_SYNC_META, true);
  editor.view.dispatch(transaction);
}

function syncAttrFromTarget(editor: Editor, target: NestedRichTextAttrTarget): void {
  const nextDoc = editor.schema.nodeFromJSON(readAttrDocument(target));
  if (editor.state.doc.eq(nextDoc)) return;

  const transaction = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
    .setMeta(NESTED_RICH_TEXT_EXTERNAL_SYNC_META, true);
  editor.view.dispatch(transaction);
}

function contentDocFromNode(node: ProseMirrorNode): JSONContent {
  return {
    type: "doc",
    content: node.content.toJSON() as JSONContent[],
  };
}

function readAttrDocument(target: NestedRichTextAttrTarget): ScaffoldRichTextDocument {
  return target.read() ?? EmptyScaffoldRichTextDocument;
}

function createOuterHistoryBridgeExtension(outerEditor: Editor): Extension {
  return Extension.create({
    name: "nestedRichTextOuterHistoryBridge",
    priority: 1_000,
    addCommands() {
      return {
        undo:
          () =>
          ({ dispatch }) =>
            runOuterHistoryCommand(outerEditor, "undo", dispatch !== undefined) ?? false,
        redo:
          () =>
          ({ dispatch }) =>
            runOuterHistoryCommand(outerEditor, "redo", dispatch !== undefined) ?? false,
      };
    },
  });
}

function routeUndoRedoToOuterEditor(outerEditor: Editor, event: KeyboardEvent): boolean {
  const shortcut = undoRedoShortcut(event);
  if (!shortcut) return false;

  const handled = runOuterHistoryCommand(outerEditor, shortcut);
  if (handled === null) return false;

  event.preventDefault();
  return handled;
}

function runOuterHistoryCommand(
  outerEditor: Editor,
  command: "undo" | "redo",
  dispatch = true,
): boolean | null {
  const runCommand = dispatch ? outerEditor.commands[command] : outerEditor.can()[command];
  if (typeof runCommand !== "function") return null;
  return runCommand();
}

function undoRedoShortcut(event: KeyboardEvent): "undo" | "redo" | null {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey) return null;

  const key = event.key.toLowerCase();
  if (key === "z" && event.shiftKey) return "redo";
  if (key === "z") return "undo";
  if (key === "y") return "redo";

  return null;
}
