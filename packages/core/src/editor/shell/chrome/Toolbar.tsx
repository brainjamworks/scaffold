import {
  ArrowClockwiseIcon as ArrowClockwise,
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  CodeBlockIcon as CodeBlock,
  EraserIcon as Eraser,
  ListBulletsIcon as ListBullets,
  ListNumbersIcon as ListNumbers,
  MinusIcon as Minus,
  ParagraphIcon as Paragraph,
  QuotesIcon as Quotes,
  TextHOneIcon as TextHOne,
  TextHThreeIcon as TextHThree,
  TextHTwoIcon as TextHTwo,
} from "@phosphor-icons/react";
import { useEditorState, type Editor } from "@tiptap/react";
import { type ReactNode } from "react";

import * as ToolbarPrimitive from "@/ui/components/Toolbar/Toolbar";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { iconMd } from "@/ui/tokens/icon-sizes";
import "./editor-rail-chrome.css";

interface ToolbarProps {
  editor: Editor;
  /** Optional right-aligned slot (mode tabs, share, etc.). */
  rightSlot?: ReactNode;
}

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
  children: ReactNode;
}

type HeadingLevel = 1 | 2 | 3;

function ToolbarButton({ onClick, disabled, active, ariaLabel, children }: ToolbarButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <ToolbarPrimitive.Button asChild>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-pressed={active}
            className="sc-editor-rail-button"
          >
            {children}
          </button>
        </ToolbarPrimitive.Button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10}>
          {ariaLabel}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * Hairline divider between toolbar groups inside the unified pill.
 * Horizontal in the vertical pill — separates groups along the column.
 */
function ToolbarDivider() {
  return (
    <ToolbarPrimitive.Separator
      decorative
      orientation="horizontal"
      className="sc-editor-rail-divider"
    />
  );
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="sc-editor-rail-group">
      {children}
    </div>
  );
}

export function Toolbar({ editor, rightSlot }: ToolbarProps) {
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const commands = e.commands as Record<string, unknown>;
      const hasUndo = typeof commands["undo"] === "function";
      const hasRedo = typeof commands["redo"] === "function";
      const hasHeading = Boolean(e.schema.nodes["heading"]);
      const hasParagraph = Boolean(e.schema.nodes["paragraph"]);
      const hasBulletList = Boolean(e.schema.nodes["bulletList"]);
      const hasOrderedList = Boolean(e.schema.nodes["orderedList"]);
      const hasBlockquote = Boolean(e.schema.nodes["blockquote"]);
      const hasCodeBlock = Boolean(e.schema.nodes["codeBlock"]);
      const hasHorizontalRule = Boolean(e.schema.nodes["horizontalRule"]);

      return {
        canUndo: hasUndo && e.can().undo(),
        canRedo: hasRedo && e.can().redo(),
        canParagraph: hasParagraph && e.can().chain().focus().setParagraph().run(),
        canHeading1: hasHeading && e.can().chain().focus().toggleHeading({ level: 1 }).run(),
        canHeading2: hasHeading && e.can().chain().focus().toggleHeading({ level: 2 }).run(),
        canHeading3: hasHeading && e.can().chain().focus().toggleHeading({ level: 3 }).run(),
        canBulletList: hasBulletList && e.can().chain().focus().toggleBulletList().run(),
        canOrderedList: hasOrderedList && e.can().chain().focus().toggleOrderedList().run(),
        canBlockquote: hasBlockquote && e.can().chain().focus().toggleBlockquote().run(),
        canCodeBlock: hasCodeBlock && e.can().chain().focus().toggleCodeBlock().run(),
        canHorizontalRule: hasHorizontalRule && e.can().chain().focus().setHorizontalRule().run(),
        paragraph: e.isActive("paragraph"),
        heading1: e.isActive("heading", { level: 1 }),
        heading2: e.isActive("heading", { level: 2 }),
        heading3: e.isActive("heading", { level: 3 }),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
      };
    },
  });

  return (
    <Tooltip.Provider delayDuration={350}>
      <div data-editor-toolbar="" className="sc-editor-rail-stack">
        <ToolbarPrimitive.Root
          aria-label="Editor formatting"
          orientation="vertical"
          className="sc-editor-rail-panel"
        >
          <ToolbarGroup label="History">
            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!toolbarState.canUndo}
              ariaLabel="Undo"
            >
              <ArrowCounterClockwise size={iconMd} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!toolbarState.canRedo}
              ariaLabel="Redo"
            >
              <ArrowClockwise size={iconMd} />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup label="Block style">
            <ToolbarButton
              onClick={() => editor.chain().focus().setParagraph().run()}
              disabled={!toolbarState.canParagraph}
              active={toolbarState.paragraph}
              ariaLabel="Paragraph"
            >
              <Paragraph size={iconMd} />
            </ToolbarButton>
            <HeadingButton
              editor={editor}
              level={1}
              disabled={!toolbarState.canHeading1}
              active={toolbarState.heading1}
            />
            <HeadingButton
              editor={editor}
              level={2}
              disabled={!toolbarState.canHeading2}
              active={toolbarState.heading2}
            />
            <HeadingButton
              editor={editor}
              level={3}
              disabled={!toolbarState.canHeading3}
              active={toolbarState.heading3}
            />
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup label="Formatting cleanup">
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().unsetAllMarks().unsetTextAlign().clearNodes().run();
              }}
              ariaLabel="Clear formatting"
            >
              <Eraser size={iconMd} weight="bold" />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup label="Blocks">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              disabled={!toolbarState.canBulletList}
              active={toolbarState.bulletList}
              ariaLabel="Bullet list"
            >
              <ListBullets size={iconMd} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              disabled={!toolbarState.canOrderedList}
              active={toolbarState.orderedList}
              ariaLabel="Numbered list"
            >
              <ListNumbers size={iconMd} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              disabled={!toolbarState.canBlockquote}
              active={toolbarState.blockquote}
              ariaLabel="Quote"
            >
              <Quotes size={iconMd} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              disabled={!toolbarState.canCodeBlock}
              active={toolbarState.codeBlock}
              ariaLabel="Code block"
            >
              <CodeBlock size={iconMd} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              disabled={!toolbarState.canHorizontalRule}
              ariaLabel="Horizontal rule"
            >
              <Minus size={iconMd} weight="bold" />
            </ToolbarButton>
          </ToolbarGroup>
        </ToolbarPrimitive.Root>
        {rightSlot ? <div className="sc-editor-rail-slot-stack">{rightSlot}</div> : null}
      </div>
    </Tooltip.Provider>
  );
}

function HeadingButton({
  editor,
  level,
  disabled,
  active,
}: {
  editor: Editor;
  level: HeadingLevel;
  disabled: boolean;
  active: boolean;
}) {
  const Icon = level === 1 ? TextHOne : level === 2 ? TextHTwo : TextHThree;

  return (
    <ToolbarButton
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
      disabled={disabled}
      active={active}
      ariaLabel={`Heading ${level}`}
    >
      <Icon size={iconMd} weight="bold" />
    </ToolbarButton>
  );
}
