import {
  CodeIcon as Code,
  LinkBreakIcon as LinkBreak,
  LinkIcon as Link,
  TextBIcon as TextB,
  TextItalicIcon as TextItalic,
  TextStrikethroughIcon as TextStrikethrough,
  TextSubscriptIcon as TextSubscript,
  TextSuperscriptIcon as TextSuperscript,
  TextUnderlineIcon as TextUnderline,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Input, Label } from "@/ui/components/Input/Input";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import {
  authoringOverlayMiddlewareOptions,
  useAuthoringOverlayEnvironment,
} from "@/editor/interactions/floating/useAuthoringOverlayEnvironment";
import {
  canApplyInlineIconToEditor,
  selectedInlineIcon,
  selectedInlineMath,
} from "@/editor/rich-text/authoring/commands";
import {
  canApplyVocabularyTermToEditor,
  selectedVocabularyTerm,
} from "@/editor/rich-text/vocabulary-term/authoring/vocabulary-term-commands";
import {
  setBubblePlacementReady,
  syncBubbleFloatingRootAtZIndex,
  useBubbleMenuScrollPositionSync,
} from "@/editor/interactions/bubble";
import {
  isRichTextInlineCommandActive,
  isRichTextInlineCommandAvailable,
  runRichTextInlineCommand,
  type RichTextInlineCommandId,
} from "@/editor/shell/bubbles/rich-text/controls/rich-text-options";
import { InteractionBubbleToolbarViewport } from "@/editor/shell/bubbles/interaction/InteractionBubbleToolbarViewport";
import { revealControlWithinHorizontalToolbar } from "@/editor/shell/bubbles/interaction/interaction-bubble-toolbar";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconMd } from "@/ui/tokens/icon-sizes";

import {
  FontSizeControl,
  HighlightControl,
  InlineIconControl,
  InlineMathControl,
  TextAlignmentControl,
  TextColorControl,
  VocabularyTermControl,
} from "./RichTextStyleControls";
import { shouldShowRichTextBubbleMenu } from "./rich-text-bubble-state";
import {
  preserveRichTextSelection,
  preserveRichTextSelectionWithinCurrentTarget,
} from "./rich-text-popover-behavior";
import "./rich-text-bubble.css";

type BubbleShouldShowInput = Parameters<
  NonNullable<ComponentProps<typeof BubbleMenu>["shouldShow"]>
>[0];

export interface RichTextBubbleMenuProps {
  editor: Editor;
  pluginKey: string;
  appendTo?: () => HTMLElement;
}

export function RichTextBubbleMenu({ appendTo, editor, pluginKey }: RichTextBubbleMenuProps) {
  const bubbleMenuElementRef = useRef<HTMLDivElement | null>(null);
  const resolveDirectHost = useCallback(() => {
    const editorDom = safeEditorDom(editor);
    return appendTo?.() ?? editorDom?.parentElement ?? editorDom;
  }, [appendTo, editor]);
  const overlayEnvironment = useAuthoringOverlayEnvironment(resolveDirectHost);
  const shouldShow = useCallback((input: BubbleShouldShowInput) => {
    if (!safeEditorDom(input.editor)) return false;
    const visible = shouldShowRichTextBubbleMenu(input);
    const element = bubbleMenuElementRef.current;
    if (visible && element) setBubblePlacementReady(element, false);
    return visible;
  }, []);

  useBubbleMenuScrollPositionSync(editor, pluginKey);

  useEffect(() => {
    const element = bubbleMenuElementRef.current;
    if (!element) return;
    syncBubbleFloatingRootAtZIndex(element, zIndex.editorTextBubble);
  });

  if (overlayEnvironment === null) return null;

  return (
    <BubbleMenu
      ref={bubbleMenuElementRef}
      editor={editor}
      pluginKey={pluginKey}
      updateDelay={0}
      resizeDelay={0}
      appendTo={overlayEnvironment.appendTo}
      shouldShow={shouldShow}
      options={{
        strategy: overlayEnvironment.strategy,
        placement: "top",
        offset: 8,
        ...authoringOverlayMiddlewareOptions(overlayEnvironment),
        onShow: () => {
          const element = bubbleMenuElementRef.current;
          if (!element) return;
          syncBubbleFloatingRootAtZIndex(element, zIndex.editorTextBubble);
          setBubblePlacementReady(element, false);
        },
        onUpdate: () => {
          const element = bubbleMenuElementRef.current;
          if (element) setBubblePlacementReady(element, true);
        },
        onHide: () => {
          const element = bubbleMenuElementRef.current;
          if (element) setBubblePlacementReady(element, false);
        },
      }}
    >
      <RichTextBubbleSurface editor={editor} />
    </BubbleMenu>
  );
}

