import { useController, useFormContext, type FieldValues } from "react-hook-form";

import { Checkbox } from "@/ui/components/Checkbox/Checkbox";
import { Field, Label } from "@/ui/components/Input/Input";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import { useSettingsFieldOptions } from "./options";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

import "./settings-field.css";

export function MultiSelectField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"multiSelect">>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
    defaultValue: [],
  });
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });
  const options = useSettingsFieldOptions(descriptor);
  const selected = Array.isArray(field.value)
    ? field.value.filter((value): value is string => typeof value === "string")
    : [];

  function setOption(value: string, checked: boolean) {
    const next = checked
      ? [...new Set([...selected, value])]
      : selected.filter((current) => current !== value);
    field.onChange(next);
  }

  return (
    <Field>
      <Label id={meta.id}>{descriptor.label}</Label>
      <div
        role="group"
        aria-labelledby={meta.id}
        className="sc-settings-multi-select"
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
      >
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className="sc-settings-control-checkbox-label sc-settings-multi-select__option"
            >
              <Checkbox
                name={field.name}
                checked={checked}
                disabled={disabled}
                invalid={Boolean(error)}
                onBlur={field.onBlur}
                onCheckedChange={(next) => setOption(option.value, next === true)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
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
