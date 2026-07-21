import { MinusIcon as Minus, PlusIcon as Plus } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { preserveRichTextSelection, preventPopoverAutoFocus } from "./rich-text-popover-behavior";

const MIN_SIZE_PX = 8;
const MAX_SIZE_PX = 96;
const DEFAULT_SIZE_PX = 16;
/** Pixels of drag → 1px of value change. Lower = faster scrub. */
const SCRUB_SENSITIVITY = 4;
/** Canonical sizes for the preset row. */
const PRESET_SIZES_PX = [10, 12, 14, 16, 18, 24, 32, 48] as const;

export function FontSizeControl({
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
  const currentPx = parseFontSizePx(currentValue);
  const displayValue = currentPx ? String(currentPx) : "";

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && disabled) return;
    setOpen(nextOpen);
  };
  const applySize = (value: string) => {
    if (value) editor.commands.setFontSize(value);
    else editor.commands.unsetFontSize();
  };
  const stepSize = (direction: -1 | 1) => {
    const next = clampSize((currentPx || DEFAULT_SIZE_PX) + direction);
    applySize(`${next}px`);
  };
  const setSizePx = (px: number) => applySize(`${clampSize(px)}px`);

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
              aria-label="Font size"
              className={cn(
                "sc-rich-text-trigger sc-rich-text-trigger--value",
                currentValue && "is-active",
              )}
            >
              <span className="sc-rich-text-trigger-value">{displayValue || DEFAULT_SIZE_PX}</span>
              <span aria-hidden className="sc-rich-text-trigger-unit">
                px
              </span>
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
            Font size
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Font size"
          onOpenAutoFocus={preventPopoverAutoFocus}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          authoringChrome
          className="sc-rich-text-popover sc-rich-text-popover--font-size"
        >
          <FontSizeBody
            currentPx={currentPx}
            displayValue={displayValue}
            onChange={applySize}
            onStep={stepSize}
            onSelectPreset={(px) => {
              setSizePx(px);
            }}
            onCommitInput={setSizePx}
          />
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

interface FontSizeBodyProps {
  currentPx: number | null;
  displayValue: string;
  onChange: (value: string) => void;
  onStep: (direction: -1 | 1) => void;
  onSelectPreset: (px: number) => void;
  onCommitInput: (px: number) => void;
}

