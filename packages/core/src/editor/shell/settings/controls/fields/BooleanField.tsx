import { useController, useFormContext, type FieldValues } from "react-hook-form";

import { Checkbox } from "@/ui/components/Checkbox/Checkbox";
import { Field, Label } from "@/ui/components/Input/Input";
import { Switch } from "@/ui/components/Switch/Switch";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

import "./settings-field.css";

export function BooleanField(props: SettingsFieldProps<SettingsFieldDescriptorByKind<"boolean">>) {
  if (props.descriptor.presentation === "switch") {
    return <SwitchField {...props} />;
  }
  return <CheckboxField {...props} />;
}

function CheckboxField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"boolean">>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
    defaultValue: false,
  });
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });

  return (
    <Field>
      <label className="sc-settings-control-checkbox-label">
        <Checkbox
          ref={field.ref}
          name={field.name}
          checked={Boolean(field.value)}
          invalid={Boolean(error)}
          disabled={disabled}
          {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
          onBlur={field.onBlur}
          onCheckedChange={(next) => field.onChange(next === true)}
        />
        <span>{descriptor.label}</span>
      </label>
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

function SwitchField({
  descriptor,
  error,
}: SettingsFieldProps<SettingsFieldDescriptorByKind<"boolean">>) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
    defaultValue: false,
  });
  const disabled = Boolean(descriptor.disabledReason);
  const meta = settingsFieldMeta({ ...descriptor, error });

  return (
    <Field className="sc-settings-control-switch-field">
      <div className="sc-settings-control-switch-copy">
        <Label htmlFor={meta.id} className="sc-settings-control-switch-label">
          {descriptor.label}
        </Label>
        <SettingsFieldHelp
          description={descriptor.description}
          disabledReason={descriptor.disabledReason}
          disabledHint={descriptor.disabledHint}
          id={meta.helpId}
        />
        <SettingsFieldError error={error} id={meta.errorId} />
      </div>
      <Switch
        id={meta.id}
        ref={field.ref}
        name={field.name}
        checked={Boolean(field.value)}
        disabled={disabled}
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
        onBlur={field.onBlur}
        onCheckedChange={(next) => field.onChange(next)}
      />
    </Field>
  );
}
