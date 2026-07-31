import { useController, useFormContext, type FieldValues } from "react-hook-form";

import { Field, Label } from "@/ui/components/Input/Input";
import { Select } from "@/ui/components/Select/Select";
import * as ToggleGroup from "@/ui/components/ToggleGroup/ToggleGroup";

import { SettingsFieldError, SettingsFieldHelp, useSettingsFieldMeta } from "./shared";
import { useSettingsFieldOptions } from "./options";
import type { SettingsFieldDescriptorByKind, SettingsFieldProps } from "./types";

import "./settings-field.css";

type SelectFieldProps = SettingsFieldProps<SettingsFieldDescriptorByKind<"select">>;

export function SelectField(props: SelectFieldProps) {
  if (props.descriptor.presentation === "cards") {
    return <CardSelectField {...props} />;
  }
  if (props.descriptor.presentation === "segmented") {
    return <SegmentedSelectField {...props} />;
  }
  return <MenuSelectField {...props} />;
}

function CardSelectField({ descriptor, error }: SelectFieldProps) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
  });
  const options = useSettingsFieldOptions(descriptor);
  const disabled = Boolean(descriptor.disabledReason) || options.length === 0;
  const meta = useSettingsFieldMeta({ ...descriptor, error });
  const labelId = `${meta.id}-label`;
  const currentValue = typeof field.value === "string" ? field.value : "";
  const hasSelectedOption = options.some((option) => option.value === currentValue);

  return (
    <Field>
      <Label id={labelId}>{descriptor.label}</Label>
      <ToggleGroup.Root
        id={meta.id}
        type="single"
        orientation="vertical"
        value={currentValue}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-invalid={error ? "true" : undefined}
        data-invalid={error ? "true" : undefined}
        onBlur={field.onBlur}
        onValueChange={(next) => {
          if (next) field.onChange(next);
        }}
        className="sc-settings-card-select"
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
      >
        {options.map((option, index) => {
          const selected = option.value === currentValue;
          const OptionIcon = option.icon;
          const optionId = `${meta.id}-option-${index}`;
          const optionLabelId = `${optionId}-label`;
          const optionDescriptionId = option.description ? `${optionId}-description` : undefined;

          return (
            <ToggleGroup.Item
              key={option.value}
              ref={selected || (!hasSelectedOption && index === 0) ? field.ref : undefined}
              value={option.value}
              {...(option.ariaLabel
                ? { "aria-label": option.ariaLabel }
                : { "aria-labelledby": optionLabelId })}
              {...(optionDescriptionId ? { "aria-describedby": optionDescriptionId } : {})}
              disabled={disabled}
              className="sc-settings-card-select__item"
              data-has-swatches={option.swatches?.length ? "true" : undefined}
            >
              {option.swatches?.length ? (
                <span className="sc-settings-card-select__swatches" aria-hidden="true">
                  {option.swatches.map((swatch, swatchIndex) => (
                    <span
                      key={`${swatch}:${swatchIndex}`}
                      className="sc-settings-card-select__swatch"
                      data-color-swatch
                      aria-hidden="true"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </span>
              ) : null}
              <span className="sc-settings-card-select__copy">
                <span id={optionLabelId} className="sc-settings-card-select__label">
                  {OptionIcon ? <OptionIcon aria-hidden size={18} /> : null}
                  <span>{option.label}</span>
                </span>
                {option.description ? (
                  <span id={optionDescriptionId} className="sc-settings-card-select__description">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
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

function MenuSelectField({ descriptor, error }: SelectFieldProps) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
  });
  const disabled = Boolean(descriptor.disabledReason);
  const meta = useSettingsFieldMeta({ ...descriptor, error });
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

function SegmentedSelectField({ descriptor, error }: SelectFieldProps) {
  const form = useFormContext<FieldValues>();
  const { field } = useController({
    control: form.control,
    name: descriptor.name,
  });
  const options = useSettingsFieldOptions(descriptor);
  const disabled = Boolean(descriptor.disabledReason) || options.length === 0;
  const meta = useSettingsFieldMeta({ ...descriptor, error });
  const labelId = `${meta.id}-label`;
  const currentValue = typeof field.value === "string" ? field.value : "";
  const hasSelectedOption = options.some((option) => option.value === currentValue);

  return (
    <Field>
      <Label id={labelId}>{descriptor.label}</Label>
      <ToggleGroup.Root
        id={meta.id}
        type="single"
        orientation="horizontal"
        value={currentValue}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-invalid={error ? "true" : undefined}
        data-invalid={error ? "true" : undefined}
        onBlur={field.onBlur}
        onValueChange={(next) => {
          if (next) field.onChange(next);
        }}
        className="sc-settings-segmented"
        {...(meta.describedBy ? { "aria-describedby": meta.describedBy } : {})}
      >
        {options.map((option, index) => {
          const selected = option.value === currentValue;
          const OptionIcon = option.icon;
          return (
            <ToggleGroup.Item
              key={option.value}
              ref={selected || (!hasSelectedOption && index === 0) ? field.ref : undefined}
              value={option.value}
              {...(option.ariaLabel ? { "aria-label": option.ariaLabel } : {})}
              disabled={disabled}
              className="sc-settings-segmented__item"
            >
              {OptionIcon ? <OptionIcon aria-hidden size={16} /> : null}
              <span>{option.label}</span>
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
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
