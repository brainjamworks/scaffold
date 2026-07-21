import { useCallback, useEffect, useId, useMemo } from "react";
import { useFormContext, useWatch, type FieldValues } from "react-hook-form";

import { Field, Label } from "@/ui/components/Input/Input";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { RichTextArea } from "@/editor/rich-text/authoring/nested-overlay/RichTextArea";
import {
  ScaffoldRichTextDocumentSchema,
  EmptyScaffoldRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";

import { SettingsFieldError, SettingsFieldHelp, settingsFieldMeta } from "./shared";
import type {
  SettingsFieldDescriptorByKind,
  SettingsFieldDocumentTarget,
  SettingsFieldProps,
} from "./types";

type RichTextDescriptor = SettingsFieldDescriptorByKind<"richText">;

export interface ControlledRichTextFieldProps {
  descriptor: RichTextDescriptor;
  documentRevision: unknown;
  documentTarget: SettingsFieldDocumentTarget;
  error?: string;
  onCommitted?: (value: ScaffoldRichTextDocument) => void;
}

export function RichTextField({
  descriptor,
  documentRevision,
  documentTarget,
  error,
}: SettingsFieldProps<RichTextDescriptor> & {
  documentRevision: unknown;
  documentTarget: SettingsFieldDocumentTarget;
}) {
  const form = useFormContext<FieldValues>();
  const formValue = useWatch({ control: form.control, name: descriptor.name });
  const handleCommitted = useCallback(
    (next: ScaffoldRichTextDocument) => {
      form.setValue(descriptor.name, next, { shouldDirty: true, shouldValidate: true });
    },
    [descriptor.name, form],
  );

  useEffect(() => {
    const current = readRichTextDocument(documentTarget.readField(descriptor.name));
    if (sameValue(current, formValue)) return;
    form.setValue(descriptor.name, current, { shouldDirty: false, shouldValidate: false });
  }, [descriptor.name, documentRevision, documentTarget, form, formValue]);

  return (
    <ControlledRichTextField
      descriptor={descriptor}
      documentRevision={documentRevision}
      documentTarget={documentTarget}
      {...(error ? { error } : {})}
      onCommitted={handleCommitted}
    />
  );
}

export function ControlledRichTextField({
  descriptor,
  documentRevision,
  documentTarget,
  error,
  onCommitted,
}: ControlledRichTextFieldProps) {
  const generatedId = useId();
  const meta = settingsFieldMeta({ ...descriptor, error });
  const safeId = generatedId.replace(/[^A-Za-z0-9_-]/g, "");
  const labelId = `${meta.id}-${safeId}-label`;
  const bubbleMenuPluginKey = `${meta.id}-${safeId}-bubble`;
  const extensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        includeChildren: false,
        placeholder: descriptor.placeholder ?? "",
        showOnlyCurrent: false,
        showOnlyWhenEditable: true,
      }),
    ],
    [descriptor.placeholder],
  );
  const target = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => readRichTextDocument(documentTarget.readField(descriptor.name)),
      write: (next: ScaffoldRichTextDocument) => {
        if (!documentTarget.writeField(descriptor.name, next)) return;
        onCommitted?.(next);
      },
    }),
    [descriptor.name, documentTarget, onCommitted],
  );

  return (
    <Field>
      <Label id={labelId}>{descriptor.label}</Label>
      <RichTextArea
        ariaLabel={descriptor.label}
        ariaLabelledBy={labelId}
        bubbleMenuPluginKey={bubbleMenuPluginKey}
        extensions={extensions}
        fieldKey={descriptor.name}
        outerEditor={documentTarget.editor}
        {...(descriptor.placeholder ? { placeholder: descriptor.placeholder } : {})}
        syncKey={documentRevision}
        target={target}
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

function readRichTextDocument(value: unknown): ScaffoldRichTextDocument {
  const parsed = ScaffoldRichTextDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : EmptyScaffoldRichTextDocument;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
