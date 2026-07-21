import { CheckSquareIcon as CheckSquare, PaletteIcon as Palette } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import * as ToggleGroup from "@/ui/components/ToggleGroup/ToggleGroup";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconMd, iconSm } from "@/ui/tokens/icon-sizes";
import { FullColorPicker } from "@/ui/components/ColorPicker/ColorPicker";
import {
  SCAFFOLD_TEXT_COLOR_OPTIONS,
  DEFAULT_SURFACE_BACKGROUND_COLOR,
} from "@/ui/components/ColorPicker/color-options";

import { MenuSelect } from "./MenuSelect";
import { getMenuControlDescriptorId, type MenuControlDescriptor } from "./types";

import "./menu-controls.css";

function withTooltip(trigger: ReactNode, label: string) {
  // Bubble lives above its block (placement: top-end). Tooltip side="top"
  // keeps hover affordance from landing on the block content below.
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={7}
          className="sc-menu-tooltip"
          style={{ zIndex: zIndex.tooltip }}
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface MenuControlsProps {
  controls: readonly MenuControlDescriptor[];
  value?: Record<string, unknown>;
  disabled?: boolean;
  onValueChange?: (name: string, next: unknown) => boolean | void;
}

interface MenuIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  destructive?: boolean;
  icon: Icon;
  label: string;
  showTooltip?: boolean;
}

export function MenuIconButton({
  active = false,
  className,
  destructive = false,
  disabled,
  icon: Icon,
  label,
  onMouseDown,
  showTooltip = true,
  title,
  type = "button",
  ...props
}: MenuIconButtonProps) {
  const button = (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown?.(event);
      }}
      className={cn(
        "sc-menu-icon-button",
        active && "is-active",
        destructive && !active && "is-destructive",
        className,
      )}
    >
      <Icon size={iconSm} aria-hidden />
    </button>
  );

  return showTooltip ? withTooltip(button, label) : button;
}

export function MenuControls({
  controls,
  value = {},
  disabled = false,
  onValueChange,
}: MenuControlsProps) {
  if (controls.length === 0) return null;

  return (
    <Tooltip.Provider delayDuration={350}>
      {controls.map((control) => (
        <MenuControl
          key={getMenuControlDescriptorId(control)}
          control={control}
          value={value}
          disabled={disabled}
          {...(onValueChange ? { onValueChange } : {})}
        />
      ))}
    </Tooltip.Provider>
  );
}

