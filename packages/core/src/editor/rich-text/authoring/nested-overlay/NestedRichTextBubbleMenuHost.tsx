import {
  RichTextBubbleMenu,
  type RichTextBubbleMenuProps,
} from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";

export interface NestedRichTextBubbleMenuHostProps {
  editor: RichTextBubbleMenuProps["editor"] | null | undefined;
  pluginKey: string | null | undefined;
  appendTo?: RichTextBubbleMenuProps["appendTo"];
}

export function NestedRichTextBubbleMenuHost({
  appendTo,
  editor,
  pluginKey,
}: NestedRichTextBubbleMenuHostProps) {
  if (!pluginKey || !isUsableEditor(editor)) return null;

  return (
    <RichTextBubbleMenu editor={editor} pluginKey={pluginKey} {...(appendTo ? { appendTo } : {})} />
  );
}

function isUsableEditor(
  editor: RichTextBubbleMenuProps["editor"] | null | undefined,
): editor is RichTextBubbleMenuProps["editor"] {
  if (!editor || editor.isDestroyed || !editor.schema) return false;

  try {
    return Boolean(editor.view?.dom);
  } catch {
    return false;
  }
}
