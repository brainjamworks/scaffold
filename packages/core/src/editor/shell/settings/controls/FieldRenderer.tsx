import { lazy, Suspense } from "react";
import {
  useFormContext,
  useWatch,
  type FieldError,
  type FieldErrors,
  type FieldValues,
} from "react-hook-form";

import type { SettingsSheetFieldDescriptor } from "@/editor/configuration/settings-sheet";

import { BooleanField } from "./fields/BooleanField";
import { ImageField } from "./fields/ImageField";
import { MultiSelectField } from "./fields/MultiSelectField";
import { NumberField } from "./fields/NumberField";
import { RichTextField } from "./fields/RichTextField";
import { SelectField } from "./fields/SelectField";
import { TextField } from "./fields/TextField";
import { TextareaField } from "./fields/TextareaField";
import type { SettingsFieldDocumentTarget } from "./fields/types";

const LazyDataGridField = lazy(() =>
  import("./fields/DataGridField").then(({ DataGridField }) => ({ default: DataGridField })),
);

export interface FieldRendererProps {
  descriptor: SettingsSheetFieldDescriptor;
  documentRevision?: unknown;
  documentTarget?: SettingsFieldDocumentTarget;
}

export function FieldRenderer({
  descriptor,
  documentRevision,
  documentTarget,
}: FieldRendererProps) {
  const form = useFormContext<FieldValues>();
  const visibleWhenValue = useWatch({
    control: form.control,
    name: descriptor.visibleWhen?.name ?? descriptor.name,
  });

  if (descriptor.visibleWhen) {
    const { equals, oneOf } = descriptor.visibleWhen;
    const matchesEquals = equals === undefined || visibleWhenValue === equals;
    const matchesOneOf = oneOf === undefined || oneOf.includes(visibleWhenValue);
    if (!matchesEquals || !matchesOneOf) return null;
  }

  const error = fieldErrorMessage(getFieldError(form.formState.errors, descriptor.name));

  switch (descriptor.kind) {
    case "text":
      return <TextField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "textarea":
      return <TextareaField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "number":
      return <NumberField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "boolean":
      return <BooleanField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "select":
      return <SelectField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "multiSelect":
      return <MultiSelectField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "dataGrid":
      return (
        <Suspense fallback={<div role="status">Loading table editor...</div>}>
          <LazyDataGridField descriptor={descriptor} {...(error ? { error } : {})} />
        </Suspense>
      );
    case "image":
      return <ImageField descriptor={descriptor} {...(error ? { error } : {})} />;
    case "richText":
      return documentTarget ? (
        <RichTextField
          descriptor={descriptor}
          documentRevision={documentRevision}
          documentTarget={documentTarget}
          {...(error ? { error } : {})}
        />
      ) : null;
  }
}

function getFieldError(errors: FieldErrors<FieldValues>, name: string): FieldError | undefined {
  const segments = name.split(".");
  let current: unknown = errors;

  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (!current || typeof current !== "object") return undefined;
  return current as FieldError;
}

function fieldErrorMessage(error: FieldError | undefined): string | undefined {
  return typeof error?.message === "string" && error.message.length > 0 ? error.message : undefined;
}
