import { useRef } from "react";
import { useController, useFormContext, type FieldValues } from "react-hook-form";
import { parseColor } from "react-aria-components";

import { Field } from "@/ui/components/Input/Input";
import * as Popover from "@/ui/components/Popover/Popover";
import { FullColorPicker } from "@/ui/components/ColorPicker/ColorPicker";

import {
  SettingsFieldError,
  SettingsFieldHelp,
  SettingsFieldStatus,
  useSettingsFieldMeta,
} from "./shared";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

import "./settings-field.css";

export function ColorField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"color">>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const disabled = Boolean(descriptor.disabledReason);
  const meta = useSettingsFieldMeta({ ...descriptor, error });
  const labelId = `${meta.id}-label`;
  const currentValue = typeof field.value === "string" ? field.value : "";
  const resolvedValue = currentValue || descriptor.fallbackColor;
  const resetValue = descriptor.resetValue ?? "";
  const pickerLabel = descriptor.pickerLabel ?? descriptor.label;

  return (
    <Field>
      <div
        id={meta.id}
        role="group"
        aria-labelledby={labelId}
        aria-invalid={error ? "true" : undefined}
        aria-disabled={disabled || undefined}
        data-invalid={error ? "true" : undefined}
        onBlur={field.onBlur}
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
      >
        <div className="sc-settings-color-field__row">
          <span className="sc-settings-color-field__heading">
            <span id={labelId} className="sc-field-label sc-settings-color-field__label">
              {descriptor.label}
            </span>
            {descriptor.status ? (
              <SettingsFieldStatus name={descriptor.name} status={descriptor.status} />
            ) : null}
          </span>

          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                ref={(element) => {
                  triggerRef.current = element;
                  field.ref(element);
                }}
                type="button"
                aria-label={`Edit ${pickerLabel}, current value ${resolvedValue}`}
                aria-invalid={error ? "true" : undefined}
                disabled={disabled}
                className="sc-settings-color-field__trigger"
                {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
              >
                <span
                  aria-hidden="true"
                  className="sc-settings-color-field__current"
                  style={{ backgroundColor: previewColor(resolvedValue, descriptor.fallbackColor) }}
                />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                ref={contentRef}
                align="end"
                side="bottom"
                sideOffset={8}
                collisionPadding={16}
                aria-label={`${pickerLabel} picker`}
                className="sc-settings-color-field__popover"
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  requestAnimationFrame(() => {
                    const selectedSwatch = contentRef.current?.querySelector<HTMLButtonElement>(
                      '.sc-color-picker-swatch-button[aria-pressed="true"]',
                    );
                    const firstAction =
                      contentRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
                    (selectedSwatch ?? firstAction)?.focus();
                  });
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  triggerRef.current?.focus();
                }}
              >
                <FullColorPicker
                  currentValue={currentValue}
                  fallbackColor={descriptor.fallbackColor}
                  label={pickerLabel}
                  palette={descriptor.palette}
                  paletteAriaLabel={`${descriptor.label} quick colours`}
                  resetLabel={descriptor.resetLabel ?? "Default"}
                  resetAriaLabel={
                    descriptor.resetAriaLabel ?? `Use default ${descriptor.label.toLowerCase()}`
                  }
                  resetValue={resetValue}
                  customHint={descriptor.customHint ?? "Enter a hex colour, for example #ffffff."}
                  disabled={disabled}
                  onChange={field.onChange}
                  onReset={() => field.onChange(resetValue)}
                  {...(descriptor.labelSuffix ? { labelSuffix: descriptor.labelSuffix } : {})}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      <SettingsFieldHelp
        description={descriptor.description}
        disabledReason={descriptor.disabledReason}
        disabledHint={descriptor.disabledHint}
        id={meta.helpId}
      />
      <SettingsFieldError error={error} id={meta.errorId} />
    </Field>
  );
}

function previewColor(value: string, fallbackColor: string): string {
  try {
    parseColor(value);
    return value;
  } catch {
    return fallbackColor;
  }
}