function MenuControl({
  control,
  value,
  disabled,
  onValueChange,
}: {
  control: MenuControlDescriptor;
  value: Record<string, unknown>;
  disabled: boolean;
  onValueChange?: (name: string, next: unknown) => boolean | void;
}) {
  const canUpdateValue = !disabled && !!onValueChange;

  if (control.kind === "boolean") {
    const current = Boolean(readName(value, control.name));
    const Icon = control.icon ?? CheckSquare;
    const iconOnly = control.presentation === "icon-toggle";

    const button = (
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onValueChange?.(control.name, !current)}
        aria-pressed={current}
        aria-label={`${control.label} (${current ? "on" : "off"})`}
        title={control.label}
        disabled={!canUpdateValue}
        className={cn(
          "sc-menu-control-button",
          iconOnly && "sc-menu-control-button--icon",
          current && "is-active",
        )}
      >
        <Icon size={iconSm} aria-hidden />
        {iconOnly ? null : control.label}
      </button>
    );

    return iconOnly ? withTooltip(button, control.label) : button;
  }

  if (control.kind === "select" && control.presentation === "segmented") {
    const current = String(readName(value, control.name) ?? "");

    return (
      <ToggleGroup.Root
        type="single"
        value={current}
        onValueChange={(next) => {
          if (!next) return;
          onValueChange?.(control.name, next);
        }}
        disabled={!canUpdateValue}
        aria-label={control.label}
        className="sc-menu-segmented"
      >
        {(control.options ?? []).map((option) => {
          const active = current === option.value;
          const OptionIcon = option.icon;
          const fullLabel = `${control.label}: ${option.label}`;
          // Options that ship an icon render as a square icon-only button
          // and surface the label as a tooltip; options without an icon
          // keep the original label-only treatment. Mixed icon/no-icon
          // options inside one segmented group is allowed but not the
          // intended use.
          const button = (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              onMouseDown={(event) => event.preventDefault()}
              aria-label={OptionIcon ? fullLabel : undefined}
              title={OptionIcon ? fullLabel : undefined}
              disabled={option.disabled}
              className={cn(
                "sc-menu-segmented-item",
                OptionIcon ? "sc-menu-segmented-item--icon" : "sc-menu-segmented-item--text",
                active && "is-active",
              )}
            >
              {OptionIcon ? <OptionIcon size={iconMd} aria-hidden /> : option.label}
            </ToggleGroup.Item>
          );
          return OptionIcon ? (
            <span key={option.value}>{withTooltip(button, fullLabel)}</span>
          ) : (
            button
          );
        })}
      </ToggleGroup.Root>
    );
  }

  if (control.kind === "select") {
    const current = String(readName(value, control.name) ?? "");

    return (
      <MenuSelect
        label={control.label}
        value={current}
        options={control.options ?? []}
        disabled={!canUpdateValue}
        onChange={(next) => onValueChange?.(control.name, next)}
      />
    );
  }

  if (control.kind === "number") {
    const raw = readName(value, control.name);
    const current = typeof raw === "number" ? String(raw) : "";

    return (
      <input
        type="number"
        aria-label={control.label}
        defaultValue={current}
        min={control.min}
        max={control.max}
        step={control.step}
        onChange={(event) => {
          const nextRaw = event.currentTarget.value;
          const nextValue = nextRaw === "" ? undefined : Number(nextRaw);
          onValueChange?.(control.name, nextValue);
        }}
        disabled={!canUpdateValue}
        className="sc-menu-number-input"
      />
    );
  }

  if (control.kind === "color") {
    return (
      <MenuColorControl
        control={control}
        value={value}
        disabled={!canUpdateValue}
        {...(onValueChange ? { onValueChange } : {})}
      />
    );
  }

  const actionDisabled = disabled || control.disabled || !control.run;
  const ActionIcon = control.icon;
  // Icon-only action: square button, label visually hidden but still in
  // the a11y tree, tooltip surfaces it on hover. Requires an icon —
  // without one the button has no visible content. Default chip layout
  // (`icon-text`) is the original "icon + label visible" treatment.
  const iconOnly = control.presentation === "icon-only" && ActionIcon !== undefined;

  const button = (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (actionDisabled) return;
        control.run?.();
      }}
      aria-label={control.label}
      title={control.title ?? control.label}
      disabled={actionDisabled}
      className={cn(
        "sc-menu-action-button",
        iconOnly ? "sc-menu-action-button--icon" : "sc-menu-action-button--text",
        control.destructive && "is-destructive",
      )}
    >
      {ActionIcon ? <ActionIcon size={iconOnly ? iconMd : iconSm} aria-hidden /> : null}
      <span className={cn(iconOnly && "sc-sr-only")}>{control.label}</span>
    </button>
  );

  return iconOnly ? withTooltip(button, control.label) : button;
}

function MenuColorControl({
  control,
  value,
  disabled,
  onValueChange,
}: {
  control: Extract<MenuControlDescriptor, { kind: "color" }>;
  value: Record<string, unknown>;
  disabled: boolean;
  onValueChange?: (name: string, next: unknown) => boolean | void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const current = readColorName(value, control.name);
  const swatchColor = current || DEFAULT_SURFACE_BACKGROUND_COLOR;

  return (
    <EditorFloating.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && disabled) return;
        setOpen(nextOpen);
      }}
    >
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <EditorFloating.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label={control.label}
              title={control.label}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              className={cn("sc-menu-color-trigger", current && "is-active")}
            >
              <Palette size={iconSm} aria-hidden />
              <span
                aria-hidden
                className="sc-menu-color-swatch"
                style={{ backgroundColor: swatchColor }}
              />
            </button>
          </EditorFloating.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={7}
            className="sc-menu-tooltip"
            style={{ zIndex: zIndex.tooltip }}
          >
            {control.label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <EditorFloating.Portal>
        <EditorFloating.Content
          align="center"
          side="top"
          sideOffset={10}
          collisionPadding={12}
          aria-label={control.label}
          authoringChrome
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className="sc-menu-color-popover"
        >
          <FullColorPicker
            currentValue={current}
            fallbackColor={DEFAULT_SURFACE_BACKGROUND_COLOR}
            label={control.pickerLabel ?? control.label}
            {...(control.labelSuffix ? { labelSuffix: control.labelSuffix } : {})}
            palette={SCAFFOLD_TEXT_COLOR_OPTIONS}
            resetLabel={control.resetLabel ?? "Default"}
            resetAriaLabel={control.resetAriaLabel ?? `Use default ${control.label.toLowerCase()}`}
            customHint={control.customHint ?? "Enter a hex colour, for example #ffffff."}
            onChange={(next) => onValueChange?.(control.name, next)}
            onControlMouseDown={(event) => event.preventDefault()}
            onReset={() => onValueChange?.(control.name, undefined)}
          />
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

export function MenuSeparator() {
  return <div aria-hidden className="sc-menu-separator" />;
}

export function readName(value: Record<string, unknown>, name: string): unknown {
  return name.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, value);
}

function readColorName(value: Record<string, unknown>, name: string): string {
  const raw = readName(value, name);
  return typeof raw === "string" ? raw : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
