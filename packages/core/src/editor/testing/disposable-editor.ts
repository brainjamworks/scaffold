import { Editor, type JSONContent } from "@tiptap/core";

type EditorOptions = ConstructorParameters<typeof Editor>[0];

export interface DisposableEditorFixture {
  editor: Editor;
  destroy: () => void;
  json: () => JSONContent;
  topLevelNodeTypes: () => string[];
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
