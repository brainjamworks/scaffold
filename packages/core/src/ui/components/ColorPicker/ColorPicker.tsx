import {
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  CaretDownIcon as CaretDown,
} from "@phosphor-icons/react";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  ColorField,
  ColorPicker as AriaColorPicker,
  Input as AriaInput,
  Label as AriaLabel,
  parseColor,
} from "react-aria-components";

import type { ColorOption } from "./color-options";

import "./color-picker.css";

interface ColorSwatchRowProps {
  ariaLabel: string;
  currentValue: string;
  labelSuffix?: string;
  onControlMouseDown?: (event: MouseEvent<HTMLElement>) => void;
  onSelect: (value: string) => void;
  options: ReadonlyArray<ColorOption>;
}

export function ColorSwatchRow({
  ariaLabel,
  currentValue,
  labelSuffix,
  onControlMouseDown,
  onSelect,
  options,
}: ColorSwatchRowProps) {
  const swatches = options.filter((option) => option.value);
  const normalised = currentValue.toLowerCase();

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleSwatchRowKeyDown}
      className="sc-color-picker-swatch-grid"
    >
      {swatches.map((option) => {
        const isActive = option.value.toLowerCase() === normalised;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={labelSuffix ? `${option.label} ${labelSuffix}` : option.label}
            aria-pressed={isActive}
            onMouseDown={onControlMouseDown}
            onClick={() => onSelect(option.value)}
            className="sc-color-picker-swatch-button"
          >
            <span
              aria-hidden
              className="sc-color-picker-swatch"
              style={{ backgroundColor: option.value }}
            />
          </button>
        );
      })}
    </div>
  );
}

interface FullColorPickerProps {
  currentValue: string;
  fallbackColor: string;
  label: string;
  labelSuffix?: string;
  palette: ReadonlyArray<ColorOption>;
  resetLabel: string;
  resetAriaLabel: string;
  customHint: string;
  onChange: (value: string) => void;
  onControlMouseDown?: (event: MouseEvent<HTMLElement>) => void;
  onReset: () => void;
}

export function FullColorPicker({
  currentValue,
  fallbackColor,
  label,
  labelSuffix,
  palette,
  resetLabel,
  resetAriaLabel,
  customHint,
  onChange,
  onControlMouseDown,
  onReset,
}: FullColorPickerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const hintId = useId();

  return (
    <AriaColorPicker
      value={safeParseColor(currentValue || fallbackColor)}
      onChange={(color) => onChange(color.toString("hex"))}
    >
      <div className="sc-color-picker-control-stack">
        <div className="sc-color-picker-header-row">
          <span className="sc-color-picker-label">{label}</span>
          <button
            type="button"
            aria-label={resetAriaLabel}
            onMouseDown={onControlMouseDown}
            onClick={onReset}
            className={
              currentValue
                ? "sc-color-picker-inline-action"
                : "sc-color-picker-inline-action is-active"
            }
          >
            <ArrowCounterClockwise aria-hidden className="sc-color-picker-inline-action-icon" />
            {resetLabel}
          </button>
        </div>

        <ColorSwatchRow
          ariaLabel="Quick colours"
          currentValue={currentValue}
          options={palette}
          onSelect={onChange}
          {...(labelSuffix ? { labelSuffix } : {})}
          {...(onControlMouseDown ? { onControlMouseDown } : {})}
        />

        <button
          type="button"
          aria-expanded={customOpen}
          onMouseDown={onControlMouseDown}
          onClick={() => setCustomOpen((open) => !open)}
          className="sc-color-picker-disclosure"
        >
          <span>Custom colour</span>
          <CaretDown aria-hidden className="sc-color-picker-disclosure-icon" />
        </button>

        {customOpen ? (
          <ColorField aria-describedby={hintId} className="sc-color-picker-color-field">
            <AriaLabel className="sc-color-picker-label">Hex</AriaLabel>
            <AriaInput aria-describedby={hintId} className="sc-color-picker-hex-input" />
            <span id={hintId} className="sc-sr-only">
              {customHint}
            </span>
          </ColorField>
        ) : null}
      </div>
    </AriaColorPicker>
  );
}

interface HighlightColorPickerProps {
  currentValue: string;
  label: string;
  labelSuffix?: string;
  options: ReadonlyArray<ColorOption>;
  resetLabel: string;
  resetAriaLabel: string;
  onControlMouseDown?: (event: MouseEvent<HTMLElement>) => void;
  onReset: () => void;
  onSelect: (value: string) => void;
}

export function HighlightColorPicker({
  currentValue,
  label,
  labelSuffix,
  options,
  resetLabel,
  resetAriaLabel,
  onControlMouseDown,
  onReset,
  onSelect,
}: HighlightColorPickerProps) {
  return (
    <div className="sc-color-picker-control-stack">
      <div className="sc-color-picker-header-row">
        <span className="sc-color-picker-label">{label}</span>
        <button
          type="button"
          aria-label={resetAriaLabel}
          onMouseDown={onControlMouseDown}
          onClick={onReset}
          className={
            currentValue
              ? "sc-color-picker-inline-action"
              : "sc-color-picker-inline-action is-active"
          }
        >
          {resetLabel}
        </button>
      </div>
      <ColorSwatchRow
        ariaLabel={`${label} colours`}
        currentValue={currentValue}
        options={options}
        onSelect={onSelect}
        {...(labelSuffix ? { labelSuffix } : {})}
        {...(onControlMouseDown ? { onControlMouseDown } : {})}
      />
    </div>
  );
}

function handleSwatchRowKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
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

function safeParseColor(value: string) {
  try {
    return parseColor(value);
  } catch {
    return parseColor("#18181b");
  }
}
