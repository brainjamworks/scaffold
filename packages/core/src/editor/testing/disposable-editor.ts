import { Editor, type JSONContent } from "@tiptap/core";

type EditorOptions = ConstructorParameters<typeof Editor>[0];

export interface DisposableEditorFixture {
  editor: Editor;
  destroy: () => void;
  json: () => JSONContent;
  topLevelNodeTypes: () => string[];
}

export interface EditorDisposalPool {
  track: <T extends Editor>(editor: T) => T;
  destroyAll: () => void;
}

export function createEditorDisposalPool(): EditorDisposalPool {
  const editors = new Set<Editor>();

  return {
    track: <T extends Editor>(editor: T): T => {
      editors.add(editor);
      return editor;
    },
    destroyAll: () => {
      for (const editor of editors) {
        if (!editor.isDestroyed) editor.destroy();
      }
      editors.clear();
    },
  };
}

export function createDisposableEditor(options: EditorOptions): DisposableEditorFixture {
  const editor = new Editor(options);
  let destroyed = false;

  return {
    editor,
    destroy: () => {
      if (destroyed) return;
      editor.destroy();
      destroyed = true;
    },
    json: () => editor.getJSON(),
    topLevelNodeTypes: () =>
      ((editor.getJSON().content ?? []) as JSONContent[]).map((node) => node.type ?? ""),
  };
}
