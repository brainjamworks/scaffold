import type { Editor } from "@tiptap/react";

export type RichTextInlineCommandId =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "subscript"
  | "superscript";

export interface RichTextInlineCommandDefinition {
  id: RichTextInlineCommandId;
  label: string;
  markName: string;
  excludes?: RichTextInlineCommandId;
}

export const RICH_TEXT_INLINE_COMMANDS = [
  { id: "bold", label: "Bold", markName: "bold" },
  { id: "italic", label: "Italic", markName: "italic" },
  { id: "underline", label: "Underline", markName: "underline" },
  { id: "strike", label: "Strikethrough", markName: "strike" },
  { id: "code", label: "Inline code", markName: "code" },
  {
    id: "subscript",
    label: "Subscript",
    markName: "subscript",
    excludes: "superscript",
  },
  {
    id: "superscript",
    label: "Superscript",
    markName: "superscript",
    excludes: "subscript",
  },
] as const satisfies readonly RichTextInlineCommandDefinition[];

export const FONT_SIZE_OPTIONS = [
  { label: "Default", value: "" },
  { label: "10", value: "10px" },
  { label: "11", value: "11px" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" },
] as const;

export function isRichTextInlineCommandAvailable(
  editor: Editor,
  commandId: RichTextInlineCommandId,
): boolean {
  if (editor.isDestroyed || !editor.schema) return false;
  const command = getRichTextInlineCommand(commandId);
  return Boolean(editor.schema.marks[command.markName]);
}

export function isRichTextInlineCommandActive(
  editor: Editor,
  commandId: RichTextInlineCommandId,
): boolean {
  if (editor.isDestroyed || !editor.schema) return false;
  const command = getRichTextInlineCommand(commandId);
  return editor.isActive(command.markName);
}

export function runRichTextInlineCommand(
  editor: Editor,
  commandId: RichTextInlineCommandId,
): boolean {
  const chain = editor.chain().focus();

  switch (commandId) {
    case "bold":
      return chain.toggleBold().run();
    case "italic":
      return chain.toggleItalic().run();
    case "underline":
      return chain.toggleUnderline().run();
    case "strike":
      return chain.toggleStrike().run();
    case "code":
      return chain.toggleCode().run();
    case "subscript":
      return chain.toggleSubscript().run();
    case "superscript":
      return chain.toggleSuperscript().run();
  }
}

function getRichTextInlineCommand(
  commandId: RichTextInlineCommandId,
): RichTextInlineCommandDefinition {
  const command = RICH_TEXT_INLINE_COMMANDS.find((candidate) => candidate.id === commandId);
  if (!command) throw new Error(`Unknown rich text command: ${commandId}`);
  return command;
}
