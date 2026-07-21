import { HighlighterIcon as Highlighter, PaletteIcon as Palette } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import { useRef, useState } from "react";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconMd } from "@/ui/tokens/icon-sizes";

import {
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_TEXT_COLOR,
  HIGHLIGHT_OPTIONS,
  TEXT_COLOR_OPTIONS,
} from "./rich-text-color-options";
import { RichTextFullColorPicker, RichTextHighlightPicker } from "./rich-text-color-picker";
import { preserveRichTextSelection, preventPopoverAutoFocus } from "./rich-text-popover-behavior";

function ColorTriggerIcon({ Icon, swatchColor }: { Icon: typeof Palette; swatchColor: string }) {
  return (
    <span className="sc-rich-text-trigger-icon">
      <Icon size={iconMd} weight="bold" />
      <span
        aria-hidden="true"
        className="sc-rich-text-trigger-icon-swatch"
        style={{ backgroundColor: swatchColor }}
      />
    </span>
  );
}

export function TextColorControl({
  currentValue,
  disabled,
  editor,
}: {
  currentValue: string;
  disabled: boolean;
  editor: Editor;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && disabled) return;
    setOpen(nextOpen);
  };
  // No `.focus()` — that shifts DOM focus to the editor and Radix
  // closes the popover on focus-outside. The selection is preserved
  // by `preserveRichTextSelection` on each swatch's mousedown, so
  // the command still applies to the right range.
  const applyColor = (value: string) => {
    if (value) editor.commands.setColor(value);
    else editor.commands.unsetColor();
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
              aria-label="Text colour"
              className={cn("sc-rich-text-trigger", Boolean(currentValue) && "is-active")}
            >
              <ColorTriggerIcon Icon={Palette} swatchColor={currentValue || DEFAULT_TEXT_COLOR} />
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
            Text colour
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Text colour"
          onOpenAutoFocus={preventPopoverAutoFocus}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          authoringChrome
          className="sc-rich-text-popover sc-rich-text-popover--color"
        >
          <RichTextFullColorPicker
            currentValue={currentValue}
            fallbackColor={DEFAULT_TEXT_COLOR}
            palette={TEXT_COLOR_OPTIONS}
            onChange={applyColor}
            onReset={() => applyColor("")}
          />
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

export function HighlightControl({
  currentValue,
  disabled,
  editor,
}: {
  currentValue: string;
  disabled: boolean;
  editor: Editor;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && disabled) return;
    setOpen(nextOpen);
  };
  // Same as text colour — skip `.focus()` to keep the popover open
  // through multiple swatch picks.
  const applyHighlight = (value: string) => {
    if (value) editor.commands.setHighlight({ color: value });
    else editor.commands.unsetHighlight();
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
              aria-label="Highlight"
              className={cn("sc-rich-text-trigger", Boolean(currentValue) && "is-active")}
            >
              <ColorTriggerIcon
                Icon={Highlighter}
                swatchColor={currentValue || DEFAULT_HIGHLIGHT_COLOR}
              />
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
            Highlight
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Highlight"
          onOpenAutoFocus={preventPopoverAutoFocus}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          authoringChrome
          className="sc-rich-text-popover sc-rich-text-popover--color"
        >
          <RichTextHighlightPicker
            currentValue={currentValue}
            options={HIGHLIGHT_OPTIONS}
            onSelect={applyHighlight}
            onReset={() => applyHighlight("")}
          />
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}
