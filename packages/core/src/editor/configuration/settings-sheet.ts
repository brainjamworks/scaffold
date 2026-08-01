import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import type { Transaction } from "@tiptap/pm/state";
import type { FieldPath, FieldValues } from "react-hook-form";
import type { ZodTypeAny } from "zod";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import type { ResolvedStableNode } from "@/document/model/identity/resolve-stable-node";
import type { ButtonVariant } from "@/ui/components/Button/Button";
import type { PillVariant } from "@/ui/components/Pill/Pill";

export type SettingsSheetAttrSurface = "data" | "settings" | "options";
export type SettingsSheetFieldName = FieldPath<FieldValues>;

export interface SettingsSheetSelectOption {
  value: string;
  label: string;
  ariaLabel?: string;
  description?: string;
  icon?: Icon;
  swatches?: readonly string[];
}

export interface SettingsSheetFieldStatus {
  label: string;
  variant?: PillVariant;
}

export interface SettingsSheetColorOption {
  value: string;
  label: string;
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
  status?: SettingsSheetFieldStatus;
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
  presentation?: "cards" | "menu" | "segmented";
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

export interface SettingsSheetColorFieldDescriptor extends SettingsSheetFieldBase {
  kind: "color";
  palette: readonly SettingsSheetColorOption[];
  fallbackColor: string;
  pickerLabel?: string;
  labelSuffix?: string;
  resetValue?: string;
  resetLabel?: string;
  resetAriaLabel?: string;
  customHint?: string;
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
  kind: "directChildCollection";
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
  | SettingsSheetColorFieldDescriptor
  | SettingsSheetImageFieldDescriptor
  | SettingsSheetRichTextFieldDescriptor;

export type SettingsFormFieldDescriptor = SettingsSheetFieldDescriptor;
export type SettingsFormItemDescriptor =
  | SettingsFormFieldDescriptor
  | SettingsSheetDirectChildCollectionDescriptor;

export interface SettingsFormAction<TActionId extends string = string> {
  id: TActionId;
  label: string;
  ariaLabel?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
}

export interface SettingsFormActionEvent<TActionId extends string = string> {
  actionId: TActionId;
  sectionId?: string;
}

export interface SettingsFormSection<TActionId extends string = string> {
  id: string;
  title: string;
  description?: ReactNode;
  items: readonly SettingsFormItemDescriptor[];
  actions?: readonly SettingsFormAction<TActionId>[];
}

/**
 * Presentation-only contract for a declarative settings form.
 *
 * The owner supplies the form state and validation. Persistence and container
 * lifecycle are intentionally outside this definition.
 */
export interface SettingsFormDefinition<TActionId extends string = string> {
  sections: readonly SettingsFormSection<TActionId>[];
  defaultOpenSections?: readonly string[];
  footerActions?: readonly SettingsFormAction<TActionId>[];
}

export interface SettingsSheetDefinition extends SettingsFormDefinition {
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
}

export type NodeSettingsSheetDefinition = SettingsSheetDefinition & {
  /** Tiptap node name this settings sheet applies to. */
  nodeType: string;
};
