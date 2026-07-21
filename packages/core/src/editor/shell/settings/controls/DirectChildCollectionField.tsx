import type { Transaction } from "@tiptap/pm/state";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldValues } from "react-hook-form";
import type { ZodTypeAny } from "zod";

import { Button } from "@/ui/components/Button/Button";
import type {
  CheckedMutationIssue,
  CheckedMutationResult,
} from "@/document/model/commands/checked-transactions";
import { createStableId } from "@/document/model/identity/stable-ids";
import {
  insertDirectChildSettingsItemChecked,
  readDirectChildSettingsItems,
  removeDirectChildSettingsItemChecked,
  updateDirectChildSettingsItemChecked,
} from "@/document/model/commands/content-collections";
import type {
  SettingsSheetDirectChildCollectionDescriptor,
  SettingsSheetFieldDescriptor,
} from "@/editor/configuration/settings-sheet";
import type {
  AuthoringNodeTarget,
  ResolvedAuthoringNode,
} from "@/editor/prosemirror/authoring-target";

import { FieldRenderer } from "./FieldRenderer";
import { ControlledImageField } from "./fields/ImageField";
import { ControlledRichTextField } from "./fields/RichTextField";
import type { SettingsFieldDocumentTarget } from "./fields/types";

import "../sheets/configuration-settings-sheet.css";

interface CollectionTarget {
  ownerId: string;
  ownerNodeType: string;
  childNodeType: string;
  attr: string;
  schema: ZodTypeAny;
}

export interface DirectChildCollectionFieldProps {
  descriptor: SettingsSheetDirectChildCollectionDescriptor;
  target: AuthoringNodeTarget;
}

