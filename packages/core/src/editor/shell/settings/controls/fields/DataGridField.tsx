import { useController, useFormContext, type FieldValues } from "react-hook-form";

import { Field, Label } from "@/ui/components/Input/Input";

import { DataGridEditor } from "./data-grid/DataGridEditor";
import { normalizeDataGridValue } from "./data-grid/data-grid-model";
import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

export function DataGridField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"dataGrid">>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
  });
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });
  const value = normalizeDataGridValue(field.value);

  return (
    <Field>
      <Label id={meta.id}>{descriptor.label}</Label>
      <DataGridEditor
        ariaLabel={descriptor.ariaLabel ?? descriptor.label}
        ariaLabelledBy={meta.id}
        disabled={disabled}
        value={value}
        onChange={field.onChange}
      />
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
