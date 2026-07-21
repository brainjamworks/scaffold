import { useFormContext, type FieldValues } from "react-hook-form";

import { Field, Input, Label } from "@/ui/components/Input/Input";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

export function NumberField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"number">>) {
  const form = useFormContext<FieldValues>();
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });
  const field = form.register(descriptor.name, {
    setValueAs: (value: unknown) => {
      if (value === "") return descriptor.emptyValue ?? undefined;
      if (typeof value === "number") return value;
      if (typeof value !== "string") return descriptor.emptyValue ?? undefined;

      const next = descriptor.integer ? Number.parseInt(value, 10) : Number(value);
      return Number.isFinite(next) ? next : (descriptor.emptyValue ?? undefined);
    },
  });

  return (
    <Field>
      <Label htmlFor={meta.id}>{descriptor.label}</Label>
      <Input
        id={meta.id}
        {...field}
        type="number"
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
        {...(typeof descriptor.min === "number" ? { min: descriptor.min } : {})}
        {...(typeof descriptor.max === "number" ? { max: descriptor.max } : {})}
        {...(typeof descriptor.step === "number" ? { step: descriptor.step } : {})}
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
