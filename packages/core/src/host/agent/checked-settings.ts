import type { Transform } from "@tiptap/pm/transform";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

type UpdateRegisteredNodeSettingsCheckedInput<TTransform extends Transform> = {
  tr: TTransform;
  nodeId: string;
  nodeType: string;
  value: unknown;
};

export function updateRegisteredNodeSettingsChecked<TTransform extends Transform>({
  tr,
  nodeId,
  nodeType,
  value,
}: UpdateRegisteredNodeSettingsCheckedInput<TTransform>): CheckedMutationResult<TTransform> {
  const entry = builtInBlockRegistry.getByNodeType(nodeType)?.settingsSheet;
  if (!entry) {
    return {
      ok: false,
      issue: {
        code: "missing_settings_configuration",
        message: `No settings sheet is registered for "${nodeType}".`,
      },
    };
  }

  return updateNodeSettingsChecked({
    tr,
    nodeId,
    nodeType,
    attr: entry.attr,
    schema: entry.schema,
    value,
  });
}