function safeEditorDom(editor: Editor): HTMLElement | null {
  if (editor.isDestroyed) return null;
  try {
    return editor.view.dom;
  } catch {
    return null;
  }
}

export function RichTextBubbleSurface({ editor }: { editor: Editor }) {
  const controlState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (currentEditor.isDestroyed || !currentEditor.schema) {
        return emptyRichTextControlState();
      }

      const inlineIcon = selectedInlineIcon(currentEditor);

      return {
        bold: richTextCommandState(currentEditor, "bold"),
        italic: richTextCommandState(currentEditor, "italic"),
        underline: richTextCommandState(currentEditor, "underline"),
        strike: richTextCommandState(currentEditor, "strike"),
        code: richTextCommandState(currentEditor, "code"),
        subscript: richTextCommandState(currentEditor, "subscript"),
        superscript: richTextCommandState(currentEditor, "superscript"),
        link: {
          active: currentEditor.isActive("link"),
          available: Boolean(currentEditor.schema.marks["link"]),
        },
        inlineMath: {
          active: selectedInlineMath(currentEditor) !== null,
          available: Boolean(currentEditor.schema.nodes["inlineMath"]),
        },
        inlineIcon: {
          active: inlineIcon !== null,
          available: canApplyInlineIconToEditor(currentEditor),
          size: inlineIcon?.size ?? null,
          valueKey: inlineIcon?.value ? JSON.stringify(inlineIcon.value) : "",
        },
        vocabularyTerm: {
          active: selectedVocabularyTerm(currentEditor) !== null,
          available: canApplyVocabularyTermToEditor(currentEditor),
        },
        textStyle: {
          available: Boolean(currentEditor.schema.marks["textStyle"]),
          fontSize: textStyleAttr(currentEditor, "fontSize"),
          textColor: textStyleAttr(currentEditor, "color"),
        },
        textAlign: textAlignmentState(currentEditor),
        highlight: {
          active: currentEditor.isActive("highlight"),
          available: Boolean(currentEditor.schema.marks["highlight"]),
          color: highlightColor(currentEditor),
        },
      };
    },
    equalityFn: (left, right) =>
      !!right &&
      left.bold.available === right.bold.available &&
      left.bold.active === right.bold.active &&
      left.italic.available === right.italic.available &&
      left.italic.active === right.italic.active &&
      left.underline.available === right.underline.available &&
      left.underline.active === right.underline.active &&
      left.strike.available === right.strike.available &&
      left.strike.active === right.strike.active &&
      left.code.available === right.code.available &&
      left.code.active === right.code.active &&
      left.subscript.available === right.subscript.available &&
      left.subscript.active === right.subscript.active &&
      left.superscript.available === right.superscript.available &&
      left.superscript.active === right.superscript.active &&
      left.link.available === right.link.available &&
      left.link.active === right.link.active &&
      left.inlineMath.available === right.inlineMath.available &&
      left.inlineMath.active === right.inlineMath.active &&
      left.inlineIcon.available === right.inlineIcon.available &&
      left.inlineIcon.active === right.inlineIcon.active &&
      left.inlineIcon.size === right.inlineIcon.size &&
      left.inlineIcon.valueKey === right.inlineIcon.valueKey &&
      left.vocabularyTerm.available === right.vocabularyTerm.available &&
      left.vocabularyTerm.active === right.vocabularyTerm.active &&
      left.textStyle.available === right.textStyle.available &&
      left.textStyle.fontSize === right.textStyle.fontSize &&
      left.textStyle.textColor === right.textStyle.textColor &&
      left.textAlign.available === right.textAlign.available &&
      left.textAlign.activeAlignment === right.textAlign.activeAlignment &&
      left.highlight.available === right.highlight.available &&
      left.highlight.active === right.highlight.active &&
      left.highlight.color === right.highlight.color,
  });

  return (
    <Tooltip.Provider delayDuration={350}>
      <InteractionBubbleToolbarViewport
        contentEditable={false}
        role="toolbar"
        aria-label="Text formatting"
        aria-orientation="horizontal"
        onKeyDown={handleRichTextToolbarKeyDown}
        onMouseDown={preserveRichTextSelectionWithinCurrentTarget}
        {...authoringChromeAttributes(AuthoringChromeKind.Bubble)}
        data-rich-text-bubble
        className="sc-rich-text-bubble"
        style={{ zIndex: zIndex.editorTextBubble }}
      >
        <RichTextCommandButton
          active={controlState.bold.active}
          command="bold"
          disabled={!controlState.bold.available}
          editor={editor}
          label="Bold"
          icon={<TextB size={iconMd} weight="bold" />}
        />
        <RichTextCommandButton
          active={controlState.italic.active}
          command="italic"
          disabled={!controlState.italic.available}
          editor={editor}
          label="Italic"
          icon={<TextItalic size={iconMd} weight="bold" />}
        />
        <RichTextCommandButton
          active={controlState.underline.active}
          command="underline"
          disabled={!controlState.underline.available}
          editor={editor}
          label="Underline"
          icon={<TextUnderline size={iconMd} weight="bold" />}
        />
        <RichTextCommandButton
          active={controlState.strike.active}
          command="strike"
          disabled={!controlState.strike.available}
          editor={editor}
          label="Strikethrough"
          icon={<TextStrikethrough size={iconMd} weight="bold" />}
        />
        <RichTextCommandButton
          active={controlState.code.active}
          command="code"
          disabled={!controlState.code.available}
          editor={editor}
          label="Inline code"
          icon={<Code size={iconMd} weight="bold" />}
        />
        <RichTextCommandButton
          active={controlState.subscript.active}
          command="subscript"
          disabled={!controlState.subscript.available || controlState.superscript.active}
          editor={editor}
          label="Subscript"
          icon={<TextSubscript size={iconMd} weight="bold" />}
        />
        <RichTextCommandButton
          active={controlState.superscript.active}
          command="superscript"
          disabled={!controlState.superscript.available || controlState.subscript.active}
          editor={editor}
          label="Superscript"
          icon={<TextSuperscript size={iconMd} weight="bold" />}
        />
        <InlineMathControl
          active={controlState.inlineMath.active}
          disabled={!controlState.inlineMath.available}
          editor={editor}
        />
        <InlineIconControl
          active={controlState.inlineIcon.active}
          currentSize={controlState.inlineIcon.size}
          disabled={!controlState.inlineIcon.available}
          editor={editor}
        />
        <VocabularyTermControl
          active={controlState.vocabularyTerm.active}
          disabled={!controlState.vocabularyTerm.available}
          editor={editor}
        />
        <RichTextLinkButton
          active={controlState.link.active}
          disabled={!controlState.link.available}
          editor={editor}
        />
        <FontSizeControl
          currentValue={controlState.textStyle.fontSize}
          disabled={!controlState.textStyle.available}
          editor={editor}
        />
        <TextColorControl
          currentValue={controlState.textStyle.textColor}
          disabled={!controlState.textStyle.available}
          editor={editor}
        />
        <HighlightControl
          currentValue={controlState.highlight.color}
          disabled={!controlState.highlight.available}
          editor={editor}
        />
        <TextAlignmentControl
          activeAlignment={controlState.textAlign.activeAlignment}
          disabled={!controlState.textAlign.available}
          editor={editor}
        />
      </InteractionBubbleToolbarViewport>
    </Tooltip.Provider>
  );
}

function handleRichTextToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    event.key !== "ArrowRight" &&
    event.key !== "ArrowLeft" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  if (!(event.target instanceof HTMLButtonElement)) return;

  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  );
  if (buttons.length === 0) return;

  const currentIndex = buttons.indexOf(event.target);
  if (currentIndex < 0) return;

  event.preventDefault();

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex + buttons.length - 1) % buttons.length;

  const nextButton = buttons[nextIndex];
  if (!nextButton) return;
  nextButton.focus({ preventScroll: true });
  revealControlWithinHorizontalToolbar(event.currentTarget, nextButton);
}

function richTextCommandState(editor: Editor, command: RichTextInlineCommandId) {
  return {
    active: isRichTextInlineCommandActive(editor, command),
    available: isRichTextInlineCommandAvailable(editor, command),
  };
}

function emptyRichTextControlState() {
  return {
    bold: { active: false, available: false },
    italic: { active: false, available: false },
    underline: { active: false, available: false },
    strike: { active: false, available: false },
    code: { active: false, available: false },
    subscript: { active: false, available: false },
    superscript: { active: false, available: false },
    link: { active: false, available: false },
    inlineMath: { active: false, available: false },
    inlineIcon: {
      active: false,
      available: false,
      size: null,
      valueKey: "",
    },
    vocabularyTerm: { active: false, available: false },
    textStyle: {
      available: false,
      fontSize: "",
      textColor: "",
    },
    textAlign: {
      activeAlignment: null,
      available: false,
    },
    highlight: {
      active: false,
      available: false,
      color: "",
    },
  };
}

