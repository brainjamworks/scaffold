import {
  ImageIcon as Image,
  MathOperationsIcon as MathOperations,
  TextAlignCenterIcon as TextAlignCenter,
  TextAlignJustifyIcon as TextAlignJustify,
  TextAlignLeftIcon as TextAlignLeft,
  TextAlignRightIcon as TextAlignRight,
  TextTIcon as TextT,
  XIcon as XGlyph,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import { useRef, useState, type KeyboardEvent, type FormEvent, type ReactNode } from "react";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Field, Input, Label, Textarea } from "@/ui/components/Input/Input";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import {
  activateInlineMathInEditor,
  applyInlineIconToEditor,
  clearInlineIconFromEditor,
  resolveInlineIconTarget,
  selectedInlineIcon,
  setInlineIconSizeInEditor,
  type InlineIconTarget,
} from "@/editor/rich-text/authoring/commands";
import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { DEFAULT_INLINE_ICON_VALUE } from "@/editor/rich-text/inline-icon/model/InlineIconNode";
import type { IconSize, IconValue } from "@/schemas/media/icon";
import {
  applyVocabularyTermToEditor,
  clearVocabularyTermFromEditor,
  resolveVocabularyTermTarget,
  type VocabularyTermTarget,
} from "@/editor/rich-text/vocabulary-term/authoring/vocabulary-term-commands";
import { cn } from "@/lib/cn";
import { IconRenderer } from "@/ui/icons/IconRenderer";
import { zIndex } from "@/ui/overlays/z-index";
import { iconMd } from "@/ui/tokens/icon-sizes";

import { preserveRichTextSelection, preventPopoverAutoFocus } from "./rich-text-popover-behavior";

type TextAlignment = "left" | "center" | "right" | "justify";
const INLINE_ICON_SIZE_OPTIONS = [
  { value: "sm", label: "Small", shortLabel: "S" },
  { value: "md", label: "Medium", shortLabel: "M" },
  { value: "lg", label: "Large", shortLabel: "L" },
] as const satisfies readonly {
  value: IconSize;
  label: string;
  shortLabel: string;
}[];

export function InlineMathControl({
  active,
  disabled,
  editor,
}: {
  active: boolean;
  disabled: boolean;
  editor: Editor;
}) {
  return (
    <RichTextIconButton
      active={active}
      disabled={disabled}
      label="Inline math"
      onClick={() => activateInlineMathInEditor(editor)}
      icon={<MathOperations size={iconMd} weight="bold" />}
    />
  );
}

