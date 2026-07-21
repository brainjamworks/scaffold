import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { FieldPath, FieldValues } from "react-hook-form";
import type { ZodTypeAny } from "zod";

import type {
  SettingsSheetApply,
  SettingsSheetDraftTransform,
  SettingsSheetOptionSource,
  SettingsSheetSelectOption,
  SettingsSheetVisibleWhen,
} from "./settings-sheet";
import type { QuickMenuSelectOption } from "./quick-menu";

export type ConfigurationAttrSurface = "data" | "settings" | "options";
export type ConfigurationControlName = FieldPath<FieldValues>;

export interface ConfigurationQuickMenuPlacement {
  presentation?: "icon-toggle" | "menu" | "segmented";
  order?: number;
}

export interface ConfigurationSheetPlacement {
  section: string;
  order?: number;
}

export interface ConfigurationControlPlacement {
  quickMenu?: ConfigurationQuickMenuPlacement;
  sheet?: ConfigurationSheetPlacement;
}

interface ConfigurationControlBase {
  label: string;
  description?: ReactNode;
}

interface ConfigurationNamedControlBase extends ConfigurationControlBase {
  name: ConfigurationControlName;
  visibleWhen?: SettingsSheetVisibleWhen;
  placement?: ConfigurationControlPlacement;
}

export interface ConfigurationTextControlDescriptor extends ConfigurationNamedControlBase {
  kind: "text";
  placeholder?: string;
}

export interface ConfigurationTextareaControlDescriptor extends ConfigurationNamedControlBase {
  kind: "textarea";
  placeholder?: string;
  rows?: number;
}

export interface ConfigurationNumberControlDescriptor extends ConfigurationNamedControlBase {
  kind: "number";
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  emptyValue?: null | undefined;
}

export interface ConfigurationBooleanControlDescriptor extends ConfigurationNamedControlBase {
  kind: "boolean";
  icon?: Icon;
  presentation?: "checkbox" | "switch";
}

export interface ConfigurationSelectControlDescriptor extends ConfigurationNamedControlBase {
  kind: "select";
  options?: readonly (SettingsSheetSelectOption & QuickMenuSelectOption)[];
  optionsSource?: SettingsSheetOptionSource;
  placeholder?: string;
}

export interface ConfigurationMultiSelectControlDescriptor extends ConfigurationNamedControlBase {
  kind: "multiSelect";
  options?: readonly SettingsSheetSelectOption[];
  optionsSource?: SettingsSheetOptionSource;
}

export interface ConfigurationDataGridControlDescriptor extends ConfigurationNamedControlBase {
  kind: "dataGrid";
  ariaLabel?: string;
}

export interface ConfigurationColorControlDescriptor extends ConfigurationNamedControlBase {
  kind: "color";
  pickerLabel?: string;
  labelSuffix?: string;
  resetLabel?: string;
  resetAriaLabel?: string;
  customHint?: string;
}

