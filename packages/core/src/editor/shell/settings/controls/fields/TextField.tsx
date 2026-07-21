import { useFormContext, type FieldValues } from "react-hook-form";

import { Field, Input, Label } from "@/ui/components/Input/Input";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

export function TextField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"text">>) {
  const form = useFormContext<FieldValues>();
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });
  const field = form.register(descriptor.name);

  return (
    <Field>
      <Label htmlFor={meta.id}>{descriptor.label}</Label>
      <Input
        id={meta.id}
        {...field}
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
        {...(descriptor.placeholder ? { placeholder: descriptor.placeholder } : {})}
        invalid={Boolean(error)}
        disabled={disabled}
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