function FontSizeBody({
  currentPx,
  displayValue,
  onChange,
  onStep,
  onSelectPreset,
  onCommitInput,
}: FontSizeBodyProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrubStateRef = useRef<{
    startValue: number;
    accumulator: number;
    didDrag: boolean;
  } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  /** Mouse-wheel over the input nudges ±1 (Figma / Linear pattern). */
  const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    onStep(event.deltaY > 0 ? -1 : 1);
  };

  /** Scrub-drag directly on the input: pointer-down → start tracking,
   * if pointer moves > threshold while down → engage scrub + lock
   * pointer + suppress focus. If pointer stays still → release as a
   * normal click so the input takes focus and the user can type.
   * Figma's exact pattern: one input, two roles. */
  const beginScrub = useCallback(
    (event: React.PointerEvent<HTMLInputElement>) => {
      if (event.button !== 0) return;
      scrubStateRef.current = {
        startValue: currentPx ?? DEFAULT_SIZE_PX,
        accumulator: 0,
        didDrag: false,
      };
    },
    [currentPx],
  );

  useEffect(() => {
    const state = scrubStateRef.current;
    // Listen for movement once a pointer-down has armed the scrub.
    const handleMove = (event: PointerEvent) => {
      const current = scrubStateRef.current;
      if (!current) return;
      current.accumulator += event.movementX;
      if (!current.didDrag && Math.abs(current.accumulator) >= 3) {
        // Crossed the drag-detection threshold — engage scrub mode.
        current.didDrag = true;
        setScrubbing(true);
        inputRef.current?.blur();
        inputRef.current?.requestPointerLock?.();
      }
      if (current.didDrag) {
        const delta = Math.trunc(current.accumulator / SCRUB_SENSITIVITY);
        if (delta !== 0) {
          const next = clampSize(current.startValue + delta);
          if (next !== (currentPx ?? DEFAULT_SIZE_PX)) {
            onChange(`${next}px`);
            current.startValue = next;
            current.accumulator = 0;
          }
        }
      }
    };
    const handleUp = () => {
      const current = scrubStateRef.current;
      scrubStateRef.current = null;
      if (!current) return;
      if (current.didDrag) {
        setScrubbing(false);
        if (document.pointerLockElement) document.exitPointerLock?.();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!scrubStateRef.current?.didDrag) return;
      scrubStateRef.current = null;
      setScrubbing(false);
      if (document.pointerLockElement) document.exitPointerLock?.();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("keydown", handleKey);
      // Release any lingering pointer lock if the popover closes mid-drag.
      if (document.pointerLockElement) document.exitPointerLock?.();
      // Avoid an unused-variable lint if React strict-mode runs this twice.
      void state;
    };
  }, [currentPx, onChange]);

  return (
    <div className="sc-rich-text-font-size">
      <div className="sc-rich-text-font-size-row">
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Decrease font size"
          onMouseDown={preserveRichTextSelection}
          onClick={() => onStep(-1)}
          className="sc-rich-text-font-size-step"
        >
          <Minus size={iconSm} weight="bold" />
        </IconButton>
        <div className={cn("sc-rich-text-font-size-input-shell", scrubbing && "is-scrubbing")}>
          {/* The input itself is the scrub area — hover gives the
              ew-resize cue, drag scrubs the value, click without
              drag focuses for typing. One control, two roles. */}
          <input
            id="rich-text-font-size-input"
            ref={inputRef}
            aria-label="Font size in pixels — drag horizontally to scrub"
            title="Drag horizontally to scrub"
            value={displayValue}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={String(DEFAULT_SIZE_PX)}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, 3);
              if (!value) {
                onChange("");
                return;
              }
              const px = Number(value);
              if (!Number.isFinite(px)) return;
              onChange(`${clampSize(px)}px`);
            }}
            onWheel={handleWheel}
            onPointerDown={beginScrub}
            onBlur={(event) => {
              const value = event.target.value.replace(/\D/g, "");
              if (!value) return;
              onCommitInput(Number(value));
            }}
            onMouseDown={preserveRichTextSelection}
            className="sc-rich-text-font-size-input"
          />
          <span aria-hidden className="sc-rich-text-font-size-unit">
            px
          </span>
        </div>
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Increase font size"
          onMouseDown={preserveRichTextSelection}
          onClick={() => onStep(1)}
          className="sc-rich-text-font-size-step"
        >
          <Plus size={iconSm} weight="bold" />
        </IconButton>
      </div>

      {/* Preset menu — canonical sizes for one-click selection. The
          scrub handle + numeric input handles every other value. */}
      <div
        role="listbox"
        aria-label="Font size presets"
        onKeyDown={handlePresetListKeyDown}
        className="sc-rich-text-font-size-presets"
      >
        {PRESET_SIZES_PX.map((size) => {
          const isActive = currentPx === size;
          return (
            <button
              key={size}
              type="button"
              role="option"
              aria-label={`${size} pixels`}
              aria-selected={isActive}
              onMouseDown={preserveRichTextSelection}
              onClick={() => onSelectPreset(size)}
              className="sc-rich-text-font-size-preset"
            >
              {size}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function handlePresetListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
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

  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'),
  );
  if (options.length === 0) return;

  const currentIndex = options.indexOf(event.target);
  if (currentIndex < 0) return;

  event.preventDefault();

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? (currentIndex + 1) % options.length
          : (currentIndex + options.length - 1) % options.length;

  options[nextIndex]?.focus();
}

function parseFontSizePx(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) return null;
  return Number(match[1]);
}

function clampSize(value: number): number {
  return Math.max(MIN_SIZE_PX, Math.min(MAX_SIZE_PX, Math.round(value)));
}