export interface ConfigurationImageControlDescriptor extends ConfigurationNamedControlBase {
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

export interface ConfigurationRichTextControlDescriptor extends ConfigurationNamedControlBase {
  kind: "richText";
  placeholder?: string;
}

export type ConfigurationDirectChildCollectionReferenceStyle = "lower-alpha";

export interface ConfigurationDirectChildCollectionDescriptor {
  id: string;
  childNodeType: string;
  attr: string;
  schema: ZodTypeAny;
  initialValue: unknown;
  itemLabel: string;
  addLabel: string;
  referenceStyle?: ConfigurationDirectChildCollectionReferenceStyle;
  placement: ConfigurationControlPlacement;
  fields: readonly ConfigurationControlDescriptor[];
}

/** Block-authored control intent before placement has been split by destination. */
export type ConfigurationControlDescriptor =
  | ConfigurationTextControlDescriptor
  | ConfigurationTextareaControlDescriptor
  | ConfigurationNumberControlDescriptor
  | ConfigurationBooleanControlDescriptor
  | ConfigurationSelectControlDescriptor
  | ConfigurationMultiSelectControlDescriptor
  | ConfigurationDataGridControlDescriptor
  | ConfigurationColorControlDescriptor
  | ConfigurationImageControlDescriptor
  | ConfigurationRichTextControlDescriptor;

export interface ConfigurationSheetSection {
  id: string;
  title: string;
  description?: ReactNode;
}

export interface ConfigurationSheetDefinition {
  title: string;
  description?: string;
  sections: readonly ConfigurationSheetSection[];
  defaultOpenSections?: readonly string[];
}

export interface ConfigurationDefinition {
  attr: ConfigurationAttrSurface;
  /**
   * Persisted schema for the configured ProseMirror node attr.
   *
   * Most settings surfaces edit this shape directly. Blocks with a richer form
   * draft, such as Chart, provide `editSchema` plus `toDraft` / `apply`.
   */
  schema: ZodTypeAny;
  /**
   * Optional authoring form schema when the settings UI edits a draft shape
   * that differs from the persisted attr schema.
   */
  editSchema?: ZodTypeAny;
  createInitialDraft?: () => unknown;
  toDraft?: SettingsSheetDraftTransform;
  apply?: SettingsSheetApply;
  controls: readonly ConfigurationControlDescriptor[];
  collections?: readonly ConfigurationDirectChildCollectionDescriptor[];
  sheet?: ConfigurationSheetDefinition;
}

export function defineConfiguration(definition: ConfigurationDefinition): ConfigurationDefinition {
  assertUniqueControlIds(definition.controls);
  assertCollections(definition);
  assertEditSchemaContract(definition);
  assertQuickMenuPlacements(definition.controls);
  assertSheet(definition);
  return definition;
}

export function getConfigurationControlDescriptorId(
  control: ConfigurationControlDescriptor,
): string {
  return `name:${control.name}`;
}

function assertUniqueControlIds(controls: readonly ConfigurationControlDescriptor[]): void {
  const seen = new Set<string>();

  for (const control of controls) {
    const id = getConfigurationControlDescriptorId(control);
    if (seen.has(id)) {
      throw new Error(`Duplicate configuration control descriptor "${id}".`);
    }
    seen.add(id);
  }
}

function assertEditSchemaContract(definition: ConfigurationDefinition): void {
  if (!definition.editSchema) return;
  if (!definition.toDraft || !definition.apply) {
    throw new Error("Configuration editSchema requires both toDraft and apply handlers.");
  }
  const quickMenuControl = definition.controls.find((control) => control.placement?.quickMenu);
  if (quickMenuControl) {
    const id = getConfigurationControlDescriptorId(quickMenuControl);
    throw new Error(
      `Configuration control "${id}" cannot be placed in the quick menu when editSchema is used.`,
    );
  }
}

function assertQuickMenuPlacements(controls: readonly ConfigurationControlDescriptor[]): void {
  for (const control of controls) {
    if (!control.placement?.quickMenu) continue;
    if (
      control.kind === "textarea" ||
      control.kind === "text" ||
      control.kind === "multiSelect" ||
      control.kind === "dataGrid" ||
      control.kind === "image" ||
      control.kind === "richText"
    ) {
      const id = getConfigurationControlDescriptorId(control);
      throw new Error(`Configuration control "${id}" cannot be placed in the quick menu.`);
    }
    if (control.kind === "select" && control.optionsSource) {
      const id = getConfigurationControlDescriptorId(control);
      throw new Error(
        `Configuration control "${id}" cannot use dynamic options in the quick menu.`,
      );
    }
  }
}

function assertSheet(definition: ConfigurationDefinition): void {
  const sheet = definition.sheet;
  const controls = definition.controls;
  const collections = definition.collections ?? [];
  const placedControls = controls.filter(isSheetPlacedControl);

  if (!sheet) {
    if (placedControls.length > 0) {
      const first = placedControls[0];
      const id = first ? getConfigurationControlDescriptorId(first) : "unknown";
      throw new Error(
        `Configuration control "${id}" declares sheet placement, but no sheet is configured.`,
      );
    }
    const firstCollection = collections[0];
    if (firstCollection) {
      throw new Error(
        `Configuration collection "${firstCollection.id}" declares sheet placement, but no sheet is configured.`,
      );
    }
    return;
  }

  assertUniqueSheetSections(sheet.sections);
  assertDefaultOpenSections(sheet);

  const sectionIds = new Set(sheet.sections.map((section) => section.id));
  for (const control of placedControls) {
    const section = control.placement?.sheet?.section;
    if (!section || sectionIds.has(section)) continue;
    const id = getConfigurationControlDescriptorId(control);
    throw new Error(`Configuration control "${id}" references missing sheet section "${section}".`);
  }
  for (const collection of collections) {
    const section = collection.placement.sheet?.section;
    if (section && sectionIds.has(section)) continue;
    throw new Error(
      `Configuration collection "${collection.id}" references missing sheet section "${section ?? "unknown"}".`,
    );
  }
}

function assertCollections(definition: ConfigurationDefinition): void {
  const collections = definition.collections ?? [];
  const seen = new Set<string>();

  for (const collection of collections) {
    if (seen.has(collection.id)) {
      throw new Error(`Duplicate configuration collection descriptor "${collection.id}".`);
    }
    seen.add(collection.id);

    if (collection.placement.quickMenu) {
      throw new Error(
        `Configuration collection "${collection.id}" cannot be placed in the quick menu.`,
      );
    }
    if (!collection.placement.sheet) {
      throw new Error(`Configuration collection "${collection.id}" requires sheet placement.`);
    }
    if (!collection.childNodeType || !collection.attr) {
      throw new Error(
        `Configuration collection "${collection.id}" requires a child node type and attr.`,
      );
    }
    if (!collection.schema.safeParse(collection.initialValue).success) {
      throw new Error(`Configuration collection "${collection.id}" has an invalid initial value.`);
    }

    const fieldIds = new Set<string>();
    for (const field of collection.fields) {
      if ((field as { kind: string }).kind === "collection") {
        throw new Error(
          `Configuration collection "${collection.id}" cannot contain nested collections.`,
        );
      }
      const fieldId = getConfigurationControlDescriptorId(field);
      if (field.placement) {
        throw new Error(
          `Configuration collection "${collection.id}" field "${fieldId}" cannot declare placement.`,
        );
      }
      if (fieldIds.has(fieldId)) {
        throw new Error(
          `Configuration collection "${collection.id}" has duplicate field "${fieldId}".`,
        );
      }
      fieldIds.add(fieldId);
    }
  }
}

type ConfigurationSheetPlacedControl = ConfigurationControlDescriptor & {
  placement: ConfigurationControlPlacement & {
    sheet: ConfigurationSheetPlacement;
  };
};

function isSheetPlacedControl(
  control: ConfigurationControlDescriptor,
): control is ConfigurationSheetPlacedControl {
  return Boolean(control.placement?.sheet);
}

function assertUniqueSheetSections(sections: readonly ConfigurationSheetSection[]): void {
  const seen = new Set<string>();

  for (const section of sections) {
    if (seen.has(section.id)) {
      throw new Error(`Duplicate configuration sheet section "${section.id}".`);
    }
    seen.add(section.id);
  }
}

function assertDefaultOpenSections(sheet: ConfigurationSheetDefinition): void {
  if (!sheet.defaultOpenSections) return;

  const sectionIds = new Set(sheet.sections.map((section) => section.id));
  for (const sectionId of sheet.defaultOpenSections) {
    if (sectionIds.has(sectionId)) continue;
    throw new Error(`Configuration sheet default-open section "${sectionId}" is not declared.`);
  }
}
