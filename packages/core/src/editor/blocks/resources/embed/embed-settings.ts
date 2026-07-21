import { EmbedDataSchema } from "@scaffold/contracts";

import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import type { SettingsSheetApply } from "@/editor/configuration/settings-sheet";

import { normalizeEmbedSettingsUpdate } from "./embed-data";

export const applyEmbedSettings: SettingsSheetApply = ({ tr, target, attr, value }) => {
  const next = normalizeEmbedSettingsUpdate({
    current: target.node.attrs[attr],
    next: value,
  });
  const nodeId = target.node.attrs["id"];
  if (typeof nodeId !== "string") {
    return {
      ok: false,
      issue: { code: "missing_embed_target_id", message: "The embed target has no stable id." },
    };
  }

  const checked = updateNodeSettingsChecked({
    tr,
    nodeId,
    nodeType: target.node.type.name,
    attr,
    schema: EmbedDataSchema,
    value: next,
  });
  return checked;
};
