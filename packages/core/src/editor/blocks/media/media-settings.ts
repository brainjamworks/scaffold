import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import type { ResolvedStableNode } from "@/document/model/identity/resolve-stable-node";
import type { SettingsSheetApply } from "@/editor/configuration/settings-sheet";
import type { Transaction } from "@tiptap/pm/state";
import {
  AudioBlockAttrsSchema,
  ImageBlockAttrsSchema,
  type AudioBlockAttrs,
  type ImageBlockAttrs,
} from "@scaffold/contracts";

import { parseAudioBlockData } from "./AudioBlockModel";
import { parseImageBlockData } from "./ImageBlockModel";

export const applyImageAccessibilitySettings: SettingsSheetApply = (input) => {
  const current = parseImageBlockData(input.target.node.attrs[input.attr]);
  if (!current) return failure("missing_image_data", "Add an image before editing alt text.");

  return writeMediaData({
    tr: input.tr,
    target: input.target,
    attr: input.attr,
    schema: ImageBlockAttrsSchema,
    value: {
      ...current,
      alt: readStringProperty(input.value, "alt"),
    },
  });
};

export const applyAudioAccessibilitySettings: SettingsSheetApply = (input) => {
  const current = parseAudioBlockData(input.target.node.attrs[input.attr]);
  if (!current) return failure("missing_audio_data", "Add audio before editing the title.");

  return writeMediaData({
    tr: input.tr,
    target: input.target,
    attr: input.attr,
    schema: AudioBlockAttrsSchema,
    value: {
      ...current,
      title: readStringProperty(input.value, "title"),
    },
  });
};

function writeMediaData({
  tr,
  target,
  attr,
  schema,
  value,
}: {
  tr: Transaction;
  target: ResolvedStableNode;
  attr: string;
  schema: typeof ImageBlockAttrsSchema | typeof AudioBlockAttrsSchema;
  value: ImageBlockAttrs | AudioBlockAttrs;
}) {
  const nodeId = target.node.attrs["id"];
  if (typeof nodeId !== "string") {
    return failure("missing_media_target_id", "The media target has no stable id.");
  }
  const checked = updateNodeSettingsChecked({
    tr,
    nodeId,
    nodeType: target.node.type.name,
    attr,
    schema,
    value,
  });
  return checked;
}

function readStringProperty(value: unknown, name: string): string {
  if (!value || typeof value !== "object") return "";
  const next = (value as Record<string, unknown>)[name];
  return typeof next === "string" ? next : "";
}

function failure(code: string, message: string): CheckedMutationResult<never> {
  return { ok: false, issue: { code, message } };
}
