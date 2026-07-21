import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import type { Transaction } from "@tiptap/pm/state";
import type { FieldPath, FieldValues } from "react-hook-form";
import type { ZodTypeAny } from "zod";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import type { ResolvedStableNode } from "@/document/model/identity/resolve-stable-node";

export type SettingsSheetAttrSurface = "data" | "settings" | "options";
export type SettingsSheetFieldName = FieldPath<FieldValues>;

export interface SettingsSheetSelectOption {
  value: string;
  label: string;
  icon?: Icon;
}

export interface SettingsSheetVisibleWhen {
  name: SettingsSheetFieldName;
  equals?: unknown;
  oneOf?: readonly unknown[];
}

export type SettingsSheetDataGridColumnType = "number" | "text";

export interface SettingsSheetDataGridColumnsOptionSource {
  kind: "dataGridColumns";
  name: SettingsSheetFieldName;
  columnTypes?: readonly SettingsSheetDataGridColumnType[];
}

export type SettingsSheetOptionSource = SettingsSheetDataGridColumnsOptionSource;

export interface SettingsSheetApplyInput {
  tr: Transaction;
  target: ResolvedStableNode;
  attr: SettingsSheetAttrSurface;
  /** Persisted schema for the configured node attr. */
  schema: ZodTypeAny;
  /** Optional form draft schema when it differs from the persisted attr. */
  editSchema?: ZodTypeAny;
  value: unknown;
}

export type SettingsSheetApply = (
  input: SettingsSheetApplyInput,
) => CheckedMutationResult<Transaction>;

export type SettingsSheetDraftTransform = (raw: unknown) => unknown;

interface SettingsSheetFieldBase {
  name: SettingsSheetFieldName;
  label: string;
  description?: ReactNode;
  disabledReason?: ReactNode;
  disabledHint?: ReactNode;
  visibleWhen?: SettingsSheetVisibleWhen;
}

export interface SettingsSheetTextFieldDescriptor extends SettingsSheetFieldBase {
  kind: "text";
  placeholder?: string;
}

export interface SettingsSheetTextareaFieldDescriptor extends SettingsSheetFieldBase {
  kind: "textarea";
  placeholder?: string;
  rows?: number;
}

export interface SettingsSheetNumberFieldDescriptor extends SettingsSheetFieldBase {
  kind: "number";
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  emptyValue?: null | undefined;
}

export interface SettingsSheetBooleanFieldDescriptor extends SettingsSheetFieldBase {
  kind: "boolean";
  presentation?: "checkbox" | "switch";
}

export interface SettingsSheetSelectFieldDescriptor extends SettingsSheetFieldBase {
  kind: "select";
  options?: readonly SettingsSheetSelectOption[];
  optionsSource?: SettingsSheetOptionSource;
  placeholder?: string;
}

export interface SettingsSheetMultiSelectFieldDescriptor extends SettingsSheetFieldBase {
  kind: "multiSelect";
  options?: readonly SettingsSheetSelectOption[];
  optionsSource?: SettingsSheetOptionSource;
}

export interface SettingsSheetDataGridFieldDescriptor extends SettingsSheetFieldBase {
  kind: "dataGrid";
  ariaLabel?: string;
}

export interface SettingsSheetImageFieldDescriptor extends SettingsSheetFieldBase {
  kind: "image";
  mediaStorage: "canonical" | "url";
  positioning?: "crop";
  chooseLabel?: string;
  changeLabel?: string;
  removeLabel?: string;
  emptyLabel?: string;
  previewLabel?: string;
  pickerTitle?: string;
  altLabel?: string;
  altPlaceholder?: string;
}

export interface SettingsSheetRichTextFieldDescriptor extends SettingsSheetFieldBase {
  kind: "richText";
  placeholder?: string;
}

export interface SettingsSheetDirectChildCollectionDescriptor {
  id: string;
  childNodeType: string;
  attr: string;
  schema: ZodTypeAny;
  initialValue: unknown;
  itemLabel: string;
  addLabel: string;
  referenceStyle?: "lower-alpha";
  fields: readonly SettingsSheetFieldDescriptor[];
}

export type SettingsSheetFieldDescriptor =
  | SettingsSheetTextFieldDescriptor
  | SettingsSheetTextareaFieldDescriptor
  | SettingsSheetNumberFieldDescriptor
  | SettingsSheetBooleanFieldDescriptor
  | SettingsSheetSelectFieldDescriptor
  | SettingsSheetMultiSelectFieldDescriptor
  | SettingsSheetDataGridFieldDescriptor
  | SettingsSheetImageFieldDescriptor
  | SettingsSheetRichTextFieldDescriptor;

export interface SettingsSheetSection {
  id: string;
  title: string;
  description?: ReactNode;
  fields: readonly SettingsSheetFieldDescriptor[];
  collections?: readonly SettingsSheetDirectChildCollectionDescriptor[];
}

export interface SettingsSheetDefinition {
  attr: SettingsSheetAttrSurface;
  /** Persisted schema for the configured node attr. */
  schema: ZodTypeAny;
  /** Optional form draft schema when it differs from the persisted attr. */
  editSchema?: ZodTypeAny;
  createInitialDraft?: () => unknown;
  toDraft?: SettingsSheetDraftTransform;
  apply?: SettingsSheetApply;
  title: string;
  description?: string;
  sections: readonly SettingsSheetSection[];
  defaultOpenSections?: readonly string[];
}

export type NodeSettingsSheetDefinition = SettingsSheetDefinition & {
  /** Tiptap node name this settings sheet applies to. */
  nodeType: string;
};
