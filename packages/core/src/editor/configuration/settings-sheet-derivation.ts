import type {
  ConfigurationDirectChildCollectionDescriptor,
  ConfigurationDefinition,
  ConfigurationControlDescriptor,
  ConfigurationControlPlacement,
  ConfigurationSheetPlacement,
} from "./definition";
import type {
  SettingsSheetDefinition,
  SettingsSheetDirectChildCollectionDescriptor,
  SettingsSheetFieldDescriptor,
} from "./settings-sheet";

export function deriveSettingsSheetDefinition(
  configuration: ConfigurationDefinition | undefined,
): SettingsSheetDefinition | undefined {
  const sheet = configuration?.sheet;
  if (!configuration || !sheet) return undefined;

  const sections = Object.freeze(
    sheet.sections.map((section) => {
      const placedControls = configuration.controls
        .filter(isSheetControlInSection(section.id))
        .map((control, index) => ({
          type: "field" as const,
          descriptor: control,
          order: control.placement.sheet.order ?? index,
          declarationIndex: index,
        }));
      const placedCollections = (configuration.collections ?? [])
        .filter(isCollectionInSection(section.id))
        .map((collection, index) => ({
          type: "collection" as const,
          descriptor: collection,
          order: collection.placement.sheet?.order ?? configuration.controls.length + index,
          declarationIndex: configuration.controls.length + index,
        }));
      const items = Object.freeze(
        [...placedControls, ...placedCollections]
          .sort(
            (left, right) =>
              left.order - right.order || left.declarationIndex - right.declarationIndex,
          )
          .map((item) =>
            item.type === "field"
              ? toSettingsSheetField(item.descriptor)
              : toSettingsSheetCollection(item.descriptor),
          ),
      );

      return Object.freeze({
        id: section.id,
        title: section.title,
        ...(section.description ? { description: section.description } : {}),
        items,
      });
    }),
  );

  return Object.freeze({
    attr: configuration.attr,
    schema: configuration.schema,
    ...(configuration.editSchema ? { editSchema: configuration.editSchema } : {}),
    ...(configuration.createInitialDraft
      ? { createInitialDraft: configuration.createInitialDraft }
      : {}),
    ...(configuration.toDraft ? { toDraft: configuration.toDraft } : {}),
    ...(configuration.apply ? { apply: configuration.apply } : {}),
    title: sheet.title,
    ...(sheet.description ? { description: sheet.description } : {}),
    sections,
    ...(sheet.defaultOpenSections ? { defaultOpenSections: sheet.defaultOpenSections } : {}),
  });
}

function isCollectionInSection(sectionId: string) {
  return (collection: ConfigurationDirectChildCollectionDescriptor): boolean =>
    collection.placement.sheet?.section === sectionId;
}

function toSettingsSheetCollection(
  collection: ConfigurationDirectChildCollectionDescriptor,
): SettingsSheetDirectChildCollectionDescriptor {
  return Object.freeze({
    kind: "directChildCollection" as const,
    id: collection.id,
    childNodeType: collection.childNodeType,
    attr: collection.attr,
    schema: collection.schema,
    initialValue: collection.initialValue,
    itemLabel: collection.itemLabel,
    addLabel: collection.addLabel,
    ...(collection.referenceStyle ? { referenceStyle: collection.referenceStyle } : {}),
    fields: Object.freeze(collection.fields.map(toSettingsSheetField)),
  });
}

type ConfigurationSheetControl = ConfigurationControlDescriptor & {
  placement: ConfigurationControlPlacement & {
    sheet: ConfigurationSheetPlacement;
  };
};

function isSheetControlInSection(sectionId: string) {
  return (control: ConfigurationControlDescriptor): control is ConfigurationSheetControl =>
    control.placement?.sheet?.section === sectionId;
}