function textStyleAttr(editor: Editor, attr: "color" | "fontSize"): string {
  const attrs = editor.getAttributes("textStyle");
  return typeof attrs[attr] === "string" ? attrs[attr] : "";
}

function highlightColor(editor: Editor): string {
  const attrs = editor.getAttributes("highlight");
  return typeof attrs["color"] === "string" ? attrs["color"] : "";
}

function textAlignmentState(editor: Editor): {
  activeAlignment: "left" | "center" | "right" | "justify" | null;
  available: boolean;
} {
  const commands = editor.commands as Record<string, unknown>;
  const available = typeof commands["setTextAlign"] === "function";
  const activeAlignment = editor.isActive({ textAlign: "center" })
    ? "center"
    : editor.isActive({ textAlign: "right" })
      ? "right"
      : editor.isActive({ textAlign: "justify" })
        ? "justify"
        : editor.isActive({ textAlign: "left" })
          ? "left"
          : null;
  return { activeAlignment, available };
}

function RichTextCommandButton({
  active,
  command,
  disabled,
  editor,
  icon,
  label,
}: {
  active: boolean;
  command: RichTextInlineCommandId;
  disabled: boolean;
  editor: Editor;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <IconButton
          variant="ghost"
          size="md"
          onMouseDown={preserveRichTextSelection}
          onClick={() => runRichTextInlineCommand(editor, command)}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn("sc-rich-text-trigger", active && "is-active")}
        >
          {icon}
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={10}
          className="sc-rich-text-tooltip"
          style={{ zIndex: zIndex.tooltip }}
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function RichTextLinkButton({
  active,
  disabled,
  editor,
}: {
  active: boolean;
  disabled: boolean;
  editor: Editor;
}) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && disabled) return;
    if (nextOpen) {
      const attrs = editor.getAttributes("link");
      setHref(typeof attrs["href"] === "string" ? attrs["href"] : "");
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalised = normaliseLinkHref(href);

    if (!normalised) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: normalised }).run();
    setOpen(false);
  };

  const handleRemove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <EditorFloating.Root open={open} onOpenChange={handleOpenChange}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <EditorFloating.Trigger asChild>
            <IconButton
              ref={triggerRef}
              variant="ghost"
              size="md"
              onMouseDown={preserveRichTextSelection}
              disabled={disabled}
              aria-label="Link"
              aria-pressed={active}
              className={cn("sc-rich-text-trigger", active && "is-active")}
            >
              <Link size={iconMd} weight="bold" />
            </IconButton>
          </EditorFloating.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={10}
            className="sc-rich-text-tooltip"
            style={{ zIndex: zIndex.tooltip }}
          >
            Link
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Link settings"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          authoringChrome
          className="sc-rich-text-popover sc-rich-text-popover--link"
        >
          <form className="sc-rich-text-form" onSubmit={handleSubmit}>
            <div className="sc-rich-text-header-row">
              <Label htmlFor="scaffold-rich-text-link-input" className="sc-rich-text-label">
                Link
              </Label>
              <button
                type="button"
                onMouseDown={preserveRichTextSelection}
                onClick={handleRemove}
                disabled={!active}
                aria-label="Remove link"
                className="sc-rich-text-inline-action"
              >
                <LinkBreak size={12} weight="bold" aria-hidden />
                <span>Remove</span>
              </button>
            </div>
            <Input
              ref={inputRef}
              id="scaffold-rich-text-link-input"
              type="url"
              autoComplete="off"
              spellCheck={false}
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="example.com"
              aria-label="URL"
              aria-describedby="scaffold-rich-text-link-input-hint"
            />
            <div className="sc-rich-text-footer-row">
              <span id="scaffold-rich-text-link-input-hint" className="sc-rich-text-help">
                Press Enter to apply
              </span>
              <Button type="submit" size="sm" onMouseDown={preserveRichTextSelection}>
                Apply link
              </Button>
            </div>
          </form>
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

/**
 * Auto-prefix a bare domain with `https://` so authors typing
 * `example.com` get a working link without thinking about
 * protocol. Leaves `mailto:`, `tel:`, fragment, and explicit
 * `http://` URLs intact. Empty / whitespace → empty.
 */
function normaliseLinkHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
