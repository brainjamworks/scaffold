import { useController, useFormContext, type FieldValues } from "react-hook-form";

import { Field, Label } from "@/ui/components/Input/Input";
import { Select } from "@/ui/components/Select/Select";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import { useSettingsFieldOptions } from "./options";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

export function SelectField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"select">>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
  });
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });
  const labelId = `${meta.id}-label`;
  const options = useSettingsFieldOptions(descriptor);

  return (
    <Field>
      <Label id={labelId} htmlFor={meta.id}>
        {descriptor.label}
      </Label>
      <Select
        id={meta.id}
        name={field.name}
        aria-labelledby={labelId}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={field.onChange}
        options={options}
        invalid={Boolean(error)}
        disabled={disabled || options.length === 0}
        {...(descriptor.placeholder ? { placeholder: descriptor.placeholder } : {})}
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
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
