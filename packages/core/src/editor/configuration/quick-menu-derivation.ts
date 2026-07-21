import {
  getConfigurationControlDescriptorId,
  type ConfigurationDefinition,
  type ConfigurationControlDescriptor,
} from "./definition";
import type { QuickControlDescriptor, QuickMenuDefinition } from "./quick-menu";

export function deriveQuickMenuDefinition(
  configuration: ConfigurationDefinition | undefined,
): QuickMenuDefinition | undefined {
  if (!configuration) return undefined;

  const controls = Object.freeze(
    configuration.controls
      .filter((control) => control.placement?.quickMenu)
      .map((control, index) => ({ control, index }))
      .sort((left, right) => {
        const leftOrder = left.control.placement?.quickMenu?.order ?? left.index;
        const rightOrder = right.control.placement?.quickMenu?.order ?? right.index;
        return leftOrder - rightOrder;
      })
      .map(({ control }) => toQuickMenuControl(control)),
  );

  if (controls.length === 0) return undefined;

  return Object.freeze({
    attr: configuration.attr,
    schema: configuration.schema,
    controls,
  });
}

function toQuickMenuControl(control: ConfigurationControlDescriptor): QuickControlDescriptor {
  switch (control.kind) {
    case "boolean":
      return Object.freeze({
        kind: "boolean",
        name: control.name,
        label: control.label,
        ...(control.icon ? { icon: control.icon } : {}),
        ...(control.placement?.quickMenu?.presentation === "icon-toggle"
          ? { presentation: "icon-toggle" }
          : {}),
      });
    case "select": {
      const presentation = control.placement?.quickMenu?.presentation;
      return Object.freeze({
        kind: "select",
        name: control.name,
        label: control.label,
        ...(control.options ? { options: control.options } : {}),
        ...(presentation === "menu" || presentation === "segmented" ? { presentation } : {}),
      });
    }
    case "number":
      return Object.freeze({
        kind: "number",
        name: control.name,
        label: control.label,
        ...(control.min === undefined ? {} : { min: control.min }),
        ...(control.max === undefined ? {} : { max: control.max }),
        ...(control.step === undefined ? {} : { step: control.step }),
      });
    case "color":
      return Object.freeze({
        kind: "color",
        name: control.name,
        label: control.label,
        ...(control.pickerLabel ? { pickerLabel: control.pickerLabel } : {}),
        ...(control.labelSuffix ? { labelSuffix: control.labelSuffix } : {}),
        ...(control.resetLabel ? { resetLabel: control.resetLabel } : {}),
        ...(control.resetAriaLabel ? { resetAriaLabel: control.resetAriaLabel } : {}),
        ...(control.customHint ? { customHint: control.customHint } : {}),
      });
    case "text":
    case "textarea":
    case "multiSelect":
    case "dataGrid":
    case "image":
    case "richText":
      throw new Error(
        `Configuration control "${getConfigurationControlDescriptorId(control)}" cannot be placed in the quick menu.`,
      );
  }
}