function toSettingsSheetField(
  control: ConfigurationControlDescriptor,
): SettingsSheetFieldDescriptor {
  const base = {
    name: control.name,
    label: control.label,
    ...(control.description ? { description: control.description } : {}),
    ...(control.visibleWhen ? { visibleWhen: control.visibleWhen } : {}),
  };

  switch (control.kind) {
    case "text":
      return Object.freeze({
        ...base,
        kind: "text",
        ...(control.placeholder ? { placeholder: control.placeholder } : {}),
      });
    case "textarea":
      return Object.freeze({
        ...base,
        kind: "textarea",
        ...(control.placeholder ? { placeholder: control.placeholder } : {}),
        ...(control.rows === undefined ? {} : { rows: control.rows }),
      });
    case "number":
      return Object.freeze({
        ...base,
        kind: "number",
        ...(control.min === undefined ? {} : { min: control.min }),
        ...(control.max === undefined ? {} : { max: control.max }),
        ...(control.step === undefined ? {} : { step: control.step }),
        ...(control.integer === undefined ? {} : { integer: control.integer }),
        ...(control.emptyValue === undefined ? {} : { emptyValue: control.emptyValue }),
      });
    case "boolean":
      return Object.freeze({
        ...base,
        kind: "boolean",
        ...(control.presentation ? { presentation: control.presentation } : {}),
      });
    case "select":
      return Object.freeze({
        ...base,
        kind: "select",
        ...(control.options ? { options: control.options } : {}),
        ...(control.optionsSource ? { optionsSource: control.optionsSource } : {}),
        ...(control.placeholder ? { placeholder: control.placeholder } : {}),
        ...(control.presentation ? { presentation: control.presentation } : {}),
      });
    case "multiSelect":
      return Object.freeze({
        ...base,
        kind: "multiSelect",
        ...(control.options ? { options: control.options } : {}),
        ...(control.optionsSource ? { optionsSource: control.optionsSource } : {}),
      });
    case "dataGrid":
      return Object.freeze({
        ...base,
        kind: "dataGrid",
        ...(control.ariaLabel ? { ariaLabel: control.ariaLabel } : {}),
      });
    case "image":
      return Object.freeze({
        ...base,
        kind: "image",
        mediaStorage: control.mediaStorage,
        ...(control.positioning ? { positioning: control.positioning } : {}),
        ...(control.chooseLabel ? { chooseLabel: control.chooseLabel } : {}),
        ...(control.changeLabel ? { changeLabel: control.changeLabel } : {}),
        ...(control.removeLabel ? { removeLabel: control.removeLabel } : {}),
        ...(control.emptyLabel ? { emptyLabel: control.emptyLabel } : {}),
        ...(control.previewLabel ? { previewLabel: control.previewLabel } : {}),
        ...(control.pickerTitle ? { pickerTitle: control.pickerTitle } : {}),
        ...(control.altLabel ? { altLabel: control.altLabel } : {}),
        ...(control.altPlaceholder ? { altPlaceholder: control.altPlaceholder } : {}),
      });
    case "richText":
      return Object.freeze({
        ...base,
        kind: "richText",
        ...(control.placeholder ? { placeholder: control.placeholder } : {}),
      });
    case "color": {
      if (!control.palette || !control.fallbackColor) {
        throw new Error(
          `Configuration control "name:${control.name}" requires a palette and fallback colour in the settings sheet.`,
        );
      }
      return Object.freeze({
        ...base,
        kind: "color",
        palette: control.palette,
        fallbackColor: control.fallbackColor,
        ...(control.pickerLabel ? { pickerLabel: control.pickerLabel } : {}),
        ...(control.labelSuffix ? { labelSuffix: control.labelSuffix } : {}),
        ...(control.resetValue === undefined ? {} : { resetValue: control.resetValue }),
        ...(control.resetLabel ? { resetLabel: control.resetLabel } : {}),
        ...(control.resetAriaLabel ? { resetAriaLabel: control.resetAriaLabel } : {}),
        ...(control.customHint ? { customHint: control.customHint } : {}),
      });
    }
  }
}