export function InlineIconControl({
  active,
  currentSize,
  disabled,
  editor,
}: {
  active: boolean;
  currentSize: IconSize | null;
  disabled: boolean;
  editor: Editor;
}) {
  const [target, setTarget] = useState<InlineIconTarget | null>(null);
  const selectedValue = selectedInlineIcon(editor)?.value ?? null;

  const captureTarget = () => {
    const nextTarget = resolveInlineIconTarget(editor);
    setTarget(nextTarget);
  };

  const handleValueChange = (nextValue: IconValue | null) => {
    const targetToApply = target ?? resolveInlineIconTarget(editor);

    if (!nextValue) {
      if (targetToApply.mode === "update") {
        clearInlineIconFromEditor(editor, targetToApply);
      }
      return;
    }

    applyInlineIconToEditor(editor, targetToApply, nextValue);
  };

  const handleSizeChange = (size: IconSize) => {
    const selectedTarget = selectedInlineIcon(editor);
    if (!selectedTarget) return;
    setInlineIconSizeInEditor(editor, selectedTarget, size);
  };

  return (
    <span className="sc-rich-text-inline-icon-control">
      <IconPicker
        value={selectedValue}
        fallbackValue={DEFAULT_INLINE_ICON_VALUE}
        clearLabel="Remove icon"
        disabled={disabled}
        align="center"
        side="top"
        onValueChange={handleValueChange}
        renderTrigger={({ disabled: triggerDisabled, selectedValue: iconValue }) => (
          <IconButton
            variant="ghost"
            size="md"
            onMouseDown={(event) => {
              preserveRichTextSelection(event);
              captureTarget();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                captureTarget();
              }
            }}
            disabled={triggerDisabled}
            aria-label="Icon"
            title="Icon"
            className={cn("sc-rich-text-trigger", active && "is-active")}
          >
            {iconValue ? (
              <IconRenderer
                value={iconValue}
                decorative
                className="sc-rich-text-inline-icon-trigger-glyph"
              />
            ) : (
              <Image size={iconMd} weight="bold" />
            )}
          </IconButton>
        )}
      />
      {currentSize ? (
        <span role="group" aria-label="Icon size" className="sc-rich-text-inline-icon-size">
          {INLINE_ICON_SIZE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={preserveRichTextSelection}
              onClick={() => handleSizeChange(option.value)}
              aria-label={`${option.label} icon`}
              aria-pressed={currentSize === option.value}
              className="sc-rich-text-inline-icon-size-button"
            >
              {option.shortLabel}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function TextAlignmentControl({
  activeAlignment,
  disabled,
  editor,
}: {
  activeAlignment: TextAlignment | null;
  disabled: boolean;
  editor: Editor;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && disabled) return;
    setOpen(nextOpen);
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
              aria-label="Text alignment"
              className={cn("sc-rich-text-trigger", Boolean(activeAlignment) && "is-active")}
            >
              {alignmentIcon(activeAlignment ?? "left")}
            </IconButton>
          </EditorFloating.Trigger>
        </Tooltip.Trigger>
        <RichTextTooltip label="Text alignment" />
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Text alignment"
          onKeyDown={handleTextAlignmentKeyDown}
          onOpenAutoFocus={preventPopoverAutoFocus}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          authoringChrome
          className="sc-rich-text-popover sc-rich-text-popover--alignment"
        >
          {(["left", "center", "right", "justify"] as const).map((alignment) => {
            const label = alignmentLabel(alignment);
            return (
              <button
                key={alignment}
                type="button"
                onMouseDown={preserveRichTextSelection}
                onClick={() => {
                  editor.chain().focus().setTextAlign(alignment).run();
                  setOpen(false);
                }}
                aria-label={label}
                aria-pressed={activeAlignment === alignment}
                className="sc-rich-text-alignment-button"
              >
                {alignmentIcon(alignment)}
              </button>
            );
          })}
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

function handleTextAlignmentKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowRight" &&
    event.key !== "ArrowUp" &&
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
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex + buttons.length - 1) % buttons.length;

  buttons[nextIndex]?.focus();
}

export function VocabularyTermControl({
  active,
  disabled,
  editor,
}: {
  active: boolean;
  disabled: boolean;
  editor: Editor;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<VocabularyTermTarget | null>(null);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const termInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && disabled) return;
    if (nextOpen) {
      const nextTarget = resolveVocabularyTermTarget(editor);
      setTarget(nextTarget);
      setTerm(nextTarget.term);
      setDefinition(nextTarget.definition);
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const targetToApply = target ?? resolveVocabularyTermTarget(editor);
    const applied = applyVocabularyTermToEditor(editor, targetToApply, {
      term,
      definition,
    });

    if (applied) {
      setOpen(false);
    }
  };

  const handleRemove = () => {
    const current = target ?? resolveVocabularyTermTarget(editor);
    if (current.mode !== "update") {
      setOpen(false);
      return;
    }
    clearVocabularyTermFromEditor(editor, current);
    setOpen(false);
  };

  const canApply = term.trim().length > 0 && definition.trim().length > 0;
  const isEditing = (target ?? resolveVocabularyTermTarget(editor)).mode === "update";
  const definitionMax = 240;
  const definitionRemaining = definitionMax - definition.length;

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
              aria-label="Vocabulary term"
              className={cn("sc-rich-text-trigger", active && "is-active")}
            >
              <TextT size={iconMd} weight="bold" />
            </IconButton>
          </EditorFloating.Trigger>
        </Tooltip.Trigger>
        <RichTextTooltip label="Vocabulary term" />
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Vocabulary term"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            termInputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          authoringChrome
          className="sc-rich-text-popover sc-rich-text-popover--vocabulary"
        >
          <form className="sc-rich-text-form" onSubmit={handleSubmit}>
            <div className="sc-rich-text-header-row">
              <span className="sc-rich-text-label">Vocabulary</span>
              {isEditing ? (
                <button
                  type="button"
                  onMouseDown={preserveRichTextSelection}
                  onClick={handleRemove}
                  aria-label="Remove vocabulary term"
                  className="sc-rich-text-inline-action"
                >
                  <XGlyph size={12} weight="bold" aria-hidden />
                  <span>Remove</span>
                </button>
              ) : null}
            </div>
            <Field>
              <Label
                htmlFor="scaffold-rich-text-vocabulary-term-input"
                className="sc-rich-text-label--muted"
              >
                Term
              </Label>
              <Input
                ref={termInputRef}
                id="scaffold-rich-text-vocabulary-term-input"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Photosynthesis"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field>
              <div className="sc-rich-text-header-row">
                <Label
                  htmlFor="scaffold-rich-text-vocabulary-definition-input"
                  className="sc-rich-text-label--muted"
                >
                  Definition
                </Label>
                <span
                  id="scaffold-rich-text-vocabulary-definition-count"
                  aria-live="polite"
                  className={
                    definitionRemaining < 0 ? "sc-rich-text-count is-error" : "sc-rich-text-count"
                  }
                >
                  {Math.max(definitionRemaining, 0)}
                </span>
              </div>
              <Textarea
                id="scaffold-rich-text-vocabulary-definition-input"
                aria-describedby="scaffold-rich-text-vocabulary-definition-count"
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
                placeholder="The process plants use to convert light into energy."
                rows={3}
                maxLength={definitionMax}
              />
            </Field>
            <div className="sc-rich-text-footer-row">
              <span id="scaffold-rich-text-vocabulary-submit-hint" className="sc-rich-text-help">
                {isEditing ? "Saved on Enter or Save" : "Press Enter to save"}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={!canApply}
                onMouseDown={preserveRichTextSelection}
                aria-describedby="scaffold-rich-text-vocabulary-submit-hint"
              >
                Save term
              </Button>
            </div>
          </form>
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

function RichTextIconButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <IconButton
          variant="ghost"
          size="md"
          onMouseDown={preserveRichTextSelection}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn("sc-rich-text-trigger", active && "is-active")}
        >
          {icon}
        </IconButton>
      </Tooltip.Trigger>
      <RichTextTooltip label={label} />
    </Tooltip.Root>
  );
}

function RichTextTooltip({ label }: { label: string }) {
  return (
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
  );
}

function alignmentIcon(alignment: TextAlignment): ReactNode {
  if (alignment === "center") {
    return <TextAlignCenter size={iconMd} weight="bold" />;
  }
  if (alignment === "right") {
    return <TextAlignRight size={iconMd} weight="bold" />;
  }
  if (alignment === "justify") {
    return <TextAlignJustify size={iconMd} weight="bold" />;
  }
  return <TextAlignLeft size={iconMd} weight="bold" />;
}

function alignmentLabel(alignment: TextAlignment): string {
  if (alignment === "center") return "Align center";
  if (alignment === "right") return "Align right";
  if (alignment === "justify") return "Justify";
  return "Align left";
}