export function DirectChildCollectionField({
  descriptor,
  target,
}: DirectChildCollectionFieldProps) {
  const documentRevision = target.editor.state.doc;
  const resolved = target.read();
  const collectionTarget = resolved ? resolveCollectionTarget(resolved, descriptor) : null;
  const result = collectionTarget?.ok
    ? readDirectChildSettingsItems({ doc: target.editor.state.doc, ...collectionTarget.target })
    : {
        ok: false as const,
        issue:
          collectionTarget?.issue ??
          ({
            code: `${target.status}_authoring_target`,
            message: "The collection owner is no longer available.",
          } satisfies CheckedMutationIssue),
      };
  const [actionError, setActionError] = useState<string | null>(null);

  const mutate = (
    mutation: (
      tr: Transaction,
      currentTarget: CollectionTarget,
    ) => CheckedMutationResult<Transaction>,
  ) => {
    const checked = target.transact((tr, current) => {
      const nextTarget = resolveCollectionTarget(current, descriptor);
      return nextTarget.ok ? mutation(tr, nextTarget.target) : nextTarget;
    });
    if (!checked.ok) {
      setActionError(checked.issue.message);
      return false;
    }
    setActionError(null);
    return true;
  };

  if (!result.ok) {
    return (
      <p className="sc-settings-collection__error" role="alert">
        {result.issue.message}
      </p>
    );
  }

  return (
    <div className="sc-settings-collection">
      <div className="sc-settings-collection__items">
        {result.items.map((item, index) => {
          const label = collectionItemLabel(descriptor, index);
          return (
            <div
              key={item.id}
              className="sc-settings-collection__item"
              role="group"
              aria-label={label}
            >
              <div className="sc-settings-collection__item-header">
                <span className="sc-settings-collection__item-label">{label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${label}`}
                  onClick={() =>
                    mutate((tr, currentTarget) =>
                      removeDirectChildSettingsItemChecked({
                        tr,
                        ...currentTarget,
                        childId: item.id,
                      }),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
              <CollectionItemFields
                descriptor={descriptor}
                documentRevision={documentRevision}
                itemId={item.id}
                itemValue={item.value}
                target={target}
                onError={setActionError}
              />
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          mutate((tr, currentTarget) =>
            insertDirectChildSettingsItemChecked({
              tr,
              ...currentTarget,
              childId: createStableId(),
              value: descriptor.initialValue,
            }),
          )
        }
      >
        {descriptor.addLabel}
      </Button>
      {actionError ? (
        <p className="sc-settings-collection__error" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

function CollectionItemFields({
  descriptor,
  documentRevision,
  itemId,
  itemValue,
  onError,
  target,
}: {
  descriptor: SettingsSheetDirectChildCollectionDescriptor;
  documentRevision: unknown;
  itemId: string;
  itemValue: unknown;
  onError: (error: string | null) => void;
  target: AuthoringNodeTarget;
}) {
  const documentTarget = useMemo<SettingsFieldDocumentTarget>(
    () => ({
      editor: target.editor,
      readField(name) {
        return getValueAtPath(readCurrentItem(target, descriptor, itemId), name);
      },
      writeField(name, nextValue) {
        const checked = target.transact((tr, resolved) => {
          const collectionTarget = resolveCollectionTarget(resolved, descriptor);
          if (!collectionTarget.ok) return collectionTarget;
          const current = readCurrentItemFromDocument(tr.doc, collectionTarget.target, itemId);
          if (current === undefined) {
            return {
              ok: false,
              issue: {
                code: "missing_collection_child",
                message: `Collection child "${itemId}" was not found.`,
              },
            };
          }
          return updateDirectChildSettingsItemChecked({
            tr,
            ...collectionTarget.target,
            childId: itemId,
            value: setValueAtPath(current, name, nextValue),
          });
        });
        if (!checked.ok) {
          onError(checked.issue.message);
          return false;
        }
        onError(null);
        return true;
      },
    }),
    [descriptor, itemId, onError, target],
  );
  const form = useForm<FieldValues>({ defaultValues: toFieldValues(itemValue) });

  useEffect(() => {
    form.reset(toFieldValues(itemValue));
  }, [documentRevision, form, itemValue]);

  return (
    <FormProvider {...form}>
      <div className="sc-settings-collection__fields">
        {descriptor.fields.map((field) => {
          if (field.kind === "image") {
            return (
              <ControlledImageField
                key={field.name}
                descriptor={field}
                idScope={itemId}
                value={getValueAtPath(itemValue, field.name)}
                onChange={(next) => documentTarget.writeField(field.name, next)}
              />
            );
          }
          if (field.kind === "richText") {
            return (
              <ControlledRichTextField
                key={field.name}
                descriptor={field}
                documentRevision={documentRevision}
                documentTarget={documentTarget}
              />
            );
          }
          return (
            <ImmediateScalarField
              key={field.name}
              descriptor={field}
              documentTarget={documentTarget}
              form={form}
            />
          );
        })}
      </div>
    </FormProvider>
  );
}

function ImmediateScalarField({
  descriptor,
  documentTarget,
  form,
}: {
  descriptor: SettingsSheetFieldDescriptor;
  documentTarget: SettingsFieldDocumentTarget;
  form: ReturnType<typeof useForm<FieldValues>>;
}) {
  const value = useWatch({ control: form.control, name: descriptor.name });

  useEffect(() => {
    if (sameValue(value, documentTarget.readField(descriptor.name))) return;
    documentTarget.writeField(descriptor.name, value);
  }, [descriptor.name, documentTarget, value]);

  return <FieldRenderer descriptor={descriptor} />;
}

function readCurrentItem(
  target: AuthoringNodeTarget,
  descriptor: SettingsSheetDirectChildCollectionDescriptor,
  itemId: string,
): unknown {
  const resolved = target.read();
  if (!resolved) return undefined;
  const collectionTarget = resolveCollectionTarget(resolved, descriptor);
  if (!collectionTarget.ok) return undefined;
  return readCurrentItemFromDocument(target.editor.state.doc, collectionTarget.target, itemId);
}

function readCurrentItemFromDocument(
  doc: Transaction["doc"],
  target: CollectionTarget,
  itemId: string,
): unknown {
  const result = readDirectChildSettingsItems({ doc, ...target });
  return result.ok ? result.items.find((item) => item.id === itemId)?.value : undefined;
}

function resolveCollectionTarget(
  resolved: ResolvedAuthoringNode,
  descriptor: SettingsSheetDirectChildCollectionDescriptor,
): { ok: true; target: CollectionTarget } | { ok: false; issue: CheckedMutationIssue } {
  const ownerId = resolved.node.attrs["id"];
  if (typeof ownerId !== "string") {
    return {
      ok: false,
      issue: {
        code: "missing_collection_owner_id",
        message: "The collection owner has no stable id.",
      },
    };
  }
  return {
    ok: true,
    target: {
      ownerId,
      ownerNodeType: resolved.node.type.name,
      childNodeType: descriptor.childNodeType,
      attr: descriptor.attr,
      schema: descriptor.schema,
    },
  };
}

function collectionItemLabel(
  descriptor: SettingsSheetDirectChildCollectionDescriptor,
  index: number,
): string {
  if (descriptor.referenceStyle !== "lower-alpha") return `${descriptor.itemLabel} ${index + 1}`;
  return `${descriptor.itemLabel} (${lowerAlphaReference(index)})`;
}

function lowerAlphaReference(index: number): string {
  let remaining = index + 1;
  let value = "";
  while (remaining > 0) {
    remaining -= 1;
    value = String.fromCharCode(97 + (remaining % 26)) + value;
    remaining = Math.floor(remaining / 26);
  }
  return value;
}

function toFieldValues(value: unknown): FieldValues {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FieldValues) : {};
}

function getValueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }, value);
}

function setValueAtPath(value: unknown, path: string, nextValue: unknown): unknown {
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  const segments = path.split(".");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    const next =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    current[segment] = next;
    current = next;
  }
  const leaf = segments.at(-1);
  if (leaf) current[leaf] = nextValue;
  return root;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
